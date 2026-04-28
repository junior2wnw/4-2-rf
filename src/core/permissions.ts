export interface PermissionRequest {
  readonly channel: string;
  readonly action: string;
  readonly resource?: string;
}

export interface ParsedPermission extends PermissionRequest {
  readonly raw: string;
}

export function parsePermission(raw: string): ParsedPermission {
  if (typeof raw !== "string" || raw.trim() !== raw || raw.length === 0 || /\s/u.test(raw)) {
    throw new Error(`Invalid permission: ${String(raw)}`);
  }

  const resourceParts = raw.split(":");
  if (resourceParts.length > 2) {
    throw new Error(`Invalid permission: ${raw}`);
  }

  const [left = "", resource] = resourceParts;
  const permissionParts = left.split(".");
  if (permissionParts.length !== 2) {
    throw new Error(`Invalid permission: ${raw}`);
  }

  const [channel = "", action = ""] = permissionParts;

  if (!channel || !action) {
    throw new Error(`Invalid permission: ${raw}`);
  }
  if (resource !== undefined && resource.length === 0) {
    throw new Error(`Invalid permission resource: ${raw}`);
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
  assertPermissionRequest(request);

  if (parsed.channel !== "*" && parsed.channel !== request.channel) {
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

export function assertPermissionRequest(request: PermissionRequest): void {
  if (!isPermissionPart(request.channel) || !isPermissionPart(request.action)) {
    throw new Error(`Invalid permission request: ${permissionToString(request)}`);
  }
  if (request.resource !== undefined && request.resource.length === 0) {
    throw new Error(`Invalid permission request resource: ${permissionToString(request)}`);
  }
}

export function assertPermissionSubset(
  requested: readonly string[],
  maximum: readonly string[],
  label = "permissions"
): void {
  const maximumPolicy = new PermissionPolicy(maximum);
  for (const permission of new PermissionPolicy(requested).list()) {
    const parsed = parsePermission(permission);
    if (!maximumPolicy.allows(parsed)) {
      throw new Error(`${label} exceed the current grant: ${permission}`);
    }
  }
}

export function intersectPermissions(
  requested: readonly string[],
  maximum: readonly string[]
): string[] {
  const maximumPolicy = new PermissionPolicy(maximum);
  return new PermissionPolicy(requested)
    .list()
    .filter((permission) => maximumPolicy.allows(parsePermission(permission)));
}

function isPermissionPart(value: string): boolean {
  return typeof value === "string" && value.trim() === value && value.length > 0 && !/[.:\s]/u.test(value);
}
