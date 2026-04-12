"use client";

import { useEffect, useState } from "react";

import type { KnowledgePromotion } from "@4-2/contracts";

type LoadState = {
  pending: KnowledgePromotion[];
  published: KnowledgePromotion[];
};

const initialForm = {
  title: "",
  summary: "",
  content: "",
  tags: "",
};

export function KnowledgeOps() {
  const [state, setState] = useState<LoadState>({ pending: [], published: [] });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);

    try {
      const [pendingResponse, publishedResponse] = await Promise.all([
        fetch("/ops-api/knowledge/promotions?status=pending"),
        fetch("/ops-api/knowledge/promotions?status=published"),
      ]);

      if (!pendingResponse.ok || !publishedResponse.ok) {
        throw new Error("Не удалось загрузить knowledge promotions.");
      }

      const [pendingData, publishedData] = (await Promise.all([
        pendingResponse.json(),
        publishedResponse.json(),
      ])) as [{ items: KnowledgePromotion[] }, { items: KnowledgePromotion[] }];

      setState({
        pending: pendingData.items,
        published: publishedData.items,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Load failed.");
    } finally {
      setLoading(false);
    }
  }

  async function submitManualPromotion() {
    if (!form.title.trim() || !form.summary.trim() || !form.content.trim()) {
      setError("Заполни title, summary и content.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/ops-api/knowledge/promotions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          summary: form.summary.trim(),
          content: form.content.trim(),
          tags: form.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          createdBy: "ops:manual",
          scopeWing: "public-playbooks",
          scopeRoom: "playbooks",
        }),
      });

      if (!response.ok) {
        throw new Error("Не удалось создать manual candidate.");
      }

      setForm(initialForm);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Create failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function runAction(promotionId: string, action: "publish" | "reject") {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/ops-api/knowledge/promotions/${promotionId}/${action}`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Не удалось выполнить action ${action}.`);
      }

      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="grid gap-6">
      {error ? (
        <div className="rounded-[1rem] border border-[#ff8d6a55] bg-[#ff8d6a12] px-4 py-3 text-sm text-[#ffc3b0]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--panel-shadow)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">
                Pending Queue
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">
                Candidates awaiting moderation
              </h2>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--ink)]"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 grid gap-4">
            {loading ? (
              <div className="rounded-[1.25rem] border border-[var(--border-soft)] bg-white/4 px-4 py-4 text-sm text-[var(--muted)]">
                Загружаем очередь...
              </div>
            ) : state.pending.length === 0 ? (
              <div className="rounded-[1.25rem] border border-[var(--border-soft)] bg-white/4 px-4 py-4 text-sm text-[var(--muted)]">
                Pending queue пустая. Auto-extract либо ничего не нашёл, либо всё уже обработано.
              </div>
            ) : (
              state.pending.map((item) => (
                <article
                  key={item.id}
                  className="grid gap-3 rounded-[1.35rem] border border-[var(--border)] bg-white/5 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--ink)]">{item.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">{item.summary}</p>
                    </div>
                    <div className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      {item.createdBy}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs text-[var(--muted)]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <details className="rounded-[1rem] border border-[var(--border-soft)] bg-black/15 px-4 py-3">
                    <summary className="cursor-pointer text-sm font-medium text-[var(--ink)]">
                      Open playbook content
                    </summary>
                    <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--ink-soft)]">
                      {item.content}
                    </pre>
                  </details>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void runAction(item.id, "publish")}
                      className="rounded-full bg-[var(--signal)] px-4 py-2 text-sm font-medium text-[var(--signal-ink)] disabled:opacity-50"
                    >
                      Publish
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void runAction(item.id, "reject")}
                      className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--ink)] disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="grid gap-6">
          <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--panel-shadow)]">
            <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Manual Input</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Create curated playbook</h2>

            <div className="mt-4 grid gap-3">
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Title"
                className="rounded-[1rem] border border-[var(--border)] bg-black/10 px-4 py-3 text-sm text-[var(--ink)] outline-none"
              />
              <textarea
                value={form.summary}
                onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
                placeholder="Summary"
                rows={3}
                className="rounded-[1rem] border border-[var(--border)] bg-black/10 px-4 py-3 text-sm text-[var(--ink)] outline-none"
              />
              <textarea
                value={form.content}
                onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                placeholder="Reusable playbook content"
                rows={10}
                className="rounded-[1rem] border border-[var(--border)] bg-black/10 px-4 py-3 text-sm text-[var(--ink)] outline-none"
              />
              <input
                value={form.tags}
                onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
                placeholder="tags, comma, separated"
                className="rounded-[1rem] border border-[var(--border)] bg-black/10 px-4 py-3 text-sm text-[var(--ink)] outline-none"
              />
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitManualPromotion()}
                className="rounded-full bg-[var(--signal)] px-5 py-3 text-sm font-medium text-[var(--signal-ink)] disabled:opacity-50"
              >
                Create candidate
              </button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--panel-shadow)]">
            <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Published</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Shared playbooks live for retrieval</h2>

            <div className="mt-4 grid gap-3">
              {state.published.slice(0, 8).map((item) => (
                <article
                  key={item.id}
                  className="rounded-[1.25rem] border border-[var(--border-soft)] bg-white/4 px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-[var(--ink)]">{item.title}</h3>
                    <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      published
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{item.summary}</p>
                </article>
              ))}

              {!loading && state.published.length === 0 ? (
                <div className="rounded-[1.25rem] border border-[var(--border-soft)] bg-white/4 px-4 py-4 text-sm text-[var(--muted)]">
                  Пока нет опубликованных playbook’ов.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
