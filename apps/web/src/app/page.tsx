import { ChatConsole } from "@/components/chat-console";
import { DeviceConnect } from "@/components/device-connect";

const pillars = [
  {
    title: "Zero-Install First",
    text: "Сайт сначала даёт результат сам: аудит идеи, план запуска, product critique, architecture review и execution feedback без первого барьера в виде установки.",
  },
  {
    title: "Transparent Trust Ladder",
    text: "Локальный агент ставится только по явному действию. По умолчанию это user-scope install без скрытой эскалации, а system-scope остаётся отдельным осознанным шагом.",
  },
  {
    title: "Reviewed Shared Memory",
    text: "Лучшие ответы и playbooks начинают усиливать следующих пользователей только после auto-extract, дедупликации, redaction и ручной публикации через ops-контур.",
  },
];

const advantages = [
  "Веб-режим без установки повышает конверсию в первый полезный результат.",
  "Память и playbooks работают на retention, а не только на wow-эффект первого диалога.",
  "CLI становится апгрейдом после доказанной ценности, а не scary-этапом онбординга.",
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[1380px] flex-1 flex-col gap-10 px-4 py-6 md:px-6 lg:px-8">
      <section className="hero-grid overflow-hidden rounded-[2.4rem] border border-[var(--border)] p-6 md:p-8">
        <div className="grid gap-6">
          <div className="inline-flex w-fit rounded-full border border-[var(--border)] bg-white/6 px-4 py-2 text-xs uppercase tracking-[0.35em] text-[var(--muted)]">
            4-2.рф / execution layer
          </div>

          <div className="grid gap-4">
            <h1 className="max-w-4xl text-5xl font-semibold leading-[0.95] tracking-[-0.05em] text-[var(--ink)] md:text-7xl">
              Не просим ставить агента сразу.
              <br />
              Сначала доказываем ценность.
            </h1>
            <p className="max-w-3xl text-lg leading-8 text-[var(--ink-soft)] md:text-xl">
              Сильный AI-продукт растёт быстрее, когда первый экран уже решает задачу, а
              подключение устройства идёт как прозрачный апгрейд с понятными правами, а не как
              scary all-access barrier.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href="#console"
              className="rounded-full bg-[var(--signal)] px-6 py-3 text-sm font-medium text-[var(--signal-ink)] transition hover:brightness-105"
            >
              Открыть live console
            </a>
            <a
              href="#connect"
              className="rounded-full border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--ink)] transition hover:border-[var(--signal)] hover:text-[var(--signal)]"
            >
              Подключить устройство
            </a>
          </div>
        </div>

        <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface-strong)] p-5 shadow-[var(--panel-shadow)]">
          <div className="grid gap-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.35em] text-[var(--muted)]">
              <span>Growth Engine</span>
              <span>trust + retention</span>
            </div>

            <div className="grid gap-3">
              {pillars.map((pillar) => (
                <article
                  key={pillar.title}
                  className="rounded-[1.5rem] border border-[var(--border-soft)] bg-white/5 px-4 py-4"
                >
                  <h2 className="text-lg font-semibold text-[var(--ink)]">{pillar.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{pillar.text}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {advantages.map((item) => (
          <div
            key={item}
            className="rounded-[1.6rem] border border-[var(--border)] bg-[var(--surface)] px-5 py-4 text-sm leading-6 text-[var(--ink-soft)]"
          >
            {item}
          </div>
        ))}
      </section>

      <div id="console">
        <ChatConsole />
      </div>

      <div id="connect">
        <DeviceConnect />
      </div>
    </main>
  );
}
