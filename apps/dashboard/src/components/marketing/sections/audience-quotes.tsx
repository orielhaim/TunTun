import { BriefcaseIcon, QuoteIcon, TerminalIcon } from "lucide-react";
import type { ReactNode } from "react";

/* IMG:
   Two headshot placeholders. Prompt:
   "portrait, technical founder, mid-30s, warm studio light, editorial b&w,
    neutral background, 512x512, minimal" */

export function AudienceQuotesSection(): ReactNode {
  return (
    <section className="relative overflow-hidden px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-[1160px]">
        <div className="mx-auto max-w-[46rem] text-center">
          <h2 className="mt-4 m-h-section m-gradient-text">
            Loved by the engineers.
            <br />
            <span className="m-accent-gradient-text">
              Trusted by the room they answer to.
            </span>
          </h2>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <QuoteCard
            icon={<TerminalIcon className="size-4" />}
            quote="I stopped writing VPN docs. New engineers install one binary and can SSH to prod within an hour - with audit and re-auth already on. It's the closest thing to a magic packet I've seen."
            author="Ravi Nair"
            title="Staff Platform Engineer, Halogen"
          />
          <QuoteCard
            icon={<BriefcaseIcon className="size-4" />}
            quote="Our auditors saw identity-scoped access, encrypted transport, and session recording out of the box. Deployment went from six weeks of ZTNA rollout to one afternoon per office."
            author="Marta Cohen"
            title="Head of Security, Northgate"
          />
        </div>
      </div>
    </section>
  );
}

function QuoteCard({
  role,
  icon,
  quote,
  author,
  title,
}: {
  role: string;
  icon: ReactNode;
  quote: string;
  author: string;
  title: string;
}): ReactNode {
  return (
    <figure className="relative overflow-hidden rounded-[var(--m-radius-lg)] border border-white/10 bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-transparent p-8 backdrop-blur">
      <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-[var(--m-accent-soft)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--m-accent)]">
        {icon}
        {role}
      </span>
      <QuoteIcon className="absolute right-8 top-8 size-10 text-white/10" />
      <blockquote className="mt-6 max-w-[52ch] text-lg leading-relaxed text-white sm:text-xl sm:leading-relaxed">
        "{quote}"
      </blockquote>
      <figcaption className="mt-6 flex items-center gap-3">
        {/* Placeholder avatar - swap for a real headshot */}
        <div
          className="size-10 rounded-full border border-white/10 bg-gradient-to-br from-white/10 to-white/[0.02]"
          aria-hidden
        />
        <div>
          <p className="text-sm font-semibold text-white">{author}</p>
          <p className="text-[12px] text-white/50">{title}</p>
        </div>
      </figcaption>
    </figure>
  );
}
