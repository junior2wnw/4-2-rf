import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { Pool } from "pg";

import type {
  ChatMessage,
  ChatSession,
  ChatSessionCreate,
  InstallTokenRequest,
  KnowledgePromotion,
  KnowledgePromotionCreate,
  KnowledgePromotionListQuery,
} from "@4-2/contracts";

type SessionRow = {
  id: string;
  display_name: string;
  created_at: string;
  openai_previous_response_id: string | null;
};

type MessageRow = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

type InstallTokenRow = {
  token: string;
  platform: string;
  arch: string;
  scope: string;
  requested_by: string;
  expires_at: string;
};

type KnowledgePromotionRow = {
  id: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  source_session_id: string | null;
  source_message_id: string | null;
  scope_wing: string;
  scope_room: string;
  status: "pending" | "published" | "rejected";
  created_by: string;
  published_drawer_id: string | null;
  created_at: string;
  published_at: string | null;
};

export class Repository {
  public constructor(private readonly pool: Pool) {}

  public async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  public async createChatSession(input: ChatSessionCreate): Promise<ChatSession> {
    const id = randomUUID();
    const result = await this.pool.query<SessionRow>(
      `
        INSERT INTO chat_sessions(id, display_name, platform, arch, user_agent)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, display_name, created_at, openai_previous_response_id
      `,
      [id, input.displayName, input.platform ?? null, input.arch ?? null, input.userAgent ?? null],
    );

    const row = firstRow(result.rows, "chat session insert returned no row");
    return mapSession(row);
  }

  public async getChatSession(id: string): Promise<(ChatSession & { previousResponseId: string | null }) | null> {
    const result = await this.pool.query<SessionRow>(
      "SELECT id, display_name, created_at, openai_previous_response_id FROM chat_sessions WHERE id = $1",
      [id],
    );

    if (!result.rowCount) {
      return null;
    }

    const row = firstRow(result.rows, "chat session select returned no row");
    return {
      ...mapSession(row),
      previousResponseId: row.openai_previous_response_id,
    };
  }

  public async listChatMessages(sessionId: string): Promise<ChatMessage[]> {
    const result = await this.pool.query<MessageRow>(
      `
        SELECT id, role, content, created_at
        FROM chat_messages
        WHERE session_id = $1
        ORDER BY created_at ASC
      `,
      [sessionId],
    );

    return result.rows.map(mapMessage);
  }

  public async hasClientMessage(sessionId: string, clientMessageId: string): Promise<boolean> {
    const result = await this.pool.query(
      `
        SELECT 1
        FROM chat_messages
        WHERE session_id = $1 AND client_message_id = $2
      `,
      [sessionId, clientMessageId],
    );

    return Boolean(result.rowCount);
  }

  public async saveMessage(input: {
    sessionId: string;
    role: "user" | "assistant" | "system";
    content: string;
    clientMessageId?: string;
    memoryContext?: unknown;
    openAiResponseId?: string;
  }): Promise<ChatMessage> {
    const result = await this.pool.query<MessageRow>(
      `
        INSERT INTO chat_messages(
          id,
          session_id,
          client_message_id,
          role,
          content,
          memory_context,
          openai_response_id
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
        RETURNING id, role, content, created_at
      `,
      [
        randomUUID(),
        input.sessionId,
        input.clientMessageId ?? null,
        input.role,
        input.content,
        input.memoryContext ? JSON.stringify(input.memoryContext) : null,
        input.openAiResponseId ?? null,
      ],
    );

    const row = firstRow(result.rows, "chat message insert returned no row");
    return mapMessage(row);
  }

  public async updateSessionResponseId(sessionId: string, previousResponseId: string): Promise<void> {
    await this.pool.query(
      `
        UPDATE chat_sessions
        SET openai_previous_response_id = $2,
            updated_at = NOW()
        WHERE id = $1
      `,
      [sessionId, previousResponseId],
    );
  }

  public async createInstallToken(input: InstallTokenRequest): Promise<{ token: string; expiresAt: string }> {
    const token = `enr_${randomBytes(24).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await this.pool.query(
      `
        INSERT INTO install_tokens(token, platform, arch, scope, requested_by, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [token, input.platform, input.arch, input.scope, input.requestedBy, expiresAt],
    );

    return { token, expiresAt };
  }

