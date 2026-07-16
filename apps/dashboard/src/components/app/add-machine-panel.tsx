import { ExternalLinkIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const platforms = [
  { name: "Linux", href: "#", installed: false },
  { name: "macOS", href: "#", installed: false },
  { name: "Windows", href: "#", installed: false },
  { name: "Docker", href: "#", installed: false },
] as const;

export function AddMachinePanel({ className }: { className?: string }) {
  return (
    <Card className={cn("bg-card/50", className)}>
      <CardHeader>
        <CardTitle className="text-base font-medium">
          Add machines to your organization
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          Install the Tunnet agent, then enroll with a token or quick enroll
          with your organization slug.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {platforms.map((platform) => (
            <a
              key={platform.name}
              href={platform.href}
              className="hover:bg-accent flex items-center justify-between rounded-lg border px-4 py-3 transition-colors"
            >
              <span className="text-sm font-medium">{platform.name}</span>
              <ExternalLinkIcon className="text-muted-foreground size-4" />
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
