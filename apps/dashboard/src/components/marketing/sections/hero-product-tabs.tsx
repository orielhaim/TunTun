import {
  GlobeIcon,
  KeyRoundIcon,
  NetworkIcon,
  RadioTowerIcon,
  ShareIcon,
  TerminalSquareIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Product = {
  id: string;
  name: string;
  tagline: string;
  verb: string;
  cmd: string;
  icon: ReactNode;
  copy: string;
};

const PRODUCTS: Product[] = [
  {
    id: "mesh",
    name: "Mesh",
    tagline: "Every machine on one private network.",
    verb: "tunnet status",
    icon: <NetworkIcon className="size-4" />,
    cmd: `tunnet status --peers
# 14 peers · 12ms p50 · all direct`,
    copy: "QUIC over iroh. Direct paths when possible, relayed automatically when NAT blocks. PeerDNS resolves everyone by hostname.",
  },
  {
    id: "serve",
    name: "Serve",
    tagline: "Internal HTTPS in one command.",
    verb: "tunnet serve",
    icon: <ShareIcon className="size-4" />,
    cmd: `tunnet serve 3000 \\
  --hostname grafana.acme.mesh \\
  --acl "role:ops"`,
    copy: "Expose a local port to your mesh with TLS from your org's CA. ACLs decide who reaches it - no firewall dance.",
  },
  {
    id: "tunnel",
    name: "Tunnel",
    tagline: "Public HTTPS. Zero firewall theatre.",
    verb: "tunnet tunnel",
    icon: <GlobeIcon className="size-4" />,
    cmd: `tunnet tunnel 3000
# → https://demo-api.rl.acme.tunnet.io`,
    copy: "Give any local port a public HTTPS URL through relays you can self-host. Webhooks, demos, permanent services.",
  },
  {
    id: "ssh",
    name: "SSH",
    tagline: "Keyless SSH by identity.",
    verb: "tunnet ssh",
    icon: <TerminalSquareIcon className="size-4" />,
    cmd: `tunnet ssh db-server
tunnet ssh sessions
tunnet ssh play <id>`,
    copy: "No keys to distribute, no keys to leak. Session recording, replay, and re-auth enforcement by role.",
  },
  {
    id: "send",
    name: "Send",
    tagline: "P2P file transfer, verified.",
    verb: "tunnet send",
    icon: <RadioTowerIcon className="size-4" />,
    cmd: `tunnet send ./data.tar.gz db-server
tunnet send ./build tag:ci`,
    copy: "iroh-blobs + BLAKE3. Consent-based receiving, multicast to tagged machines, auto-accept per rule.",
  },
  {
    id: "relay",
    name: "Relay",
    tagline: "Your edge. Your certs. Your control.",
    verb: "tunnet-relay",
    icon: <KeyRoundIcon className="size-4" />,
    cmd: `tunnet-relay register \\
  --control-url http://control:8080 \\
  --token $TOKEN
tunnet-relay run`,
    copy: "Self-host public tunnel edges. ACME or BYO certs. Point DNS, and your team gets public HTTPS on your infrastructure.",
  },
];

const FIRST_PRODUCT: Product = PRODUCTS[0] as Product;

export function HeroProductTabs(): ReactNode {
  const [active, setActive] = useState(FIRST_PRODUCT.id);
  const [autoplay, setAutoplay] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  const product = PRODUCTS.find((p) => p.id === active) ?? FIRST_PRODUCT;

  useEffect(() => {
    if (!autoplay) return;
    timer.current = window.setInterval(() => {
      setActive((id) => {
        const i = PRODUCTS.findIndex((p) => p.id === id);
        return PRODUCTS[(i + 1) % PRODUCTS.length]?.id ?? FIRST_PRODUCT.id;
      });
    }, 4600);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [autoplay]);

  return (
    <section
      className="mx-auto max-w-[1160px] px-5 sm:px-8"
      aria-label="Product demos"
      onMouseEnter={() => setAutoplay(false)}
      onMouseLeave={() => setAutoplay(true)}
    >
      {/* Tabs rail */}
      <div className="relative">
        <div
          ref={listRef}
          className="m-scroll flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-full border border-white/10 bg-white/[0.03] p-1.5 backdrop-blur-md sm:justify-center sm:overflow-visible"
          role="tablist"
        >
          {PRODUCTS.map((p) => {
            const on = p.id === active;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActive(p.id)}
                className={cn(
                  "group relative snap-start whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium transition-colors",
                  on
                    ? "text-[var(--m-ink-fg)]"
                    : "text-white/60 hover:text-white",
                )}
              >
                {on && (
                  <motion.span
                    layoutId="hero-tab-pill"
                    className="absolute inset-0 rounded-full bg-white shadow-[0_10px_30px_-10px_rgba(255,255,255,0.35)]"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative inline-flex items-center gap-1.5">
                  {p.icon}
                  {p.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel */}
      <div className="mt-6 overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] backdrop-blur-md">
        <AnimatePresence mode="wait">
          <motion.div
            key={product.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10"
          >
            <div className="flex flex-col justify-between text-left">
              <div>
                <h3 className="mt-4 text-[clamp(1.6rem,3vw,2.25rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-white">
                  {product.tagline}
                </h3>
                <p className="mt-4 max-w-[52ch] text-[14.5px] leading-relaxed text-white/60">
                  {product.copy}
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-4 text-[12px] text-white/50">
                {PRODUCTS.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActive(p.id)}
                    className={cn(
                      "flex items-center gap-1.5 transition-colors",
                      p.id === active
                        ? "text-[var(--m-accent)]"
                        : "hover:text-white/80",
                    )}
                  >
                    <span className="font-mono tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="uppercase tracking-[0.14em]">
                      {p.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Terminal preview */}
            <div className="min-w-0">
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/60 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]">
                <div className="flex items-center justify-between border-b border-white/8 px-3.5 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-[#ff5f57]/80" />
                    <span className="size-2.5 rounded-full bg-[#febc2e]/80" />
                    <span className="size-2.5 rounded-full bg-[#28c840]/80" />
                    <span className="ml-3 text-[11px] text-white/40">
                      zsh - {product.verb}
                    </span>
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--m-accent)]">
                    live
                  </span>
                </div>
                <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-[1.7] text-white/85">
                  <code>
                    {product.cmd.split("\n").map((line) => (
                      <div key={`${product.id}:${line}`} className="flex">
                        <span className="mr-3 select-none text-white/25">
                          {line.trim().startsWith("#") ? " " : "$"}
                        </span>
                        <span
                          className={
                            line.trim().startsWith("#")
                              ? "text-white/40 italic"
                              : ""
                          }
                        >
                          {line}
                        </span>
                      </div>
                    ))}
                  </code>
                </pre>
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(159,212,204,0.55),transparent)]"
                />
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
