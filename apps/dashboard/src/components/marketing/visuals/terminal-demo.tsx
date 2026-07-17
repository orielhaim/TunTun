import type { ReactNode } from "react";
import { CodeBlock } from "@/components/marketing/shared/code-block";
import { CopyButton } from "@/components/marketing/shared/copy-button";
import { cn } from "@/lib/utils";

export function TerminalDemo({
  code,
  title = "zsh - tunnet",
  copyValue,
  className,
  showCopy = true,
  showPrompt = true,
}: {
  code: string;
  title?: string;
  copyValue?: string;
  className?: string;
  showCopy?: boolean;
  showPrompt?: boolean;
}): ReactNode {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-white/10 bg-[#0b0f13] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.7)]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-white/8 px-3.5 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]/80" />
          <span className="size-2.5 rounded-full bg-[#febc2e]/80" />
          <span className="size-2.5 rounded-full bg-[#28c840]/80" />
          <span className="ml-3 text-[11px] text-white/40">{title}</span>
        </div>
        {showCopy ? (
          <CopyButton value={copyValue ?? code} label="Copy" />
        ) : null}
      </div>
      <div className="p-4">
        <CodeBlock code={code} showPrompt={showPrompt} />
      </div>
      {/* Subtle scanline */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(159,212,204,0.55),transparent)]"
      />
    </div>
  );
}
