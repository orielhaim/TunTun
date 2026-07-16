import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSession } from "@/lib/auth.functions";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/consent")({
  validateSearch: (search: Record<string, unknown>) => ({
    client_id:
      typeof search.client_id === "string" ? search.client_id : undefined,
    scope: typeof search.scope === "string" ? search.scope : undefined,
  }),
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: "/consent" } });
    }
  },
  component: ConsentPage,
});

function ConsentPage() {
  const { client_id: clientId, scope } = Route.useSearch();
  const [loading, setLoading] = useState(false);

  async function decide(accept: boolean) {
    setLoading(true);
    const { error } = await authClient.oauth2.consent({
      accept,
      ...(scope ? { scope } : {}),
    });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Consent failed");
    }
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Authorize application</CardTitle>
          <CardDescription>
            {clientId
              ? `Allow this application (${clientId}) to access your Tunnet account?`
              : "Allow this application to access your Tunnet account?"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {scope ? (
            <p className="text-muted-foreground text-sm">
              Requested scopes: <code className="text-foreground">{scope}</code>
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={loading}
              onClick={() => void decide(true)}
            >
              {loading ? "Working..." : "Allow"}
            </Button>
            <Button
              className="flex-1"
              variant="outline"
              disabled={loading}
              onClick={() => void decide(false)}
            >
              Deny
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
