import type { ReactNode } from "react";
import { SearchIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PageToolbarProps = {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  count?: number;
  countLabel?: string;
  filters?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search...",
  count,
  countLabel = "items",
  filters,
  actions,
  className,
}: PageToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        {onSearchChange !== undefined ? (
          <div className="relative w-full max-w-md">
            <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder={searchPlaceholder}
              value={search ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        ) : null}
        {count !== undefined ? (
          <Badge variant="secondary" className="w-fit shrink-0 font-normal">
            {count} {countLabel}
          </Badge>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {filters}
        {actions}
      </div>
    </div>
  );
}
