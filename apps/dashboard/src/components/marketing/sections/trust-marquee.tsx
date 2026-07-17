import type { ReactNode } from "react";
import {
  FaApple,
  FaAws,
  FaDocker,
  FaGithub,
  FaGoogle,
  FaLinux,
  FaWindows,
} from "react-icons/fa";
import {
  SiCloudflare,
  SiGnometerminal,
  SiKubernetes,
  SiNixos,
  SiPostgresql,
  SiRust,
  SiTerraform,
} from "react-icons/si";
import { Marquee } from "@/components/ui/marquee";

const LOGOS = [
  { icon: FaApple, label: "macOS" },
  { icon: FaLinux, label: "Linux" },
  { icon: FaWindows, label: "Windows" },
  { icon: SiGnometerminal, label: "OpenSSH" },
  { icon: FaDocker, label: "Docker" },
  { icon: SiKubernetes, label: "Kubernetes" },
  { icon: SiPostgresql, label: "Postgres" },
  { icon: FaGithub, label: "GitHub Actions" },
  { icon: SiTerraform, label: "Terraform" },
  { icon: FaAws, label: "AWS" },
  { icon: FaGoogle, label: "GCP" },
  { icon: SiCloudflare, label: "Cloudflare" },
  { icon: SiNixos, label: "NixOS" },
  { icon: SiRust, label: "Rust" },
];

export function TrustMarquee(): ReactNode {
  return (
    <section className="relative border-y border-white/8 bg-[var(--m-bg-2)]/60 py-10 backdrop-blur">
      <p className="mx-auto mb-6 max-w-[1160px] px-5 text-center text-[11px] font-medium uppercase tracking-[0.16em] text-white/45 sm:px-8">
        Runs on what you already run
      </p>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-[linear-gradient(90deg,var(--m-bg),transparent)]" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-[linear-gradient(270deg,var(--m-bg),transparent)]" />
        <Marquee pauseOnHover className="[--duration:42s] [--gap:3rem]">
          {LOGOS.map((l) => (
            <div
              key={l.label}
              className="flex items-center gap-2 text-white/55 transition-colors hover:text-white"
            >
              <l.icon className="size-5" />
              <span className="text-[13px] font-medium">{l.label}</span>
            </div>
          ))}
        </Marquee>
      </div>
    </section>
  );
}
