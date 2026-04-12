"use client";

import type { ChatSession } from "@4-2/contracts";

export type StoredChatSession = {
  session: ChatSession;
  accessToken: string;
};

const STORAGE_KEY = "four-two-chat-session";

export function loadStoredChatSession(): StoredChatSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredChatSession;
    if (!parsed?.session?.id || !parsed?.accessToken) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredChatSession(value: StoredChatSession): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function clearStoredChatSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}
