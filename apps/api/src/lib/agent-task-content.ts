type TaskCompletionStatus = "succeeded" | "failed" | "timed_out" | "cancelled";

export function renderQueuedAgentTaskMessage(input: {
  title: string;
  summary: string;
  command: string;
  workingDirectory?: string | null;
}): string {
  const lines = [
    `Локальная задача поставлена в очередь: ${input.title}.`,
    input.summary,
    "",
    `Команда: ${inlineCode(input.command)}`,
  ];

  if (input.workingDirectory?.trim()) {
    lines.push(`Каталог: ${inlineCode(input.workingDirectory.trim())}`);
  }

  lines.push("Статус: queued");
  return lines.join("\n");
}

export function renderCompletedAgentTaskMessage(input: {
  title: string;
  summary: string;
  status: TaskCompletionStatus;
  command: string;
  exitCode: number | null;
  stdout: string | null;
  stderr: string | null;
  startedAt: string;
  finishedAt: string;
  workingDirectory?: string | null;
}): string {
  const durationMs =
    Math.max(0, new Date(input.finishedAt).getTime() - new Date(input.startedAt).getTime()) || 0;
  const lines = [
    `Локальная задача завершена: ${input.title}.`,
    input.summary,
    "",
    `Статус: ${input.status}`,
    `Код выхода: ${input.exitCode ?? "n/a"}`,
    `Длительность: ${(durationMs / 1000).toFixed(1)}s`,
    `Команда: ${inlineCode(input.command)}`,
  ];

  if (input.workingDirectory?.trim()) {
    lines.push(`Каталог: ${inlineCode(input.workingDirectory.trim())}`);
  }

  const stdout = trimOutput(input.stdout);
  const stderr = trimOutput(input.stderr);

  if (stdout) {
    lines.push("", "stdout:", stdout);
  }

  if (stderr) {
    lines.push("", "stderr:", stderr);
  }

  return lines.join("\n");
}

function trimOutput(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function inlineCode(value: string): string {
  return value.includes("`") ? `"${value}"` : `\`${value}\``;
}
