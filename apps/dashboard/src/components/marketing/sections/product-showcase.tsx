import { useGSAP } from "@gsap/react";
import { type ReactNode, useRef, useState } from "react";
import {
  registerMarketingMotion,
  revealFrom,
} from "@/components/marketing/motion/landing-timeline";
import { cn } from "@/lib/utils";

type FeatureId = "mesh" | "tunnels" | "access" | "machines";

const FEATURES: {
  id: FeatureId;
  label: string;
  blurb: string;
  title: string;
  points: string[];
}[] = [
  {
    id: "mesh",
    label: "Zero-Trust mesh",
    blurb: "Identity-based paths between every peer.",
    title: "Mesh networking",
    points: [
      "Peers connect with device identity, not shared secrets",
      "Direct paths when possible, relays when needed",
      "One network view for the whole organization",
    ],
  },
  {
    id: "tunnels",
    label: "Tunnels & serves",
    blurb: "Expose services without firewall theatre.",
    title: "Tunnels and serves",
    points: [
      "Spin up ephemeral tunnels for demos and incidents",
      "Name a serve once, share it with the right people",
      "Copy-ready endpoints for humans and automation",
    ],
  },
  {
    id: "access",
    label: "Access control",
    blurb: "Roles that match how you already hire.",
    title: "Roles and access",
    points: [
      "Organization-scoped permissions by default",
      "Custom roles for ops, eng, and contractors",
      "Invites and memberships that stay auditable",
    ],
  },
  {
    id: "machines",
    label: "Machines & relays",
    blurb: "Inventory that stays honest.",
    title: "Machines and relays",
    points: [
      "Online presence you can trust at a glance",
      "Relay health without a second dashboard",
      "CI runners and laptops in the same mesh",
    ],
  },
];

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        ok
          ? "bg-[var(--m-good)] shadow-[0_0_0_3px_oklch(0.78_0.16_155_/_0.2)]"
          : "bg-[var(--m-warn)] shadow-[0_0_0_3px_oklch(0.83_0.14_85_/_0.2)]",
      )}
    />
  );
}

function Panel({
  children,
  title,
  badge,
}: {
  children: ReactNode;
  title: string;
  badge?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40 backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <p className="text-sm font-medium text-white">{title}</p>
        {badge}
      </div>
      {children}
    </div>
  );
}

