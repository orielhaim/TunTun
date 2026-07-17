import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { FaDiscord, FaGithub, FaXTwitter, FaYoutube } from "react-icons/fa6";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Mesh", href: "#platform" },
      { label: "Serve", href: "#platform" },
      { label: "Tunnel", href: "#platform" },
      { label: "SSH", href: "#platform" },
      { label: "Relay", href: "#relay" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: "https://docs.tunnet.dev", external: true },
      {
        label: "GitHub",
        href: "https://github.com/tunnetio/Tunnet",
        external: true,
      },
      {
        label: "Discord",
        href: "https://discord.gg/y5bNc3MYKz",
        external: true,
      },
      { label: "Status", href: "https://status.tunnet.io", external: true },
      { label: "Changelog", href: "/changelog" },
      {
        label: "Node SDK",
        href: "https://github.com/tunnetio/Tunnet",
        external: true,
      },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Blog", href: "/blog" },
      { label: "Careers", href: "/careers" },
      { label: "Contact", href: "mailto:hello@tunnet.io", external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/legal/privacy" },
      { label: "Terms", href: "/legal/terms" },
      {
        label: "License (AGPL-3.0)",
        href: "https://github.com/tunnetio/Tunnet/blob/main/LICENSE",
        external: true,
      },
      {
        label: "CLA",
        href: "https://github.com/tunnetio/Tunnet/blob/main/CLA.md",
        external: true,
      },
    ],
  },
];

export function MarketingFooter(): ReactNode {
  return (
    <footer className="relative isolate overflow-hidden border-t border-white/10 bg-[var(--m-bg-2)] text-white/70">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[min(55vh,460px)]"
        style={{
          background: `
            radial-gradient(ellipse 60% 60% at 50% 100%, oklch(0.62 0.18 210 / 0.28), transparent 60%),
            radial-gradient(ellipse 40% 40% at 20% 100%, oklch(0.82 0.14 185 / 0.18), transparent 60%)
          `,
        }}
      />

      <div className="relative z-10 mx-auto max-w-[1200px] px-5 pt-20 pb-10 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.15fr_2fr]">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-2.5 text-white"
            >
              <img src="/logo.png" alt="Tunnet" className="size-8" />
              <span className="text-[15px] font-semibold tracking-[-0.02em]">
                Tunnet
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm text-white/55">
              Zero-trust mesh networking for teams that move fast. Six
              primitives, one identity, fully open source.
            </p>

            <div className="mt-6 flex items-center gap-3 text-white/60">
              {[
                {
                  Icon: FaGithub,
                  href: "https://github.com/tunnetio/Tunnet",
                  label: "GitHub",
                },
                {
                  Icon: FaDiscord,
                  href: "https://discord.gg/y5bNc3MYKz",
                  label: "Discord",
                },
                {
                  Icon: FaXTwitter,
                  href: "https://x.com/tunnetio",
                  label: "X",
                },
                {
                  Icon: FaYoutube,
                  href: "https://youtube.com/@tunnet",
                  label: "YouTube",
                },
              ].map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="grid size-9 place-items-center rounded-full border border-white/12 transition-colors hover:border-[var(--m-accent)]/50 hover:text-white"
                >
                  <Icon className="size-4" />
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/50">
                  {col.title}
                </p>
                <ul className="mt-4 space-y-2.5 text-sm">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      {"external" in l && l.external ? (
                        <a
                          href={l.href}
                          target="_blank"
                          rel="noreferrer"
                          className="text-white/70 hover:text-white"
                        >
                          {l.label}
                        </a>
                      ) : (
                        <a
                          href={l.href}
                          className="text-white/70 hover:text-white"
                        >
                          {l.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="m-hairline mt-16" />
        <div className="mt-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <p className="text-xs text-white/50">
            © {new Date().getFullYear()} Tunnet · Open source under AGPL-3.0
          </p>
          <p className="text-xs text-white/50">
            Made by a team who spent too many years writing VPN docs.
          </p>
        </div>
      </div>
    </footer>
  );
}
