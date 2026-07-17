import {
  EyeIcon,
  FileTextIcon,
  KeyRoundIcon,
  LockKeyholeIcon,
  RadioIcon,
  ShieldCheckIcon,
} from "lucide-react";
import type { ReactNode } from "react";

const PILLARS = [
  {
    icon: LockKeyholeIcon,
    title: "QUIC + iroh transport",
    body: "Every link is TLS 1.3 over QUIC. No unencrypted paths, no shared secrets on the wire.",
  },
  {
    icon: KeyRoundIcon,
    title: "Device identity, not keys",
    body: "Machines enroll with verifiable identity. No SSH keys to distribute, rotate, or leak.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Policy engine by default",
    body: "ACLs, roles, and tags decide reachability. Zero trust isn't a mode - it's the default.",
  },
  {
    icon: FileTextIcon,
    title: "Full audit trail",
    body: "Every session, tunnel, and file transfer is logged. SSH sessions can be replayed on demand.",
  },
  {
    icon: EyeIcon,
    title: "You can read every line",
    body: "Control plane, agent, dashboard, and relay are AGPL-3.0. Self-host the entire stack.",
  },
  {
    icon: RadioIcon,
    title: "BLAKE3-verified transfers",
    body: "iroh-blobs verifies file transfers cryptographically. Consent-based receiving, per-rule.",
  },
];

export function SecuritySection(): ReactNode {
  return (
    <section
      id="security"
      className="relative isolate overflow-hidden px-5 py-28 sm:px-8 sm:py-36"
    >
      {/* Background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[var(--m-bg)]" />
        <div
          className="absolute inset-x-0 top-0 h-[600px]"
          style={{
            background:
              "radial-gradient(ellipse 45% 55% at 50% 0%, oklch(0.62 0.18 210 / 0.28), transparent 60%)",
          }}
        />
        <div className="absolute inset-0 m-bg-grid opacity-70" />
      </div>

      <div className="mx-auto max-w-[1160px]">
        <div className="max-w-[52rem]">
          <h2 className="mt-4 m-h-section m-gradient-text">
            The network doesn't have to be
            <br />
            <span className="m-accent-gradient-text">the weakest link.</span>
          </h2>
          <p className="m-lead mt-6 max-w-[54ch]">
            Tunnet ships with the security posture your auditors ask for on day
            one - identity everywhere, encryption everywhere, audit everywhere.
            Because everything is open source, you never have to take our word
            for it.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p) => (
            <div
              key={p.title}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-sm transition-colors duration-300 hover:border-[var(--m-accent)]/40 hover:bg-white/[0.04]"
            >
              <div className="grid size-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-[var(--m-accent)] transition-transform duration-500 group-hover:-translate-y-0.5">
                <p.icon className="size-5" />
              </div>
              <h3 className="mt-5 text-[16px] font-semibold text-white">
                {p.title}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-white/60">
                {p.body}
              </p>
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,oklch(0.82_0.14_185_/_0.5),transparent)]"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
