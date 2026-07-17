import { useGSAP } from "@gsap/react";
import { useNavigate } from "@tanstack/react-router";
import gsap from "gsap";
import {
  ArrowRightIcon,
  ShieldCheckIcon,
  StarIcon,
  TerminalIcon,
  ZapIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { Typer } from "@/components/marketing/lib/typer";
import {
  prefersReducedMotion,
  registerMarketingMotion,
} from "@/components/marketing/motion/landing-timeline";
import { HeroProductTabs } from "@/components/marketing/sections/hero-product-tabs";
import { CopyButton } from "@/components/marketing/shared/copy-button";

const loginSearch = { redirect: undefined as string | undefined };
const INSTALL_CMD = "curl -fsSL https://get.tunnet.io | sh";

export function HeroSection(): ReactNode {
  const navigate = useNavigate();
  const root = useRef<HTMLElement>(null);
  const wordmarkRef = useRef<HTMLSpanElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const subRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLAnchorElement>(null);

  // Typer effect on the "Tunnet" wordmark inline
  useEffect(() => {
    const el = wordmarkRef.current;
    if (!el || prefersReducedMotion()) return;
    const typer = new Typer(el, {
      fps: 26,
      cycles: 5,
      variations: [
        "charFill",
        "charAccentInverse",
        "charAccentFill",
        "charBorder",
      ],
    });
    const id = window.setTimeout(() => typer.in(), 350);
    return () => {
      window.clearTimeout(id);
      typer.destroy();
    };
  }, []);

  useGSAP(
    () => {
      registerMarketingMotion();
      if (prefersReducedMotion()) return;
      gsap.set(
        [badgeRef.current, h1Ref.current, subRef.current, ctaRef.current],
        { opacity: 0, y: 22 },
      );
      const tl = gsap.timeline({ defaults: { ease: "expo.out" }, delay: 0.05 });
      tl.to(badgeRef.current, { opacity: 1, y: 0, duration: 0.9 }, 0.15)
        .to(h1Ref.current, { opacity: 1, y: 0, duration: 1.1 }, 0.35)
        .to(subRef.current, { opacity: 1, y: 0, duration: 1.0 }, 0.55)
        .to(ctaRef.current, { opacity: 1, y: 0, duration: 0.95 }, 0.72);
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      className="relative isolate overflow-hidden pt-24 pb-16 sm:pt-32 sm:pb-24"
    >
      {/* ─── Background stack ────────────────────────────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[var(--m-bg)]" />
        {/* Aurora glow */}
        <div
          className="absolute inset-x-0 top-0 h-[900px]"
          style={{
            background: `
              radial-gradient(ellipse 55% 55% at 50% 0%,
                oklch(0.62 0.18 210 / 0.35), transparent 60%),
              radial-gradient(ellipse 40% 45% at 20% 20%,
                oklch(0.82 0.14 185 / 0.22), transparent 60%),
              radial-gradient(ellipse 40% 45% at 80% 10%,
                oklch(0.75 0.16 155 / 0.18), transparent 60%)
            `,
          }}
        />
        {/* Grid */}
        <div className="absolute inset-0 m-bg-grid" />
        {/* Dot pattern */}
        <div className="absolute inset-0 m-bg-dots opacity-70" />
        {/* Bottom fade */}
        <div className="absolute inset-x-0 bottom-0 h-52 bg-[linear-gradient(180deg,transparent,var(--m-bg))]" />
      </div>

      {/* ─── Content column ──────────────────────────────── */}
      <div className="relative mx-auto flex max-w-[1160px] flex-col items-center px-5 text-center sm:px-8">
        {/* Announcement badge */}
        <a
          ref={badgeRef}
          href="https://github.com/tunnetio/Tunnet"
          target="_blank"
          rel="noreferrer"
          className="group inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/80 backdrop-blur transition-colors hover:border-white/25 hover:bg-white/[0.07]"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--m-accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--m-accent)]">
            <StarIcon className="size-3" />
            v1.4
          </span>
          Public relays now generally available
          <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </a>

        {/* Headline */}
        <h1 ref={h1Ref} className="mt-8 max-w-[16ch] text-balance m-h-hero">
          <span className="m-gradient-text">The network</span>{" "}
          <span className="m-gradient-text">is the network.</span>
          <span className="mt-2 block m-accent-gradient-text">
            Everything else just works.
          </span>
        </h1>

        {/* Support line, includes typer wordmark */}
        <p
          ref={subRef}
          className="mt-7 max-w-[54ch] text-[15px] leading-relaxed text-white/70 sm:text-[17px]"
        >
          <span ref={wordmarkRef} className="typer font-semibold text-white">
            Tunnet
          </span>{" "}
          is an open source zero-trust mesh. Install one agent on every laptop,
          server and CI runner - get an internal IP, SSH by hostname, expose
          services with TLS, and share public tunnels. All under one identity.
        </p>

        {/* Install card + CTAs */}
        <div
          ref={ctaRef}
          className="mt-10 flex w-full flex-col items-center gap-4"
        >
          <div className="group relative flex w-full max-w-[560px] items-center gap-2 overflow-hidden rounded-2xl border border-white/12 bg-black/40 px-4 py-3 text-[13px] text-white/90 backdrop-blur-md">
            {/* Shine sweep */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent"
              style={{ animation: "m-scan 4.5s ease-in-out 1.2s infinite" }}
            />
            <span className="grid size-7 place-items-center rounded-lg bg-[var(--m-accent-soft)] text-[var(--m-accent)]">
              <TerminalIcon className="size-3.5" />
            </span>
            <span className="select-none text-white/40">$</span>
            <code className="flex-1 truncate text-left font-mono">
              {INSTALL_CMD}
            </code>
            <CopyButton
              value={INSTALL_CMD}
              className="!border-white/10 !bg-white/[0.06] !text-white/70 hover:!text-white"
            />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() =>
                void navigate({ to: "/login", search: loginSearch })
              }
              className="m-btn m-btn-primary group"
            >
              Start free
              <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <a href="#product" className="m-btn m-btn-ghost">
              See the platform
            </a>
          </div>
        </div>

        {/* Stat row */}
        <div className="mx-auto mt-14 grid w-full max-w-[720px] grid-cols-2 divide-x divide-white/8 rounded-2xl border border-white/8 bg-white/[0.02] backdrop-blur-sm sm:grid-cols-4">
          <Stat
            k="12ms"
            v="p50 mesh RTT"
            icon={<ZapIcon className="size-3.5" />}
          />
          <Stat
            k="AGPL-3.0"
            v="Full stack open"
            icon={<StarIcon className="size-3.5" />}
          />
          <Stat
            k="QUIC / iroh"
            v="Encrypted by default"
            icon={<ShieldCheckIcon className="size-3.5" />}
          />
          <Stat
            k="6 primitives"
            v="One identity"
            icon={<TerminalIcon className="size-3.5" />}
          />
        </div>
      </div>

      {/* ─── Product tabs strip ──────────────────────────── */}
      <div className="relative z-10 mt-20 sm:mt-28">
        <HeroProductTabs />
      </div>
    </section>
  );
}

function Stat({
  k,
  v,
  icon,
}: {
  k: string;
  v: string;
  icon: ReactNode;
}): ReactNode {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-4 sm:py-5">
      <div className="flex items-center gap-1.5 text-[var(--m-accent)]">
        {icon}
        <p className="font-mono text-[13.5px] font-semibold text-white">{k}</p>
      </div>
      <p className="text-[10.5px] uppercase tracking-[0.14em] text-white/50">
        {v}
      </p>
    </div>
  );
}
