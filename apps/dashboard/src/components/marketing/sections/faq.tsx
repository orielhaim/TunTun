import type { ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ = [
  {
    q: "How is Tunnet different from Tailscale or NetBird?",
    a: "Tunnet packages six primitives - mesh, serve, tunnel, send, SSH, relay - under one identity system, and the entire stack is AGPL-3.0. That includes the control plane, dashboard, and relay, not just the agent. You can self-host everything.",
  },
  {
    q: "Do I need to open firewall ports?",
    a: "No. Peers connect outbound over QUIC via iroh. Direct paths are attempted first; relays take over automatically when NAT prevents a direct hop.",
  },
  {
    q: "What is Direct mode?",
    a: "A zero-infrastructure P2P mode where membership lives in an iroh-docs CRDT, peer discovery uses the Mainline DHT, and transport authenticates with a pre-shared key. Perfect for personal fleets and small teams. Run `tunnet upgrade-to-managed` when you outgrow it.",
  },
  {
    q: "Which platforms does the agent support?",
    a: "macOS, Linux, and Windows. Linux and macOS require root to create a TUN interface. Windows requires Administrator with the Wintun driver installed.",
  },
  {
    q: "Can I bring my own relays and certificates?",
    a: "Yes. Register a relay with `tunnet-relay register`, point DNS at it, and either use built-in ACME or bring your own certs. The data plane is fully yours.",
  },
  {
    q: "Does SSH really work without keys?",
    a: "Yes - the SSH primitive is bound to your Tunnet identity. Authentication follows organization policies, sessions can be recorded, and re-auth can be enforced by role.",
  },
  {
    q: "How do file transfers stay honest?",
    a: "Send is built on iroh-blobs with BLAKE3 verification. Transfers are consent-based; you can also multicast to tagged machines and configure auto-accept per rule.",
  },
  {
    q: "What's the license?",
    a: "AGPL-3.0 for the open source stack. Commercial licenses are available for use cases where AGPL doesn't fit. Contributions require a signed CLA.",
  },
];

export function FaqSection(): ReactNode {
  return (
    <section className="relative px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-[900px]">
        <div className="max-w-[46rem]">
          <h2 className="mt-4 m-h-section m-gradient-text">
            The questions everyone asks first.
          </h2>
        </div>
        <Accordion
          type="single"
          collapsible
          className="mt-10 divide-y divide-white/8 border-y border-white/10"
        >
          {FAQ.map((f) => (
            <AccordionItem key={f.q} value={f.q} className="border-none">
              <AccordionTrigger className="py-5 text-left text-base font-medium text-white hover:no-underline data-[state=open]:text-[var(--m-accent)]">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="pb-5 pr-6 text-[15px] leading-relaxed text-white/65">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
