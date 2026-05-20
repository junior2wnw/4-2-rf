export const agentRuntimeSchema = "trustlink.agent-runtime.v1";

export const agentRuntimeCapabilityFamilies = [
  "console",
  "filesystem",
  "process",
  "service",
  "package",
  "browser",
  "desktop",
  "screen",
  "keyboard",
  "mouse",
  "clipboard",
  "network",
  "app",
  "api",
  "job",
  "artifact",
  "audio",
  "os",
  "transaction",
  "device"
] as const;

export const agentRuntimeTerminalStates = [
  "completed",
  "failed",
  "blocked",
  "waiting-confirmation",
  "running"
] as const;

export type AgentRuntimeCapabilityFamily = (typeof agentRuntimeCapabilityFamilies)[number];
export type AgentRuntimeTerminalState = (typeof agentRuntimeTerminalStates)[number];
export type AgentRuntimeRisk = "low" | "medium" | "high" | "critical";

export interface AgentRuntimeCapability {
  readonly family: AgentRuntimeCapabilityFamily | string;
  readonly actions: readonly string[];
  readonly risk: AgentRuntimeRisk;
  readonly resources?: readonly string[];
  readonly requiresConfirmation?: boolean;
  readonly proof?: readonly string[];
}

export interface AgentRuntimeManifest {
  readonly schema: typeof agentRuntimeSchema;
  readonly runtimeId: string;
  readonly entrypoint: string;
  readonly capabilities: readonly AgentRuntimeCapability[];
  readonly terminalStates: readonly AgentRuntimeTerminalState[];
  readonly jobModel: "durable-jobs";
  readonly proofModel: "structured-proof";
  readonly adapterModel: "capability-adapters";
}

export interface BuildAgentRuntimeManifestOptions {
  readonly runtimeId: string;
  readonly entrypoint?: string;
  readonly capabilities: readonly AgentRuntimeCapability[];
  readonly terminalStates?: readonly AgentRuntimeTerminalState[];
}

export function normalizeAgentRuntimeId(value: string, maxLength = 80): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, maxLength);
}

export function agentRuntimeCapabilityName(family: string, action: string): string {
  const cleanFamily = normalizeCapabilityPart(family);
  const cleanAction = normalizeCapabilityPart(action);
  if (!cleanFamily || !cleanAction) {
    throw new Error("Invalid agent runtime capability");
  }
  return `${cleanFamily}.${cleanAction}`;
}

export function agentRuntimePermission(runtimeId: string, capability: string): string {
  const cleanRuntime = normalizeAgentRuntimeId(runtimeId);
  if (!cleanRuntime || !isAgentRuntimeCapabilityName(capability)) {
    throw new Error("Invalid agent runtime permission");
  }
  return `agent.call:${cleanRuntime}/${capability}`;
}

export function assertAgentRuntimeCapabilities(capabilities: readonly AgentRuntimeCapability[], maximum = 80): void {
  if (capabilities.length > maximum) {
    throw new Error(`Too many agent runtime capabilities: ${capabilities.length}`);
  }
  for (const capability of capabilities) {
    assertCapability(capability);
  }
}

export function buildAgentRuntimeManifest(options: BuildAgentRuntimeManifestOptions): AgentRuntimeManifest {
  const runtimeId = normalizeAgentRuntimeId(options.runtimeId);
  if (!runtimeId) {
    throw new Error("Agent runtime id is required");
  }
  assertAgentRuntimeCapabilities(options.capabilities);
  return {
    schema: agentRuntimeSchema,
    runtimeId,
    entrypoint: options.entrypoint || "computer",
    capabilities: [...options.capabilities],
    terminalStates: options.terminalStates?.length ? [...options.terminalStates] : [...agentRuntimeTerminalStates],
    jobModel: "durable-jobs",
    proofModel: "structured-proof",
    adapterModel: "capability-adapters"
  };
}