  public async createAgentRegistration(input: {
    enrollmentToken: string;
    hostname: string;
    platform: string;
    arch: string;
    scope: string;
    agentVersion: string;
    osVersion: string;
  }): Promise<{ agentId: string; heartbeatToken: string }> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const tokenRow = await client.query<InstallTokenRow>(
        `
          SELECT token, platform, arch, scope, requested_by, expires_at
          FROM install_tokens
          WHERE token = $1
            AND redeemed_at IS NULL
            AND expires_at > NOW()
          FOR UPDATE
        `,
        [input.enrollmentToken],
      );

      if (!tokenRow.rowCount) {
        throw new Error("Enrollment token is invalid or expired.");
      }

      const row = firstRow(tokenRow.rows, "install token lookup returned no row");
      if (row.platform !== input.platform || row.arch !== input.arch || row.scope !== input.scope) {
        throw new Error("Enrollment token does not match requested platform.");
      }

      const agentId = randomUUID();
      const heartbeatToken = randomBytes(24).toString("hex");
      const installedAt = new Date().toISOString();

      await client.query(
        `
          INSERT INTO agent_registrations(
            id,
            install_token,
            heartbeat_token,
            hostname,
            platform,
            arch,
            scope,
            agent_version,
            os_version,
            status,
            installed_at,
            last_seen_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'starting', $10, $10)
        `,
        [
          agentId,
          input.enrollmentToken,
          heartbeatToken,
          input.hostname,
          input.platform,
          input.arch,
          input.scope,
          input.agentVersion,
          input.osVersion,
          installedAt,
        ],
      );

      await client.query("UPDATE install_tokens SET redeemed_at = NOW() WHERE token = $1", [
        input.enrollmentToken,
      ]);
      await client.query("COMMIT");

      return { agentId, heartbeatToken };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async recordHeartbeat(input: {
    agentId: string;
    heartbeatToken: string;
    status: "starting" | "ready" | "degraded";
    installedAt: string;
  }): Promise<boolean> {
    const result = await this.pool.query(
      `
        UPDATE agent_registrations
        SET status = $3,
            installed_at = $4,
            last_seen_at = NOW()
        WHERE id = $1
          AND heartbeat_token = $2
      `,
      [input.agentId, input.heartbeatToken, input.status, input.installedAt],
    );

    return Boolean(result.rowCount);
  }

  public async createKnowledgePromotion(
    input: KnowledgePromotionCreate,
  ): Promise<{ item: KnowledgePromotion; created: boolean }> {
    const scopeWing = input.scopeWing ?? "public-playbooks";
    const scopeRoom = input.scopeRoom ?? "playbooks";
    const sourceHash = createHash("sha256")
      .update([scopeWing, scopeRoom, input.title, input.summary, input.content].join("\n"))
      .digest("hex");

    try {
      const result = await this.pool.query<KnowledgePromotionRow>(
        `
          INSERT INTO knowledge_promotions(
            id,
            source_session_id,
            source_message_id,
            title,
            summary,
            content,
            tags,
            scope_wing,
            scope_room,
            source_hash,
            status,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, 'pending', $11)
          RETURNING
            id,
            title,
            summary,
            content,
            tags,
            source_session_id,
            source_message_id,
            scope_wing,
            scope_room,
            status,
            created_by,
            published_drawer_id,
            created_at,
            published_at
        `,
        [
          randomUUID(),
          input.sourceSessionId ?? null,
          input.sourceMessageId ?? null,
          input.title,
          input.summary,
          input.content,
          JSON.stringify(input.tags ?? []),
          scopeWing,
          scopeRoom,
          sourceHash,
          input.createdBy,
        ],
      );

      return {
        item: mapKnowledgePromotion(
          firstRow(result.rows, "knowledge promotion insert returned no row"),
        ),
        created: true,
      };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      const existing = await this.pool.query<KnowledgePromotionRow>(
        `
          SELECT
            id,
            title,
            summary,
            content,
            tags,
            source_session_id,
            source_message_id,
            scope_wing,
            scope_room,
            status,
            created_by,
            published_drawer_id,
            created_at,
            published_at
          FROM knowledge_promotions
          WHERE source_hash = $1
            AND scope_wing = $2
            AND scope_room = $3
          LIMIT 1
        `,
        [sourceHash, scopeWing, scopeRoom],
      );

      return {
        item: mapKnowledgePromotion(
          firstRow(existing.rows, "knowledge promotion dedupe lookup returned no row"),
        ),
        created: false,
      };
    }
  }

