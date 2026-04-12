import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import type {
  AgentTask,
  ChatMessage,
  ChatSession,
  ChatSessionCreate,
  ChatSessionCreateResponse,
  InstallTokenRequest,
  KnowledgePromotion,
  KnowledgePromotionCreate,
  KnowledgePromotionListQuery,
  LinkedAgent,
} from "@4-2/contracts";

type SessionRow = {
  id: string;
  display_name: string;
  created_at: string;
  openai_previous_response_id: string | null;
  access_token: string;
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
  session_id: string | null;
};

type AgentRegistrationRow = {
  id: string;
  hostname: string;
  platform: "windows" | "macos" | "linux";
  arch: "amd64" | "arm64";
  scope: "user" | "system";
  agent_version: string;
  os_version: string;
  status: "starting" | "ready" | "degraded";
  last_seen_at: string;
  installed_at: string;
};

type AgentTaskRow = {
  id: string;
  assistant_message_id: string;
  title: string;
  summary: string;
  command: string;
  working_directory: string | null;
  shell: "powershell" | "sh";
  timeout_seconds: number;
  status: "queued" | "running" | "succeeded" | "failed" | "timed_out" | "cancelled";
  exit_code: number | null;
  stdout: string | null;
  stderr: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  assistant_content: string | null;
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

const AGENT_CONNECTED_WINDOW_MS = 2 * 60 * 1000;
const STALE_TASK_GRACE_SECONDS = 15;
const STALE_TASK_SERVER_NOTE =
  "The agent did not report completion before the server watchdog expired this task.";

export class Repository {
  public constructor(private readonly pool: Pool) {}

  public async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  public async createChatSession(input: ChatSessionCreate): Promise<ChatSessionCreateResponse> {
    const id = randomUUID();
    const accessToken = randomBytes(24).toString("hex");
    const result = await this.pool.query<SessionRow>(
      `
        INSERT INTO chat_sessions(id, display_name, platform, arch, user_agent, access_token)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, display_name, created_at, openai_previous_response_id, access_token
      `,
      [id, input.displayName, input.platform ?? null, input.arch ?? null, input.userAgent ?? null, accessToken],
    );

    const row = firstRow(result.rows, "chat session insert returned no row");
    return {
      ...mapSession(row),
      accessToken: row.access_token,
    };
  }

  public async getChatSession(
    id: string,
  ): Promise<(ChatSession & { previousResponseId: string | null }) | null> {
    const result = await this.pool.query<SessionRow>(
      `
        SELECT id, display_name, created_at, openai_previous_response_id, access_token
        FROM chat_sessions
        WHERE id = $1
      `,
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

  public async getChatSessionForAccess(
    id: string,
    accessToken: string,
  ): Promise<(ChatSession & { previousResponseId: string | null }) | null> {
    const result = await this.pool.query<SessionRow>(
      `
        SELECT id, display_name, created_at, openai_previous_response_id, access_token
        FROM chat_sessions
        WHERE id = $1
          AND access_token = $2
      `,
      [id, accessToken],
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

  public async listLinkedAgents(sessionId: string): Promise<LinkedAgent[]> {
    const result = await this.pool.query<AgentRegistrationRow>(
      `
        SELECT
          id,
          hostname,
          platform,
          arch,
          scope,
          agent_version,
          os_version,
          status,
          last_seen_at,
          installed_at
        FROM agent_registrations
        WHERE session_id = $1
        ORDER BY last_seen_at DESC
      `,
      [sessionId],
    );

    return result.rows.map(mapLinkedAgent);
  }

  public async listPendingAgentTasks(sessionId: string): Promise<AgentTask[]> {
    await this.reconcileExpiredAgentTasks();

    const result = await this.pool.query<AgentTaskRow>(
      `
        SELECT
          tasks.id,
          tasks.assistant_message_id,
          tasks.title,
          tasks.summary,
          tasks.command,
          tasks.working_directory,
          tasks.shell,
          tasks.timeout_seconds,
          tasks.status,
          tasks.exit_code,
          tasks.stdout,
          tasks.stderr,
          tasks.created_at,
          tasks.started_at,
          tasks.finished_at,
          messages.content AS assistant_content
        FROM agent_tasks AS tasks
        JOIN chat_messages AS messages
          ON messages.id = tasks.assistant_message_id
        WHERE tasks.session_id = $1
          AND tasks.status IN ('queued', 'running')
        ORDER BY tasks.created_at ASC
      `,
      [sessionId],
    );

    return result.rows.map(mapAgentTask);
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

  public async updateMessageContent(messageId: string, content: string): Promise<ChatMessage | null> {
    const result = await this.pool.query<MessageRow>(
      `
        UPDATE chat_messages
        SET content = $2
        WHERE id = $1
        RETURNING id, role, content, created_at
      `,
      [messageId, content],
    );

    if (!result.rowCount) {
      return null;
    }

    return mapMessage(firstRow(result.rows, "chat message update returned no row"));
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
        INSERT INTO install_tokens(token, platform, arch, scope, requested_by, expires_at, session_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [token, input.platform, input.arch, input.scope, input.requestedBy, expiresAt, input.sessionId ?? null],
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
          SELECT token, platform, arch, scope, requested_by, expires_at, session_id
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
            last_seen_at,
            session_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'starting', $10, $10, $11)
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
          row.session_id,
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

  public async isValidAgentHeartbeat(agentId: string, heartbeatToken: string): Promise<boolean> {
    const result = await this.pool.query(
      `
        SELECT 1
        FROM agent_registrations
        WHERE id = $1
          AND heartbeat_token = $2
      `,
      [agentId, heartbeatToken],
    );

    return Boolean(result.rowCount);
  }

  public async getReadyAgentForSession(sessionId: string): Promise<LinkedAgent | null> {
    const result = await this.pool.query<AgentRegistrationRow>(
      `
        SELECT
          id,
          hostname,
          platform,
          arch,
          scope,
          agent_version,
          os_version,
          status,
          last_seen_at,
          installed_at
        FROM agent_registrations
        WHERE session_id = $1
          AND status = 'ready'
        ORDER BY last_seen_at DESC
        LIMIT 1
      `,
      [sessionId],
    );

    if (!result.rowCount) {
      return null;
    }

    const agent = mapLinkedAgent(firstRow(result.rows, "ready agent lookup returned no row"));
    return agent.isConnected ? agent : null;
  }

  public async createAgentTask(input: {
    sessionId: string;
    agentId: string;
    assistantMessageId: string;
    title: string;
    summary: string;
    command: string;
    workingDirectory?: string | null;
    timeoutSeconds: number;
    shell: "powershell" | "sh";
  }): Promise<AgentTask> {
    const result = await this.pool.query<AgentTaskRow>(
      `
        INSERT INTO agent_tasks(
          id,
          session_id,
          agent_id,
          assistant_message_id,
          title,
          summary,
          command,
          working_directory,
          shell,
          timeout_seconds,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'queued')
        RETURNING
          id,
          assistant_message_id,
          title,
          summary,
          command,
          working_directory,
          shell,
          timeout_seconds,
          status,
          exit_code,
          stdout,
          stderr,
          created_at,
          started_at,
          finished_at,
          NULL::TEXT AS assistant_content
      `,
      [
        randomUUID(),
        input.sessionId,
        input.agentId,
        input.assistantMessageId,
        input.title,
        input.summary,
        input.command,
        input.workingDirectory ?? null,
        input.shell,
        input.timeoutSeconds,
      ],
    );

    return mapAgentTask(firstRow(result.rows, "agent task insert returned no row"));
  }

  public async claimNextAgentTask(input: {
    agentId: string;
    heartbeatToken: string;
  }): Promise<{
    id: string;
    title: string;
    summary: string;
    command: string;
    workingDirectory: string | null;
    timeoutSeconds: number;
    shell: "powershell" | "sh";
  } | null> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.reconcileExpiredAgentTasks(client);

      const auth = await client.query(
        `
          SELECT 1
          FROM agent_registrations
          WHERE id = $1
            AND heartbeat_token = $2
        `,
        [input.agentId, input.heartbeatToken],
      );

      if (!auth.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }

      const taskResult = await client.query<AgentTaskRow>(
        `
          SELECT
            id,
            assistant_message_id,
            title,
            summary,
            command,
            working_directory,
            shell,
            timeout_seconds,
            status,
            exit_code,
            stdout,
            stderr,
            created_at,
            started_at,
            finished_at,
            NULL::TEXT AS assistant_content
          FROM agent_tasks
          WHERE agent_id = $1
            AND status = 'queued'
          ORDER BY created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        `,
        [input.agentId],
      );

      if (!taskResult.rowCount) {
        await client.query("COMMIT");
        return null;
      }

      const task = firstRow(taskResult.rows, "agent task claim returned no row");

      await client.query(
        `
          UPDATE agent_tasks
          SET status = 'running',
              started_at = NOW()
          WHERE id = $1
        `,
        [task.id],
      );

      await client.query("COMMIT");

      return {
        id: task.id,
        title: task.title,
        summary: task.summary,
        command: task.command,
        workingDirectory: task.working_directory,
        timeoutSeconds: task.timeout_seconds,
        shell: task.shell,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async getAgentTaskExecutionDetails(input: {
    taskId: string;
    agentId: string;
  }): Promise<{
    title: string;
    summary: string;
    command: string;
    workingDirectory: string | null;
  } | null> {
    await this.reconcileExpiredAgentTasks();

    const result = await this.pool.query<AgentTaskRow>(
      `
        SELECT
          id,
          assistant_message_id,
          title,
          summary,
          command,
          working_directory,
          shell,
          timeout_seconds,
          status,
          exit_code,
          stdout,
          stderr,
          created_at,
          started_at,
          finished_at,
          NULL::TEXT AS assistant_content
        FROM agent_tasks
        WHERE id = $1
          AND agent_id = $2
      `,
      [input.taskId, input.agentId],
    );

    if (!result.rowCount) {
      return null;
    }

    const row = firstRow(result.rows, "agent task details returned no row");
    return {
      title: row.title,
      summary: row.summary,
      command: row.command,
      workingDirectory: row.working_directory,
    };
  }

  public async completeAgentTask(input: {
    taskId: string;
    agentId: string;
    heartbeatToken: string;
    status: "succeeded" | "failed" | "timed_out" | "cancelled";
    exitCode: number | null;
    stdout: string | null;
    stderr: string | null;
    startedAt: string;
    finishedAt: string;
    assistantContent: string;
  }): Promise<
    | (AgentTask & {
        title: string;
        summary: string;
        command: string;
        workingDirectory: string | null;
      })
    | null
  > {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const auth = await client.query(
        `
          SELECT 1
          FROM agent_registrations
          WHERE id = $1
            AND heartbeat_token = $2
        `,
        [input.agentId, input.heartbeatToken],
      );

      if (!auth.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }

      const updateTask = await client.query<AgentTaskRow>(
        `
          UPDATE agent_tasks
          SET status = $3,
              exit_code = $4,
              stdout = $5,
              stderr = $6,
              started_at = $7,
              finished_at = $8
          WHERE id = $1
            AND agent_id = $2
            AND status IN ('queued', 'running')
          RETURNING
            id,
            assistant_message_id,
            title,
            summary,
            command,
            working_directory,
            shell,
            timeout_seconds,
            status,
            exit_code,
            stdout,
            stderr,
            created_at,
            started_at,
            finished_at,
            NULL::TEXT AS assistant_content
        `,
        [
          input.taskId,
          input.agentId,
          input.status,
          input.exitCode,
          input.stdout,
          input.stderr,
          input.startedAt,
          input.finishedAt,
        ],
      );

      if (!updateTask.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }

      const task = firstRow(updateTask.rows, "agent task completion returned no row");

      await client.query(
        `
          UPDATE chat_messages
          SET content = $2
          WHERE id = $1
        `,
        [task.assistant_message_id, input.assistantContent],
      );

      await client.query("COMMIT");

      return {
        ...mapAgentTask(task),
        title: task.title,
        summary: task.summary,
        command: task.command,
        workingDirectory: task.working_directory,
        assistantContent: input.assistantContent,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async getAgentTaskForSession(sessionId: string, taskId: string): Promise<AgentTask | null> {
    await this.reconcileExpiredAgentTasks();

    const result = await this.pool.query<AgentTaskRow>(
      `
        SELECT
          tasks.id,
          tasks.assistant_message_id,
          tasks.title,
          tasks.summary,
          tasks.command,
          tasks.working_directory,
          tasks.shell,
          tasks.timeout_seconds,
          tasks.status,
          tasks.exit_code,
          tasks.stdout,
          tasks.stderr,
          tasks.created_at,
          tasks.started_at,
          tasks.finished_at,
          messages.content AS assistant_content
        FROM agent_tasks AS tasks
        JOIN chat_messages AS messages
          ON messages.id = tasks.assistant_message_id
        WHERE tasks.session_id = $1
          AND tasks.id = $2
      `,
      [sessionId, taskId],
    );

    if (!result.rowCount) {
      return null;
    }

    return mapAgentTask(firstRow(result.rows, "agent task select returned no row"));
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

  private async reconcileExpiredAgentTasks(client: Pool | PoolClient = this.pool): Promise<void> {
    const expired = await client.query<AgentTaskRow>(
      `
        WITH expired AS (
          UPDATE agent_tasks
          SET status = 'timed_out',
              exit_code = COALESCE(exit_code, -1),
              finished_at = NOW(),
              stderr = CASE
                WHEN stderr IS NULL OR stderr = '' THEN $1
                ELSE stderr || E'\\n\\n' || $1
              END
          WHERE status = 'running'
            AND started_at IS NOT NULL
            AND NOW() >= started_at + make_interval(secs => timeout_seconds + $2)
          RETURNING
            id,
            assistant_message_id,
            title,
            summary,
            command,
            working_directory,
            shell,
            timeout_seconds,
            status,
            exit_code,
            stdout,
            stderr,
            created_at,
            started_at,
            finished_at,
            NULL::TEXT AS assistant_content
        )
        SELECT
          id,
          assistant_message_id,
          title,
          summary,
          command,
          working_directory,
          shell,
          timeout_seconds,
          status,
          exit_code,
          stdout,
          stderr,
          created_at,
          started_at,
          finished_at,
          assistant_content
        FROM expired
      `,
      [STALE_TASK_SERVER_NOTE, STALE_TASK_GRACE_SECONDS],
    );

    for (const row of expired.rows) {
      await client.query(
        `
          UPDATE chat_messages
          SET content = $2
          WHERE id = $1
        `,
        [row.assistant_message_id, buildTimedOutAssistantContent(row)],
      );
    }
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

function mapLinkedAgent(row: AgentRegistrationRow): LinkedAgent {
  const lastSeenAt = new Date(row.last_seen_at).toISOString();
  return {
    id: row.id,
    hostname: row.hostname,
    platform: row.platform,
    arch: row.arch,
    scope: row.scope,
    status: row.status,
    agentVersion: row.agent_version,
    osVersion: row.os_version,
    lastSeenAt,
    linkedAt: new Date(row.installed_at).toISOString(),
    isConnected: Date.now() - new Date(lastSeenAt).getTime() <= AGENT_CONNECTED_WINDOW_MS,
  };
}

function mapAgentTask(row: AgentTaskRow): AgentTask {
  return {
    id: row.id,
    assistantMessageId: row.assistant_message_id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    exitCode: row.exit_code,
    stdout: row.stdout,
    stderr: row.stderr,
    assistantContent: row.assistant_content,
    createdAt: new Date(row.created_at).toISOString(),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
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

function buildTimedOutAssistantContent(row: AgentTaskRow): string {
  const lines = [
    `Локальная задача не завершилась вовремя: ${row.title}.`,
    row.summary,
    "",
    "Статус: timed_out",
    `Команда: ${inlineCode(row.command)}`,
  ];

  if (row.stderr?.trim()) {
    lines.push("", "stderr:", row.stderr.trim());
  }

  lines.push("", STALE_TASK_SERVER_NOTE);
  return lines.join("\n");
}

function inlineCode(value: string): string {
  return value.includes("`") ? `"${value}"` : `\`${value}\``;
}
