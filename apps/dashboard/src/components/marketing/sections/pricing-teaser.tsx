import { Link } from "@tanstack/react-router";
import { CheckIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TIERS = [
  {
    id: "direct",
    name: "Direct",
    price: "Free",
    period: "forever",
    pitch: "You and a handful of machines. Zero infrastructure.",
    features: [
      "Unlimited devices in P2P mode",
      "Mesh, Send, SSH, Serve",
      "Community support",
      "Self-hosted, always",
    ],
    cta: "Get started",
  },
  {
    id: "team",
    name: "Team",
    price: "$6",
    period: "user / month",
    pitch: "Managed control plane with SSO, audit, and relays.",
    features: [
      "Everything in Direct",
      "SSO / OIDC, roles, audit log",
      "Public tunnels via managed relays",
      "SSH session recording",
      "REST API + API keys",
    ],
    cta: "Start 14-day trial",
    accent: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "annual",
    pitch: "Self-hosted or dedicated cloud. SLAs and support.",
    features: [
      "Self-hosted control plane",
      "SCIM, custom OIDC",
      "Dedicated relays",
      "24/7 support & SLA",
      "Compliance reviews",
    ],
    cta: "Talk to sales",
  },
];

export function PricingTeaserSection(): ReactNode {
  return (
    <section
      id="pricing"
      className="relative overflow-hidden px-5 py-24 sm:px-8 sm:py-32"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_40%_50%_at_50%_0%,oklch(0.62_0.18_210_/_0.15),transparent)]" />
      </div>

      <div className="mx-auto max-w-[1160px]">
        <div className="mx-auto max-w-[52rem] text-center">
          <h2 className="mt-4 m-h-section m-gradient-text">
            Start free. Scale with your org.
          </h2>
          <p className="m-lead mt-6">
            No per-machine tax. No egress fees. Direct mode is free forever -
            even for commercial use.
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.id}
              className={cn(
                "relative overflow-hidden rounded-[var(--m-radius-lg)] p-8 backdrop-blur",
                t.accent
                  ? "border border-white/20 bg-gradient-to-b from-white/[0.08] via-white/[0.03] to-transparent shadow-[0_40px_100px_-40px_oklch(0.62_0.18_210_/_0.4)]"
                  : "border border-white/10 bg-white/[0.02]",
              )}
            >
              {t.accent ? (
                <>
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full opacity-70"
                    style={{
                      background:
                        "radial-gradient(closest-side, oklch(0.62 0.18 210 / 0.3), transparent)",
                    }}
                  />
                  <span className="absolute right-6 top-6 rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-white/80">
                    Most popular
                  </span>
                </>
              ) : null}
              <p className="relative text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--m-accent)]">
                {t.name}
              </p>
              <p className="relative mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight text-white">
                  {t.price}
                </span>
                <span className="text-[13px] text-white/55">{t.period}</span>
              </p>
              <p className="relative mt-3 max-w-[36ch] text-[14px] text-white/60">
                {t.pitch}
              </p>
              <ul className="relative mt-6 space-y-2.5">
                {t.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-[14px] text-white/85"
                  >
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-[var(--m-accent)]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/login"
                search={{ redirect: undefined }}
                className={cn(
                  "relative mt-8 inline-flex h-10 w-full items-center justify-center rounded-full text-[13px] font-medium transition-colors",
                  t.accent
                    ? "m-btn-primary"
                    : "border border-white/15 text-white hover:bg-white/[0.05]",
                )}
              >
                {t.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
