import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { getManagementApiUrl } from "@/lib/env";

export const Route = createFileRoute("/auth/ssh")({
  component: SshAuthRedirectPage,
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
});

/** Dashboard entrypoint: forward CLI re-auth links to the management API. */
function SshAuthRedirectPage() {
  const { token } = Route.useSearch();

  useEffect(() => {
    if (!token) return;
    const base = getManagementApiUrl();
    window.location.replace(
      `${base}/auth/ssh?token=${encodeURIComponent(token)}`,
    );
  }, [token]);

  if (!token) {
    return (
      <main className="grid min-h-svh place-items-center p-8 text-center">
        <div>
          <h1 className="text-lg font-medium">Invalid re-auth link</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Missing challenge token.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-svh place-items-center p-8 text-center">
      <p className="text-muted-foreground text-sm">Redirecting to sign-in…</p>
    </main>
  );
}
