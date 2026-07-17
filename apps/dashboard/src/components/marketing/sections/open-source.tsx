import { CodeIcon, HeartHandshakeIcon, ScaleIcon } from "lucide-react";
import type { ReactNode } from "react";
import { FaGithub } from "react-icons/fa";
import { NumberTicker } from "@/components/ui/number-ticker";

const STATS = [
  { icon: CodeIcon, label: "Lines of open Rust", value: 148000 },
  { icon: ScaleIcon, label: "License", suffix: "AGPL-3.0" },
  { icon: HeartHandshakeIcon, label: "Contributors", value: 42 },
  { icon: FaGithub, label: "GitHub stars", value: 3200, plus: true },
];

export function OpenSourceSection(): ReactNode {
  return (
    <section className="relative overflow-hidden px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-[1160px] rounded-[var(--m-radius-xl)] border border-white/10 bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-transparent p-8 backdrop-blur sm:p-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center">
          <div>
            <h2 className="mt-4 m-h-section m-gradient-text">
              Not just the agent.
              <br />
              <span className="m-accent-gradient-text">Every line.</span>
            </h2>
            <p className="m-lead mt-6 max-w-[54ch]">
              Agent, control plane, management API, dashboard, relay - read
              every line, audit every path, self-host the whole thing.
              Commercial licenses exist for when AGPL doesn't fit; the freedom
              stays either way.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="https://github.com/tunnetio/Tunnet"
                target="_blank"
                rel="noreferrer"
                className="m-btn m-btn-primary"
              >
                <FaGithub className="size-4" />
                View on GitHub
              </a>
              <a
                href="https://discord.gg/y5bNc3MYKz"
                target="_blank"
                rel="noreferrer"
                className="m-btn m-btn-ghost"
              >
                Join Discord
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
              >
                <s.icon className="size-4 text-[var(--m-accent)]" />
                <p className="mt-4 font-mono text-3xl font-semibold text-white">
                  {typeof s.value === "number" ? (
                    <>
                      <NumberTicker value={s.value} className="!text-white" />
                      {s.plus ? "+" : ""}
                    </>
                  ) : (
                    s.suffix
                  )}
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-white/50">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
