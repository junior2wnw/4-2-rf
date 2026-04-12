import { KnowledgeOps } from "@/components/knowledge-ops";

export const dynamic = "force-dynamic";

export default function OpsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1380px] flex-1 flex-col gap-8 px-4 py-6 md:px-6 lg:px-8">
      <section className="rounded-[2.2rem] border border-[var(--border)] bg-[var(--surface-strong)] p-6 shadow-[var(--panel-shadow)]">
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Ops / Knowledge</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
          Shared Playbook Moderation
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--ink-soft)]">
          Здесь pending candidates из auto-extract и ручного ввода превращаются в shared memory
          только после осознанной публикации. Это и есть безопасный reuse между пользователями.
        </p>
      </section>

      <KnowledgeOps />
    </main>
  );
}