export function agentRuntimeRiskForCapability(capability: string, mutates = false): AgentRuntimeRisk {
  const clean = String(capability || "").toLowerCase();
  if (/^(transaction\.(submit|send|commit|approve|cancel)|os\.(reinstall|reset|wipe|partition)|filesystem\.(delete|wipe)|device\.(poweroff|reboot))/u.test(clean)) {
    return "critical";
  }
  if (/^(app\.(write|click|type|submit)|api\.(post|put|delete|submit)|service\.(start|stop|restart)|package\.(install|remove|upgrade)|filesystem\.(write|move|copy)|browser\.(submit|download)|desktop\.(click|type)|keyboard\.send|mouse\.click)/u.test(clean)) {
    return "high";
  }
  if (mutates) {
    return "medium";
  }
  return "low";
}

export function agentRuntimeRequiresConfirmation(capability: string, risk = agentRuntimeRiskForCapability(capability)): boolean {
  if (risk === "critical") {
    return true;
  }
  return /^(transaction\.|os\.(reinstall|reset|wipe)|filesystem\.delete)/u.test(String(capability || "").toLowerCase());
}

export function defaultAgentRuntimeCapabilities(): AgentRuntimeCapability[] {
  const entries: Array<[AgentRuntimeCapabilityFamily, readonly string[], AgentRuntimeRisk, boolean?]> = [
    ["console", ["run", "script", "terminal"], "medium"],
    ["filesystem", ["read", "write", "copy", "move", "delete"], "high"],
    ["process", ["list", "start", "stop"], "medium"],
    ["service", ["status", "start", "stop", "restart"], "high"],
    ["package", ["list", "install", "remove", "upgrade"], "high"],
    ["browser", ["open", "inspect", "click", "type", "download", "submit"], "high"],
    ["desktop", ["screenshot", "focus", "click", "type"], "high"],
    ["screen", ["capture"], "low"],
    ["keyboard", ["send"], "high"],
    ["mouse", ["move", "click"], "high"],
    ["clipboard", ["read", "write"], "medium"],
    ["network", ["status", "probe"], "low"],
    ["app", ["discover", "launch", "focus", "connect", "read", "write", "submit"], "high"],
    ["api", ["get", "post", "put", "delete", "submit"], "high"],
    ["job", ["start", "status", "stop"], "medium"],
    ["artifact", ["push", "pull", "verify"], "medium"],
    ["audio", ["status", "set"], "medium"],
    ["os", ["status", "repair", "reinstall", "reset"], "critical", true],
    ["transaction", ["prepare", "preview", "submit", "cancel"], "critical", true],
    ["device", ["status", "reboot", "poweroff"], "critical", true]
  ];
  return entries.map(([family, actions, risk, requiresConfirmation]) => ({
    family,
    actions,
    risk,
    ...(requiresConfirmation ? { requiresConfirmation } : {}),
    proof: proofForFamily(family)
  }));
}

function assertCapability(capability: AgentRuntimeCapability): void {
  if (!normalizeCapabilityPart(capability.family)) {
    throw new Error("Invalid agent runtime family");
  }
  if (!["low", "medium", "high", "critical"].includes(capability.risk)) {
    throw new Error("Invalid agent runtime risk");
  }
  if (!Array.isArray(capability.actions) || capability.actions.length === 0) {
    throw new Error("Agent runtime capability needs actions");
  }
  for (const action of capability.actions) {
    if (!normalizeCapabilityPart(action)) {
      throw new Error("Invalid agent runtime action");
    }
  }
}

function proofForFamily(family: string): string[] {
  if (family === "transaction") {
    return ["preparedActionId", "visiblePreview", "confirmation", "result"];
  }
  if (family === "app" || family === "browser" || family === "desktop") {
    return ["target", "stateBefore", "stateAfter", "result"];
  }
  if (family === "job") {
    return ["jobId", "status", "resultPath"];
  }
  return ["status", "result"];
}

function normalizeCapabilityPart(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
}

function isAgentRuntimeCapabilityName(value: string): boolean {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 120
    && /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/u.test(value);
}
