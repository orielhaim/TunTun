import { CheckIcon, CopyIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  className,
  label = "Copy",
}: {
  value: string;
  className?: string;
  label?: string;
}): ReactNode {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        } catch {
          /* ignore */
        }
      }}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--m-border)] bg-[var(--m-surface)] px-2.5 text-[12px] font-medium text-[var(--m-muted)] transition-colors hover:text-[var(--m-fg)] hover:border-[var(--m-border-strong)]",
        className,
      )}
      aria-label={copied ? "Copied" : label}
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-[var(--m-accent)]" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}