function MeshDemo() {
  const rows = [
    { name: "gateway", net: "production", status: "Online" },
    { name: "web-01", net: "production", status: "Online" },
    { name: "api-02", net: "production", status: "Online" },
    { name: "runner-ci", net: "build", status: "Online" },
    { name: "postgres", net: "production", status: "Degraded" },
  ];
  return (
    <Panel
      title="Network overview"
      badge={
        <span className="rounded-full bg-[var(--m-accent-soft)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--m-accent)]">
          14 paths
        </span>
      }
    >
      <div className="grid grid-cols-[1.2fr_1fr_0.8fr] gap-2 border-b border-white/8 px-4 py-2 text-[11px] font-medium tracking-wide text-white/50 uppercase">
        <span>Peer</span>
        <span>Network</span>
        <span>Status</span>
      </div>
      <ul>
        {rows.map((row) => (
          <li
            key={row.name}
            className="grid grid-cols-[1.2fr_1fr_0.8fr] items-center gap-2 border-b border-white/6 px-4 py-3 text-sm last:border-0"
          >
            <span className="font-medium text-white">{row.name}</span>
            <span className="text-white/60">{row.net}</span>
            <span className="inline-flex items-center gap-2 text-white/90">
              <StatusDot ok={row.status === "Online"} />
              {row.status}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function TunnelsDemo() {
  const rows = [
    { name: "demo-api", target: "api-02:8080", by: "oriel", status: "Active" },
    {
      name: "staging-db",
      target: "postgres:5432",
      by: "sara",
      status: "Active",
    },
    { name: "ci-cache", target: "runner-ci:6379", by: "bot", status: "Idle" },
  ];
  return (
    <Panel
      title="Active tunnels"
      badge={<span className="text-[11px] text-white/50">3 running</span>}
    >
      <ul>
        {rows.map((row) => (
          <li
            key={row.name}
            className="flex items-center justify-between gap-4 border-b border-white/6 px-4 py-3.5 last:border-0"
          >
            <div>
              <p className="text-sm font-medium text-white">{row.name}</p>
              <p className="mt-0.5 font-mono text-[12px] text-white/50">
                {row.target}
              </p>
            </div>
            <div className="text-right">
              <p className="inline-flex items-center gap-2 text-sm text-white/90">
                <StatusDot ok={row.status === "Active"} />
                {row.status}
              </p>
              <p className="mt-0.5 text-[11px] text-white/40">by {row.by}</p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function AccessDemo() {
  const rows = [
    { role: "Owner", people: "2", scope: "Organization" },
    { role: "Admin", people: "5", scope: "Networks + users" },
    { role: "Operator", people: "12", scope: "Machines + tunnels" },
    { role: "Viewer", people: "28", scope: "Read-only" },
  ];
  return (
    <Panel title="Roles">
      <ul>
        {rows.map((row) => (
          <li
            key={row.role}
            className="flex items-center justify-between border-b border-white/6 px-4 py-3.5 last:border-0"
          >
            <div>
              <p className="text-sm font-medium text-white">{row.role}</p>
              <p className="mt-0.5 text-[12px] text-white/50">{row.scope}</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[12px] font-medium text-white/85">
              {row.people} members
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function MachinesDemo() {
  const rows = [
    { name: "macbook-pro", kind: "Laptop", version: "1.4.2" },
    { name: "edge-relay-1", kind: "Relay", version: "1.4.2" },
    { name: "gha-runner-3", kind: "CI", version: "1.4.1" },
    { name: "api-02", kind: "Server", version: "1.4.2" },
  ];
  return (
    <Panel
      title="Machines"
      badge={
        <span className="inline-flex items-center gap-2 text-[12px] text-white/50">
          <StatusDot ok />
          All reporting
        </span>
      }
    >
      <ul>
        {rows.map((row) => (
          <li
            key={row.name}
            className="flex items-center justify-between border-b border-white/6 px-4 py-3.5 last:border-0"
          >
            <div className="flex items-center gap-3">
              <StatusDot ok />
              <div>
                <p className="text-sm font-medium text-white">{row.name}</p>
                <p className="mt-0.5 text-[12px] text-white/50">{row.kind}</p>
              </div>
            </div>
            <span className="font-mono text-[12px] text-white/50">
              v{row.version}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function DemoFor({ id }: { id: FeatureId }) {
  if (id === "tunnels") return <TunnelsDemo />;
  if (id === "access") return <AccessDemo />;
  if (id === "machines") return <MachinesDemo />;
  return <MeshDemo />;
}

export function ProductShowcaseSection(): ReactNode {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState<FeatureId>("mesh");
  const feature = FEATURES.find((f) => f.id === active) ?? FEATURES[0];

  useGSAP(
    () => {
      registerMarketingMotion();
      if (!root.current) return;
      revealFrom(".showcase-reveal", root.current);
    },
    { scope: root },
  );

  if (!feature) return null;

  return (
    <section
      ref={root}
      id="product"
      className="relative px-5 pb-20 pt-14 sm:px-8 sm:pb-28 sm:pt-16"
    >
      <div className="mx-auto max-w-[1160px]">
        <div className="showcase-reveal grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((item) => {
            const on = item.id === active;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActive(item.id)}
                className={cn(
                  "rounded-2xl border px-4 py-4 text-left transition-[background-color,border-color,transform] duration-200",
                  on
                    ? "border-white/20 bg-gradient-to-br from-white/[0.08] to-white/[0.02] text-white shadow-[0_20px_60px_-30px_oklch(0.62_0.18_210_/_0.55)]"
                    : "border-white/10 bg-white/[0.02] text-white/85 hover:border-white/20 hover:bg-white/[0.04]",
                )}
              >
                <p className="text-sm font-semibold tracking-tight">
                  {item.label}
                </p>
                <p
                  className={cn(
                    "mt-1.5 text-[13px] leading-snug",
                    on ? "text-white/65" : "text-white/50",
                  )}
                >
                  {item.blurb}
                </p>
              </button>
            );
          })}
        </div>

        <div className="showcase-reveal mt-8 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.02] p-5 backdrop-blur sm:mt-10 sm:p-8 lg:p-10">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)] lg:gap-14">
            <div>
              <span className="m-eyebrow">Product</span>
              <h2 className="mt-4 m-h-sub text-white">{feature.title}</h2>
              <ul className="mt-6 space-y-3">
                {feature.points.map((point) => (
                  <li
                    key={point}
                    className="flex gap-3 text-[15px] leading-relaxed text-white/70"
                  >
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--m-accent)]" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div
              key={active}
              className="min-w-0 animate-[fadeIn_0.35s_ease-out]"
            >
              <DemoFor id={active} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