  public async listKnowledgePromotions(query: KnowledgePromotionListQuery): Promise<KnowledgePromotion[]> {
    const values: unknown[] = [];
    const where: string[] = [];

    if (query.status) {
      values.push(query.status);
      where.push(`status = $${values.length}`);
    }

    values.push(query.limit);

    const result = await this.pool.query<KnowledgePromotionRow>(
      `
        SELECT
          id,
          title,
          summary,
          content,
          tags,
          source_session_id,
          source_message_id,
          scope_wing,
          scope_room,
          status,
          created_by,
          published_drawer_id,
          created_at,
          published_at
        FROM knowledge_promotions
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY created_at DESC
        LIMIT $${values.length}
      `,
      values,
    );

    return result.rows.map(mapKnowledgePromotion);
  }

  public async getKnowledgePromotion(id: string): Promise<KnowledgePromotion | null> {
    const result = await this.pool.query<KnowledgePromotionRow>(
      `
        SELECT
          id,
          title,
          summary,
          content,
          tags,
          source_session_id,
          source_message_id,
          scope_wing,
          scope_room,
          status,
          created_by,
          published_drawer_id,
          created_at,
          published_at
        FROM knowledge_promotions
        WHERE id = $1
      `,
      [id],
    );

    if (!result.rowCount) {
      return null;
    }

    return mapKnowledgePromotion(firstRow(result.rows, "knowledge promotion select returned no row"));
  }

  public async publishKnowledgePromotion(input: {
    id: string;
    publishedDrawerId: string;
  }): Promise<KnowledgePromotion | null> {
    const result = await this.pool.query<KnowledgePromotionRow>(
      `
        UPDATE knowledge_promotions
        SET status = 'published',
            published_drawer_id = $2,
            published_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          title,
          summary,
          content,
          tags,
          source_session_id,
          source_message_id,
          scope_wing,
          scope_room,
          status,
          created_by,
          published_drawer_id,
          created_at,
          published_at
      `,
      [input.id, input.publishedDrawerId],
    );

    if (!result.rowCount) {
      return null;
    }

    return mapKnowledgePromotion(
      firstRow(result.rows, "knowledge promotion publish returned no row"),
    );
  }

  public async rejectKnowledgePromotion(id: string): Promise<KnowledgePromotion | null> {
    const result = await this.pool.query<KnowledgePromotionRow>(
      `
        UPDATE knowledge_promotions
        SET status = 'rejected',
            updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          title,
          summary,
          content,
          tags,
          source_session_id,
          source_message_id,
          scope_wing,
          scope_room,
          status,
          created_by,
          published_drawer_id,
          created_at,
          published_at
      `,
      [id],
    );

    if (!result.rowCount) {
      return null;
    }

    return mapKnowledgePromotion(
      firstRow(result.rows, "knowledge promotion reject returned no row"),
    );
  }
}

function firstRow<T>(rows: T[], message: string): T {
  const row = rows[0];
  if (!row) {
    throw new Error(message);
  }
  return row;
}

function mapSession(row: SessionRow): ChatSession {
  return {
    id: row.id,
    displayName: row.display_name,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapKnowledgePromotion(row: KnowledgePromotionRow): KnowledgePromotion {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    content: row.content,
    tags: Array.isArray(row.tags) ? row.tags : [],
    sourceSessionId: row.source_session_id,
    sourceMessageId: row.source_message_id,
    scopeWing: row.scope_wing,
    scopeRoom: row.scope_room,
    status: row.status,
    createdBy: row.created_by,
    publishedDrawerId: row.published_drawer_id,
    createdAt: new Date(row.created_at).toISOString(),
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
  };
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
