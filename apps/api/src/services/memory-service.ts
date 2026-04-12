import type { MemorySearchResponse } from "@4-2/contracts";

export class MemoryService {
  public constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 2500,
  ) {}

  public async healthcheck(): Promise<boolean> {
    try {
      const response = await fetch(
        new URL("/healthz", this.baseUrl),
        this.withSignal({
          headers: this.buildHeaders(),
        }),
      );

      return response.ok;
    } catch {
      return false;
    }
  }

  public async search(input: {
    query: string;
    limit: number;
    wing?: string;
  }): Promise<MemorySearchResponse | null> {
    try {
      const response = await fetch(
        new URL("/v1/search", this.baseUrl),
        this.withSignal({
          method: "POST",
          headers: this.buildHeaders(true),
          body: JSON.stringify(input),
        }),
      );

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as MemorySearchResponse;
    } catch {
      return null;
    }
  }

  public async searchForScope(input: {
    query: string;
    scope: string;
    limit: number;
  }): Promise<MemorySearchResponse | null> {
    const [privateResult, sharedResult] = await Promise.all([
      this.search({
        query: input.query,
        limit: input.limit,
        wing: input.scope,
      }),
      this.search({
        query: input.query,
        limit: input.limit,
        wing: "public-playbooks",
      }),
    ]);

    if (!privateResult && !sharedResult) {
      return null;
    }

    const merged = [...(privateResult?.results ?? []), ...(sharedResult?.results ?? [])]
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, input.limit);

    return {
      query: input.query,
      results: merged,
    };
  }

  public async storeDrawer(input: {
    text: string;
    wing: string;
    room: string;
    sourceFile: string;
  }): Promise<{ id: string; stored: boolean } | null> {
    try {
      const response = await fetch(
        new URL("/v1/drawers", this.baseUrl),
        this.withSignal({
          method: "POST",
          headers: this.buildHeaders(true),
          body: JSON.stringify({
            text: input.text,
            wing: input.wing,
            room: input.room,
            source_file: input.sourceFile,
          }),
        }),
      );

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as { id: string; stored: boolean };
    } catch {
      return null;
    }
  }

  private buildHeaders(includeContentType = false): HeadersInit {
    return {
      accept: "application/json",
      "x-memory-sidecar-key": this.apiKey,
      ...(includeContentType ? { "content-type": "application/json" } : {}),
    };
  }

  private buildSignal(): AbortSignal | undefined {
    return this.timeoutMs > 0 ? AbortSignal.timeout(this.timeoutMs) : undefined;
  }

  private withSignal(init: RequestInit): RequestInit {
    const signal = this.buildSignal();
    return signal ? { ...init, signal } : init;
  }
}
