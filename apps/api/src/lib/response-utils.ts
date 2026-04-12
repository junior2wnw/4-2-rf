type MaybeRecord = Record<string, unknown>;

function isRecord(value: unknown): value is MaybeRecord {
  return typeof value === "object" && value !== null;
}

export function extractResponseId(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = value.id;
  return typeof id === "string" ? id : null;
}

export function extractResponseText(value: unknown): string {
  if (!isRecord(value)) {
    return "";
  }

  const output = value.output;
  if (!Array.isArray(output)) {
    return "";
  }

  const parts: string[] = [];
  for (const item of output) {
    if (!isRecord(item) || item.type !== "message") {
      continue;
    }

    const content = item.content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (!isRecord(part) || part.type !== "output_text") {
        continue;
      }

      const text = part.text;
      if (typeof text === "string" && text.trim()) {
        parts.push(text);
      }
    }
  }

  return parts.join("\n").trim();
}
