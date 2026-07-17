import { useGSAP } from "@gsap/react";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";
import { type ReactNode, useRef } from "react";
import {
  registerMarketingMotion,
  revealFrom,
} from "@/components/marketing/motion/landing-timeline";
import { TerminalDemo } from "@/components/marketing/visuals/terminal-demo";

export function FinalCtaSection(): ReactNode {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      registerMarketingMotion();
      if (!root.current) return;
      revealFrom(".final-reveal", root.current);
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      className="relative isolate overflow-hidden px-5 py-32 sm:px-8 sm:py-40"
    >
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[var(--m-bg)]" />
        <div
          className="absolute inset-x-0 top-0 h-full"
          style={{
            background: `
              radial-gradient(ellipse 60% 50% at 50% 40%, oklch(0.62 0.18 210 / 0.32), transparent 60%),
              radial-gradient(ellipse 40% 40% at 20% 90%, oklch(0.82 0.14 185 / 0.2), transparent 60%)
            `,
          }}
        />
        <div className="absolute inset-0 m-bg-grid opacity-60" />
      </div>

      <div className="mx-auto grid max-w-[1160px] items-center gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div>
          <h2 className="final-reveal m-h-hero m-gradient-text">
            Ship the mesh
            <br />
            <span className="m-accent-gradient-text">your team can trust.</span>
          </h2>
          <p className="final-reveal m-lead mt-6 max-w-[46ch]">
            Start free with Direct mode. Grow into Managed when you're ready.
            Self-host the whole thing whenever you want.
          </p>
          <div className="final-reveal mt-10 flex flex-wrap items-center gap-3">
            <Link
              to="/login"
              search={{ redirect: undefined }}
              className="m-btn m-btn-primary group"
            >
              Start free
              <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="https://cal.com/tunnet/demo"
              target="_blank"
              rel="noreferrer"
              className="m-btn m-btn-ghost"
            >
              Book a demo
            </a>
          </div>
        </div>
        <div className="final-reveal">
          <TerminalDemo
            title="zsh - one command"
            code={`curl -fsSL https://get.tunnet.io | sh
sudo tunnet enroll --control-url https://control.acme.dev --token $TOKEN
sudo tunnet service start
tunnet status --peers`}
          />
        </div>
      </div>
    </section>
  );
}
