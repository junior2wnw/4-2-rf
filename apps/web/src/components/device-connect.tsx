"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  ChatSessionCreateResponse,
  DownloadManifest,
  DownloadManifestItem,
  InstallTokenResponse,
} from "@4-2/contracts";

import { absoluteApi } from "@/lib/api";
import { loadStoredChatSession, saveStoredChatSession } from "@/lib/chat-session";

type InstallScope = "user" | "system";
type DeviceGuess = {
  platform: "windows" | "macos" | "linux";
  arch: "amd64" | "arm64";
};

export function DeviceConnect() {
  const [manifest, setManifest] = useState<DownloadManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceGuess | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [scope, setScope] = useState<InstallScope>("user");
  const [issuing, setIssuing] = useState(false);
  const [issuedCommand, setIssuedCommand] = useState<string | null>(null);
  const [issuedToken, setIssuedToken] = useState<InstallTokenResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [manifestResponse, detectedDevice] = await Promise.all([
          fetch(absoluteApi("/v1/installers/manifest")),
          detectDevice(),
        ]);

        if (!manifestResponse.ok) {
          throw new Error("Не удалось загрузить каталог установщиков.");
        }

        const data = (await manifestResponse.json()) as DownloadManifest;
        if (cancelled) {
          return;
        }

        setManifest(data);
        setDevice(detectedDevice);

        const recommended = data.items.find(
          (item) => item.platform === detectedDevice.platform && item.arch === detectedDevice.arch,
        );
        setSelectedKey(makeKey(recommended ?? data.items[0] ?? null));
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Manifest load failed.");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedItem = useMemo(() => {
    if (!manifest || !selectedKey) {
      return null;
    }

    return manifest.items.find((item) => makeKey(item) === selectedKey) ?? null;
  }, [manifest, selectedKey]);

  async function issueCommand() {
    if (!selectedItem) {
      return;
    }

    setIssuing(true);
    setError(null);
    setCopied(false);

    try {
      const activeSession = await ensureBrowserSession();
      const response = await fetch(absoluteApi("/v1/installers/enrollment-token"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-session-token": activeSession.accessToken,
        },
        body: JSON.stringify({
          platform: selectedItem.platform,
          arch: selectedItem.arch,
          scope,
          requestedBy: `website-self-serve:${selectedItem.platform}-${selectedItem.arch}`,
          sessionId: activeSession.session.id,
        }),
      });

      if (!response.ok) {
        throw new Error("Не удалось выпустить enrollment token.");
      }

      const token = (await response.json()) as InstallTokenResponse;
      setIssuedToken(token);
      setIssuedCommand(applyScopeAndToken(selectedItem.installCommand, scope, token.token));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Token issue failed.");
    } finally {
      setIssuing(false);
    }
  }

  async function copyCommand() {
    if (!issuedCommand) {
      return;
    }

    await navigator.clipboard.writeText(issuedCommand);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className="grid gap-4 rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--panel-shadow)]">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Trust Ladder</p>
        <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">
          Подключение устройства без грязной магии
        </h2>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {[
          "1. Сайт даёт пользу сразу, без установки.",
          "2. Пользователь явно выбирает свой installer под свою ОС.",
          "3. По умолчанию ставим в user-scope, а не в system-scope.",
          "4. Повышение прав остаётся отдельным осознанным шагом.",
          "5. Uninstall и revoke access должны быть проще, чем install.",
        ].map((line) => (
          <div
            key={line}
            className="rounded-[1.25rem] border border-[var(--border-soft)] bg-white/4 px-4 py-3 text-sm leading-6 text-[var(--ink-soft)]"
          >
            {line}
          </div>
        ))}
      </div>

      <div className="grid gap-4 rounded-[1.5rem] border border-[var(--border-soft)] bg-[var(--console)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--ink)]">Self-Serve Connect</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {device
                ? `Рекомендуемая платформа: ${device.platform} / ${device.arch}`
                : "Определяем платформу устройства..."}
            </p>
          </div>
          <span className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
            {manifest ? manifest.items.length : 0} builds
          </span>
        </div>

        {error ? (
          <div className="rounded-[1rem] border border-[#ff8d6a55] bg-[#ff8d6a12] px-4 py-3 text-sm text-[#ffc3b0]">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {manifest?.items.map((item) => {
            const key = makeKey(item);
            const recommended = device
              ? item.platform === device.platform && item.arch === device.arch
              : false;
            const active = selectedKey === key;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedKey(key)}
                className={`grid gap-3 rounded-[1.35rem] border p-4 text-left transition ${
                  active
                    ? "border-[var(--signal)] bg-[var(--signal)]/10"
                    : "border-[var(--border)] bg-white/5 hover:border-[var(--signal)]/60"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-base font-semibold text-[var(--ink)]">
                      {item.platform} / {item.arch}
                    </h4>
                    <p className="text-sm text-[var(--muted)]">{item.filename}</p>
                  </div>
                  {recommended ? (
                    <span className="rounded-full border border-[var(--signal)]/40 bg-[var(--signal)]/15 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[var(--signal)]">
                      Recommended
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {item.notes.map((note) => (
                    <span
                      key={note}
                      className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs text-[var(--muted)]"
                    >
                      {note}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 rounded-[1.25rem] border border-[var(--border)] bg-white/4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold text-[var(--ink)]">Installation Scope</h4>
              <p className="mt-1 text-sm text-[var(--muted)]">
                User-scope безопаснее и достаточно для большинства сценариев. System-scope нужен
                только когда вы сознательно хотите сервис для всей машины.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["user", "system"] as const).map((nextScope) => (
                <button
                  key={nextScope}
                  type="button"
                  onClick={() => setScope(nextScope)}
                  className={`rounded-full px-4 py-2 text-sm ${
                    scope === nextScope
                      ? "bg-[var(--signal)] text-[var(--signal-ink)]"
                      : "border border-[var(--border)] text-[var(--ink)]"
                  }`}
                >
                  {nextScope === "user" ? "User (Recommended)" : "System"}
                </button>
              ))}
            </div>
          </div>

          {scope === "system" ? (
            <div className="rounded-[1rem] border border-[#ffd26a33] bg-[#ffd26a12] px-4 py-3 text-sm text-[#ffe3a7]">
              System-scope потребует явной эскалации прав средствами ОС. Никакой скрытой admin
              persistence здесь нет.
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!selectedItem || issuing}
              onClick={() => issueCommand()}
              className="rounded-full bg-[var(--signal)] px-5 py-3 text-sm font-medium text-[var(--signal-ink)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {issuing ? "Готовим команду..." : "Подключить это устройство"}
            </button>

            {selectedItem ? (
              <a
                href={selectedItem.url}
                className="rounded-full border border-[var(--border)] px-5 py-3 text-sm font-medium text-[var(--ink)]"
              >
                Скачать архив
              </a>
            ) : null}

            <button
              type="button"
              disabled={!issuedCommand}
              onClick={() => void copyCommand()}
              className="rounded-full border border-[var(--border)] px-5 py-3 text-sm font-medium text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copied ? "Скопировано" : "Скопировать команду"}
            </button>
          </div>

          <code className="overflow-x-auto rounded-[1rem] border border-[var(--border-soft)] bg-black/20 px-3 py-3 text-xs leading-6 text-[#d9fbf2]">
            {issuedCommand ??
              "Сначала выберите артефакт и нажмите «Подключить это устройство». Сайт выпустит короткоживущий enrollment token и подставит его в команду установки."}
          </code>

          {issuedToken ? (
            <p className="text-xs leading-5 text-[var(--muted)]">
              Enrollment token живёт до {new Date(issuedToken.expiresAt).toLocaleString("ru-RU")}.
              После этого выпустите новую команду.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function makeKey(item: DownloadManifestItem | null): string | null {
  return item ? `${item.platform}:${item.arch}:${item.filename}` : null;
}

function applyScopeAndToken(command: string, scope: InstallScope, token: string): string {
  return command
    .replace("--scope user", `--scope ${scope}`)
    .replace("<token-from-site>", token);
}

async function ensureBrowserSession(): Promise<{
  session: { id: string; displayName: string; createdAt: string };
  accessToken: string;
}> {
  const stored = loadStoredChatSession();
  if (stored) {
    return stored;
  }

  const detected = await detectDevice();
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
    throw new Error("Не удалось создать chat session для привязки устройства.");
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
  saveStoredChatSession(next);
  return next;
}

async function detectDevice(): Promise<DeviceGuess> {
  const userAgent = navigator.userAgent.toLowerCase();
  const uaData = (navigator as Navigator & {
    userAgentData?: {
      getHighEntropyValues?: (
        values: string[],
      ) => Promise<{ architecture?: string; bitness?: string; platform?: string }>;
    };
  }).userAgentData;

  let platform: DeviceGuess["platform"] = "linux";
  if (userAgent.includes("mac")) {
    platform = "macos";
  } else if (userAgent.includes("win")) {
    platform = "windows";
  }

  let arch: DeviceGuess["arch"] = /arm|aarch64/.test(userAgent) ? "arm64" : "amd64";

  if (uaData?.getHighEntropyValues) {
    try {
      const values = await uaData.getHighEntropyValues(["architecture", "bitness"]);
      const descriptor = `${values.architecture ?? ""} ${values.bitness ?? ""}`.toLowerCase();
      if (descriptor.includes("arm")) {
        arch = "arm64";
      }
      if (descriptor.includes("64") && !descriptor.includes("arm")) {
        arch = "amd64";
      }
    } catch {
      // Keep the heuristic fallback when high-entropy values are not available.
    }
  }

  return { platform, arch };
}
