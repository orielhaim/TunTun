import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  steps?: string[];
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
};

export function EmptyState({
  icon,
  title,
  description,
  steps,
  action,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center",
        className,
      )}
    >
      {icon ? <div className="text-muted-foreground mb-4">{icon}</div> : null}
      <h3 className="text-lg font-medium">{title}</h3>
      {description ? (
        <p className="text-muted-foreground mt-2 max-w-sm text-sm">
          {description}
        </p>
      ) : null}
      {steps && steps.length > 0 ? (
        <ol className="text-muted-foreground mt-4 max-w-md space-y-1.5 text-left text-sm">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-2">
              <span className="text-foreground/70 font-mono text-xs">
                {i + 1}.
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {children}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
