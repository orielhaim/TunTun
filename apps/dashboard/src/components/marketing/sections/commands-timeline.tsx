import type { ReactNode } from "react";
import { TerminalDemo } from "@/components/marketing/visuals/terminal-demo";
import { Timeline } from "@/components/ui/timeline";

const ITEMS = [
  {
    title: "Enroll",
    content: (
      <TerminalDemo
        title="join the mesh"
        code={`sudo tunnet enroll --control-url https://control.acme.dev --token $TOKEN
sudo tunnet service start
tunnet status --peers`}
      />
    ),
  },
  {
    title: "Route a LAN",
    content: (
      <TerminalDemo
        title="advertise a subnet"
        code={`tunnet route add 192.168.1.0/24
tunnet route list
tunnet netcheck`}
      />
    ),
  },
  {
    title: "Expose internal",
    content: (
      <TerminalDemo
        title="serve to the mesh"
        code={`tunnet serve 3000 \\
  --hostname grafana.acme.mesh \\
  --acl "role:ops"
tunnet serve status`}
      />
    ),
  },
  {
    title: "Public in one command",
    content: (
      <TerminalDemo
        title="public tunnel via relay"
        code={`tunnet tunnel 3000
# → https://demo-api.rl.acme.tunnet.io
tunnet tunnel status`}
      />
    ),
  },
  {
    title: "SSH by identity",
    content: (
      <TerminalDemo
        title="passwordless, keyless SSH"
        code={`tunnet ssh db-server
tunnet ssh db-server -u root
tunnet ssh sessions
tunnet ssh play <session_id>`}
      />
    ),
  },
  {
    title: "Grow up",
    content: (
      <TerminalDemo
        title="direct → managed"
        code={`tunnet upgrade-to-managed
# Migrates your network to the full control plane
# without losing connectivity`}
      />
    ),
  },
];

export function CommandsTimelineSection(): ReactNode {
  return (
    <section className="relative">
      <div className="mx-auto max-w-[1160px] px-5 pt-20 sm:px-8 sm:pt-28">
        <div className="max-w-[52rem]">
          <h2 className="mt-4 m-h-section m-gradient-text">
            A CLI you can read out loud.
          </h2>
          <p className="m-lead mt-6 max-w-[54ch]">
            Every primitive is a verb. Every verb does one thing. Scroll through
            the journey of a machine from install to full-fleet zero-trust.
          </p>
        </div>
      </div>
      <Timeline data={ITEMS} />
    </section>
  );
}
