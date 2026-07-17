import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const KEYWORDS = ["sudo", "curl", "irm", "iex", "docker", "compose"];
const TUNNET_VERBS = [
  "enroll",
  "service",
  "status",
  "ping",
  "dns",
  "route",
  "serve",
  "tunnel",
  "send",
  "ssh",
  "invite",
  "join",
  "create",
  "upgrade-to-managed",
  "update",
  "diag",
  "netcheck",
  "login",
  "firewall",
  "requests",
  "accept",
  "deny",
  "kick",
  "connect",
  "recordings",
  "play",
  "sessions",
  "off",
  "list",
  "add",
  "remove",
  "config",
];

function tokenize(line: string) {
  if (line.trim().startsWith("#"))
    return [{ text: line, kind: "cmt" as const }];
  const parts = line.split(/(\s+|"[^"]*"|'[^']*')/g).filter(Boolean);
  return parts.map((p) => {
    if (/^\s+$/.test(p)) return { text: p, kind: "plain" as const };
    if (/^["'].*["']$/.test(p)) return { text: p, kind: "str" as const };
    if (p.startsWith("--") || (p.startsWith("-") && p.length <= 3))
      return { text: p, kind: "flag" as const };
    if (p === "|" || p === "&&" || p === "$" || p === "\\")
      return { text: p, kind: "op" as const };
    if (KEYWORDS.includes(p)) return { text: p, kind: "cmd" as const };
    if (p === "tunnet" || p === "tunnet-relay")
      return { text: p, kind: "cmd" as const };
    if (TUNNET_VERBS.includes(p)) return { text: p, kind: "verb" as const };
    return { text: p, kind: "plain" as const };
  });
}

export function CodeBlock({
  code,
  className,
  showPrompt = true,
}: {
  code: string;
  className?: string;
  showPrompt?: boolean;
}): ReactNode {
  const lines = code.split("\n");
  return (
    <pre
      className={cn(
        "m-scroll overflow-x-auto rounded-lg font-mono text-[13px] leading-[1.75] text-white/90",
        className,
      )}
    >
      <code className="block">
        {lines.map((line) => {
          const isComment = line.trim().startsWith("#");
          return (
            <div key={line} className="flex">
              <span
                className={cn(
                  "mr-3 select-none",
                  showPrompt && !isComment ? "text-white/25" : "opacity-0",
                )}
              >
                $
              </span>
              <span>
                {tokenize(line).map((tok) => {
                  const cls =
                    tok.kind === "cmt"
                      ? "text-white/40 italic"
                      : tok.kind === "cmd"
                        ? "text-[oklch(0.82_0.12_195)]"
                        : tok.kind === "verb"
                          ? "text-[oklch(0.85_0.14_165)]"
                          : tok.kind === "flag"
                            ? "text-[oklch(0.82_0.14_60)]"
                            : tok.kind === "str"
                              ? "text-[oklch(0.88_0.11_90)]"
                              : tok.kind === "op"
                                ? "text-white/50"
                                : "text-white/85";
                  return (
                    <span key={`${tok.kind}:${tok.text}`} className={cls}>
                      {tok.text}
                    </span>
                  );
                })}
              </span>
            </div>
          );
        })}
      </code>
    </pre>
  );
}
