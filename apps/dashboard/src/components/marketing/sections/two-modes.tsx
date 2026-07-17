import {
  ArrowRightIcon,
  BuildingIcon,
  CheckIcon,
  UsersIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { CodeBlock } from "@/components/marketing/shared/code-block";
import { cn } from "@/lib/utils";

const DIRECT = [
  "P2P membership stored in an iroh-docs CRDT",
  "Peer discovery via Mainline DHT",
  "Pre-shared key auth on transport",
  "Zero infrastructure - no server needed",
];

const MANAGED = [
  "Control plane + management API",
  "SSO / OIDC, roles, audit logs",
  "SSH session recording",
  "Tunnel & relay infrastructure",
  "REST API + API keys",
];

export function TwoModesSection(): ReactNode {
  return (
    <section
      id="modes"
      className="relative overflow-hidden px-5 py-24 sm:px-8 sm:py-32"
    >
      <div className="mx-auto max-w-[1160px]">
        <div className="mx-auto max-w-[52rem] text-center">
          <h2 className="mt-4 m-h-section m-gradient-text">
            Solo hackers and 5,000-person orgs.
            <br />
            <span className="m-accent-gradient-text">
              Same tool. Same commands.
            </span>
          </h2>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2 lg:gap-8">
          <ModeCard
            title="Direct mode"
            subtitle="For individuals and small groups"
            body="Spin up a mesh from your laptop with a passphrase. No control plane, no server, no billing."
            icon={<UsersIcon className="size-4" />}
            bullets={DIRECT}
            code={`sudo tunnet create --name my-net --secret "a-strong-passphrase"
tunnet invite --name my-net
sudo tunnet join <INVITE_CODE>
sudo tunnet service start`}
            footer="Free, forever."
          />
          <ModeCard
            title="Managed mode"
            subtitle="For teams and organizations"
            body="Full control plane with SSO, audit, and API. Deploy on your infra or self-host with Docker."
            icon={<BuildingIcon className="size-4" />}
            bullets={MANAGED}
            code={`docker compose up -d
sudo tunnet enroll \\
  --control-url https://control.acme.dev \\
  --token $TOKEN
sudo tunnet service start`}
            footer="Self-host or cloud."
            emphasis
          />
        </div>

        {/* Migration ribbon */}
        <div className="relative mx-auto mt-10 max-w-3xl overflow-hidden rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-5 text-center backdrop-blur">
          <p className="inline-flex flex-wrap items-center justify-center gap-2 text-[13.5px] text-white/85">
            Outgrowing Direct?
            <code className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-[12px] text-[var(--m-accent)]">
              tunnet upgrade-to-managed
            </code>
            migrates your network without losing connectivity.
            <ArrowRightIcon className="size-3.5 text-[var(--m-accent)]" />
          </p>
        </div>
      </div>
    </section>
  );
}

function ModeCard({
  title,
  subtitle,
  body,
  bullets,
  code,
  icon,
  footer,
  emphasis,
}: {
  title: string;
  subtitle: string;
  body: string;
  bullets: string[];
  code: string;
  icon: ReactNode;
  footer: string;
  emphasis?: boolean;
}): ReactNode {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--m-radius-lg)] border p-8 backdrop-blur",
        emphasis
          ? "border-white/15 bg-gradient-to-br from-white/[0.06] via-white/[0.02] to-transparent"
          : "border-white/10 bg-white/[0.02]",
      )}
    >
      {emphasis ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full opacity-70"
          style={{
            background:
              "radial-gradient(closest-side, oklch(0.62 0.18 210 / 0.35), transparent)",
          }}
        />
      ) : null}
      <div className="relative">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-white/70">
          <span className="grid size-5 place-items-center rounded-md bg-[var(--m-accent-soft)] text-[var(--m-accent)]">
            {icon}
          </span>
          {subtitle}
        </div>
        <h3 className="mt-4 text-3xl font-semibold tracking-[-0.02em] text-white">
          {title}
        </h3>
        <p className="mt-2 max-w-[38ch] text-white/60">{body}</p>

        <ul className="mt-6 space-y-2.5">
          {bullets.map((b) => (
            <li
              key={b}
              className="flex items-start gap-2 text-sm text-white/85"
            >
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-[var(--m-accent)]" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-black/50">
          <div className="p-4">
            <CodeBlock code={code} />
          </div>
        </div>

        <p className="mt-5 text-[12px] text-white/45">{footer}</p>
      </div>
    </div>
  );
}
