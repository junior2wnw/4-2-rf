export interface PermissionRequest {
  readonly channel: string;
  readonly action: string;
  readonly resource?: string;
}

export interface ParsedPermission extends PermissionRequest {
  readonly raw: string;
}

export function parsePermission(raw: string): ParsedPermission {
  const [left, resource] = raw.split(":", 2);
  const [channel, action] = (left ?? "").split(".", 2);

  if (!channel || !action) {
    throw new Error(`Invalid permission: ${raw}`);
  }

  return resource === undefined
    ? { raw, channel, action }
    : { raw, channel, action, resource };
}

export function permissionToString(request: PermissionRequest): string {
  return `${request.channel}.${request.action}${request.resource ? `:${request.resource}` : ""}`;
}

export function matchesPermission(grant: string, request: PermissionRequest): boolean {
  const parsed = parsePermission(grant);

  if (parsed.channel !== request.channel) {
    return false;
  }

  if (parsed.action !== "*" && parsed.action !== request.action) {
    return false;
  }

  if (!parsed.resource) {
    return true;
  }

  if (parsed.resource === "*") {
    return true;
  }

  return parsed.resource === request.resource;
}

export class PermissionPolicy {
  private readonly grants: Set<string>;

  constructor(grants: readonly string[]) {
    for (const grant of grants) {
      parsePermission(grant);
    }
    this.grants = new Set(grants);
  }

  list(): string[] {
    return [...this.grants].sort();
  }

  allows(request: PermissionRequest): boolean {
    return [...this.grants].some((grant) => matchesPermission(grant, request));
  }

  require(request: PermissionRequest): void {
    if (!this.allows(request)) {
      throw new Error(`Permission denied: ${permissionToString(request)}`);
    }
  }
}
