import { useGSAP } from "@gsap/react";
import { CheckIcon } from "lucide-react";
import { type ReactNode, useRef } from "react";
import {
  registerMarketingMotion,
  revealFrom,
} from "@/components/marketing/motion/landing-timeline";
import { RelayGlobe } from "@/components/marketing/visuals/relay-map";

const STATS = [
  { k: "12", v: "regions" },
  { k: "50ms", v: "p95 relay hop" },
  { k: "BYO", v: "certs & DNS" },
  { k: "AGPL", v: "self-host all of it" },
];

const BULLETS = [
  "Anycast public HTTPS endpoints for every tunnel",
  "ACME out of the box, BYO cert supported",
  "Regional pinning, health checks, graceful drain",
  "Same identity everywhere - one policy engine",
];

export function RelayGlobeSection(): ReactNode {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      registerMarketingMotion();
      if (!root.current) return;
      revealFrom(".relay-reveal", root.current);
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      id="relay"
      className="relative isolate overflow-hidden border-y border-[var(--m-border)]"
      style={{ backgroundColor: "var(--m-bg)" }}
    >
      {/* Globe as background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0 flex items-center justify-end"
      >
        <div className="absolute -right-[15%] top-1/2 aspect-square w-[min(1100px,120%)] -translate-y-1/2">
          <RelayGlobe interactive size={900} />
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_20%_50%,var(--m-bg)_20%,transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,var(--m-bg)_0%,transparent_15%,transparent_85%,var(--m-bg)_100%)]" />
      </div>

      <div className="relative z-10 mx-auto grid max-w-[1160px] items-center gap-14 px-5 py-24 sm:px-8 sm:py-36 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="relay-reveal">
          <h2 className="mt-4 m-h-section text-white">
            Global edge.
            <br />
            <span className="m-accent-gradient-text">Your control plane.</span>
          </h2>
          <p className="mt-6 max-w-[54ch] text-[15px] leading-relaxed text-white/60 sm:text-lg">
            Tunnet's public tunnels ride on relays you can run yourself. Point
            DNS, configure ACME, and your team gets public HTTPS endpoints on
            infrastructure that never leaves your account.
          </p>

          <ul className="mt-8 space-y-3">
            {BULLETS.map((b) => (
              <li
                key={b}
                className="flex items-start gap-3 text-[14.5px] text-white/80"
              >
                <span className="mt-0.5 grid size-5 place-items-center rounded-full bg-[var(--m-accent-soft)] text-[var(--m-accent)]">
                  <CheckIcon className="size-3.5" />
                </span>
                {b}
              </li>
            ))}
          </ul>

          <dl className="mt-10 grid max-w-md grid-cols-2 gap-6 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.v}>
                <dt className="font-mono text-2xl font-semibold text-white">
                  {s.k}
                </dt>
                <dd className="mt-1 text-[11px] uppercase tracking-[0.14em] text-white/45">
                  {s.v}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Right column is the globe - mobile only echoes it as an inline card */}
        <div className="relay-reveal relative lg:hidden">
          <div className="mx-auto aspect-square w-full max-w-md">
            <RelayGlobe size={560} />
          </div>
        </div>
      </div>
    </section>
  );
}
