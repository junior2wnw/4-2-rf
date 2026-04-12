"use client";

import { useEffect, useState } from "react";

import type {
  AgentTask,
  ChatMessage,
  ChatSession,
  ChatSessionCreateResponse,
  ChatSessionState,
  LinkedAgent,
} from "@4-2/contracts";

import { absoluteApi } from "@/lib/api";
import {
  clearStoredChatSession,
  loadStoredChatSession,
  saveStoredChatSession,
} from "@/lib/chat-session";

type UiMessage = ChatMessage & { pending?: boolean };
type RuntimeMode = "checking" | "live" | "demo" | "degraded";

const starterPrompts = [
  "Разложи мою идею на продуктовую воронку, найди точки роста и предложи сильный repositioning.",
  "Сделай план запуска AI-сервиса на 4-2.рф с рисками, observability и rollback.",
  "Подготовь CTO-level аудит архитектуры и покажи, где продукт сломается первым.",
];

export function ChatConsole() {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [linkedAgents, setLinkedAgents] = useState<LinkedAgent[]>([]);
  const [pendingTasks, setPendingTasks] = useState<AgentTask[]>([]);
  const [prompt, setPrompt] = useState<string>(starterPrompts[0] ?? "");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>("checking");

  const canSend = prompt.trim().length > 0 && !streaming;
  const emptyState = messages.length === 0;
  const connectedAgent = linkedAgents.find((agent) => agent.isConnected) ?? null;

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const response = await fetch(absoluteApi("/healthz"));
        if (!response.ok) {
          throw new Error("health check failed");
        }

        const payload = (await response.json()) as {
          liveModel?: boolean;
          runtimeStatus?: RuntimeMode;
        };

        if (!cancelled) {
          setRuntimeMode(
            payload.runtimeStatus ??
              (payload.liveModel ? "live" : "demo"),
          );
        }
      } catch {
        if (!cancelled) {
          setRuntimeMode("degraded");
        }
      }

      const stored = loadStoredChatSession();
      if (!stored || cancelled) {
        return;
      }

      try {
        await refreshSessionState(stored.session.id, stored.accessToken);
      } catch {
        clearStoredChatSession();
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session || !sessionToken) {
      return;
    }

    let cancelled = false;
    const currentSessionId = session.id;
    const currentSessionToken = sessionToken;

    async function tick() {
      try {
        await refreshSessionState(currentSessionId, currentSessionToken);
      } catch (caught) {
        if (!cancelled) {
          const message =
            caught instanceof Error ? caught.message : "Не удалось обновить состояние чата.";
          setError(message);
        }
      }
    }

    const intervalMs = pendingTasks.length > 0 ? 2500 : 5000;
    const timer = window.setInterval(() => {
      void tick();
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pendingTasks.length, session, sessionToken]);

  async function refreshSessionState(sessionId: string, accessToken: string): Promise<void> {
    const response = await fetch(absoluteApi(`/v1/chat/sessions/${sessionId}`), {
      headers: {
        accept: "application/json",
        "x-session-token": accessToken,
      },
      cache: "no-store",
    });

    if (response.status === 401) {
      clearStoredChatSession();
      setSession(null);
      setSessionToken(null);
      setMessages([]);
      setLinkedAgents([]);
      setPendingTasks([]);
      throw new Error("Сессия чата устарела. Создайте новую.");
    }

    if (!response.ok) {
      throw new Error("Не удалось получить состояние чата.");
    }

    const payload = (await response.json()) as ChatSessionState;
    setSession(payload.session);
    setSessionToken(accessToken);
    setMessages(payload.messages);
    setLinkedAgents(payload.linkedAgents);
    setPendingTasks(payload.pendingTasks);
    saveStoredChatSession({
      session: payload.session,
      accessToken,
    });
  }

  async function ensureSession(): Promise<{ session: ChatSession; accessToken: string }> {
    if (session && sessionToken) {
      return { session, accessToken: sessionToken };
    }

    const stored = loadStoredChatSession();
    if (stored) {
      await refreshSessionState(stored.session.id, stored.accessToken);
      return stored;
    }

    const detected = inferPlatform();
    const response = await fetch(absoluteApi("/v1/chat/sessions"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Website visitor",
        platform: detected.platform,
        arch: detected.arch,
        userAgent: navigator.userAgent,
      }),
    });

    if (!response.ok) {
      throw new Error("Не удалось создать сессию чата.");
    }

    const created = (await response.json()) as ChatSessionCreateResponse;
    const next = {
      session: {
        id: created.id,
        displayName: created.displayName,
        createdAt: created.createdAt,
      },
      accessToken: created.accessToken,
    };

    setSession(next.session);
    setSessionToken(next.accessToken);
    saveStoredChatSession(next);
    return next;
  }

  async function sendMessage(nextPrompt: string) {
    const content = nextPrompt.trim();
    if (!content) {
      return;
    }

    setError(null);
    setStreaming(true);

    const optimisticUser: UiMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    const assistantId = crypto.randomUUID();

    setMessages((current) => [
      ...current,
      optimisticUser,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        pending: true,
      },
    ]);
    setPrompt("");

    try {
      const active = await ensureSession();
      const clientMessageId = crypto.randomUUID();

      const response = await fetch(absoluteApi(`/v1/chat/sessions/${active.session.id}/messages`), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-session-token": active.accessToken,
        },
        body: JSON.stringify({
          clientMessageId,
          content,
          enableMemory: true,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Стрим чата не поднялся.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          if (!chunk.trim()) {
            continue;
          }

          const event = parseSse(chunk);
          if (!event) {
            continue;
          }

          if (event.event === "delta") {
            const delta = typeof event.data?.delta === "string" ? event.data.delta : "";
            if (!delta) {
              continue;
            }

            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, content: `${message.content}${delta}` }
                  : message,
              ),
            );
          }

          if (event.event === "complete") {
            const nextMessage = nestedMessage(event.data);
            if (nextMessage) {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId ? { ...nextMessage, pending: false } : message,
                ),
              );
            }
          }

          if (event.event === "task_queued") {
            const nextMessage = nestedMessage(event.data);
            const task = nestedTask(event.data);

            if (nextMessage) {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId ? { ...nextMessage, pending: false } : message,
                ),
              );
            }

            if (task) {
              setPendingTasks((current) => upsertTask(current, task));
            }

            await refreshSessionState(active.session.id, active.accessToken);
          }

          if (event.event === "error") {
            throw new Error(
              typeof event.data?.message === "string"
                ? event.data.message
                : "Неизвестная ошибка стрима.",
            );
          }
        }
      }

      await refreshSessionState(active.session.id, active.accessToken);
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId ? { ...message, pending: false } : message,
        ),
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Ошибка отправки сообщения.";
      setError(message);
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                pending: false,
                content:
                  item.content ||
                  "Запрос не завершился. Backend остаётся живым, но конкретная обработка этого хода упала.",
              }
            : item,
        ),
      );
    } finally {
      setStreaming(false);
    }
  }

  return (
    <section className="grid gap-4 rounded-[2rem] border border-[var(--border)] bg-[var(--surface-strong)] p-5 shadow-[var(--panel-shadow)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Live Console</p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">
            Проверить ценность до установки
          </h2>
        </div>
        <div className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">
          {streaming ? "streaming" : runtimeMode}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
        <span className="rounded-full border border-[var(--border)] px-3 py-1">
          {connectedAgent
            ? `device: ${connectedAgent.hostname} (${connectedAgent.platform})`
            : "device: not connected"}
        </span>
        <span className="rounded-full border border-[var(--border)] px-3 py-1">
          tasks: {pendingTasks.length}
        </span>
      </div>

      <div className="grid gap-3 rounded-[1.5rem] border border-[var(--border-soft)] bg-[var(--console)] p-4">
        {emptyState ? (
          <div className="grid gap-3">
            <p className="text-sm leading-6 text-[var(--muted)]">
              Сайт сначала обязан дать сильный результат сам. Только потом мы просим пользователя
              подключать устройство, проект или локального агента.
            </p>
            <div className="flex flex-wrap gap-2">
              {starterPrompts.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPrompt(item)}
                  className="rounded-full border border-[var(--border)] bg-white/5 px-3 py-2 text-left text-sm text-[var(--ink)] transition hover:border-[var(--signal)] hover:text-[var(--signal)]"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="max-h-[24rem] overflow-y-auto pr-1">
          <div className="grid gap-3">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`rounded-[1.25rem] px-4 py-3 ${
                  message.role === "user"
                    ? "ml-auto max-w-[88%] bg-[var(--signal)]/15 text-[var(--ink)]"
                    : "mr-auto max-w-[92%] bg-white/6 text-[var(--ink-soft)]"
                }`}
              >
                <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-[var(--muted)]">
                  <span>{message.role === "user" ? "you" : "4-2"}</span>
                  {message.pending ? <span>typing</span> : null}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6">{message.content || "..."}</p>
              </article>
            ))}
          </div>
        </div>

        <label className="grid gap-3">
          <span className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Запрос</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Например: создай на моём компьютере папку D:\\Reports и положи туда текстовый файл со списком сегодняшних задач"
            rows={4}
            className="min-h-28 rounded-[1.4rem] border border-[var(--border)] bg-black/10 px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--signal)]"
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-[34rem] text-xs leading-5 text-[var(--muted)]">
            Если устройство подключено к этой же сессии, чат может поставить локальную задачу в
            очередь и дождаться результата прямо в переписке.
          </p>
          <button
            type="button"
            disabled={!canSend}
            onClick={() => void sendMessage(prompt)}
            className="rounded-full bg-[var(--signal)] px-5 py-3 text-sm font-medium text-[var(--signal-ink)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {streaming ? "Генерация..." : "Запустить"}
          </button>
        </div>

        {runtimeMode === "demo" ? (
          <div className="rounded-[1rem] border border-[#ffd26a33] bg-[#ffd26a12] px-4 py-3 text-sm text-[#ffe3a7]">
            Сейчас включён demo-режим: веб-контур и память доступны, а live-модель появится после
            подключения рабочего `OPENAI_API_KEY`.
          </div>
        ) : null}

        {runtimeMode === "degraded" ? (
          <div className="rounded-[1rem] border border-[#ff8d6a55] bg-[#ff8d6a12] px-4 py-3 text-sm text-[#ffc3b0]">
            Live-модель сейчас не подтверждена. Базовый контур доступен, но реальные исполнения и
            качественные ответы зависят от исправного ключа и API.
          </div>
        ) : null}

        {pendingTasks.length > 0 ? (
          <div className="rounded-[1rem] border border-[var(--border)] bg-white/4 px-4 py-3 text-sm text-[var(--ink-soft)]">
            Активные задачи: {pendingTasks.map((task) => `${task.title} (${task.status})`).join(", ")}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-[1rem] border border-[#ff8d6a55] bg-[#ff8d6a12] px-4 py-3 text-sm text-[#ffc3b0]">
            {error}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function inferPlatform(): { platform: "windows" | "macos" | "linux"; arch: "amd64" | "arm64" } {
  const userAgent = navigator.userAgent.toLowerCase();
  const isArm = /arm|aarch64/.test(userAgent);

  if (userAgent.includes("mac")) {
    return { platform: "macos", arch: isArm ? "arm64" : "amd64" };
  }
  if (userAgent.includes("win")) {
    return { platform: "windows", arch: isArm ? "arm64" : "amd64" };
  }
  return { platform: "linux", arch: isArm ? "arm64" : "amd64" };
}

function parseSse(chunk: string): { event: string; data: Record<string, unknown> | null } | null {
  const lines = chunk.split("\n");
  const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
  const dataLine = lines.find((line) => line.startsWith("data:"))?.slice(5).trim();

  if (!event) {
    return null;
  }

  try {
    return {
      event,
      data: dataLine ? (JSON.parse(dataLine) as Record<string, unknown>) : null,
    };
  } catch {
    return {
      event,
      data: null,
    };
  }
}

function nestedMessage(data: Record<string, unknown> | null): ChatMessage | null {
  const value = data?.message;
  if (!value || typeof value !== "object") {
    return null;
  }

  const message = value as ChatMessage;
  return message.id ? message : null;
}

function nestedTask(data: Record<string, unknown> | null): AgentTask | null {
  const value = data?.task;
  if (!value || typeof value !== "object") {
    return null;
  }

  const task = value as AgentTask;
  return task.id ? task : null;
}

function upsertTask(current: AgentTask[], next: AgentTask): AgentTask[] {
  const found = current.some((item) => item.id === next.id);
  if (!found) {
    return [...current, next];
  }

  return current.map((item) => (item.id === next.id ? next : item));
}
