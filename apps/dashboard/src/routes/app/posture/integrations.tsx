import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { CableIcon, PlusIcon, RefreshCwIcon, TrashIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { EmptyState } from "@/components/app/empty-state";
import {
  defaultConfigFor,
  INTEGRATION_PROVIDERS,
  IntegrationFormFields,
  type IntegrationFormValues,
  sanitizeIntegrationConfig,
  validateIntegrationForm,
} from "@/components/app/posture/integration-form";
import { PosturePageShell } from "@/components/app/posture/posture-page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-permission";
import { useActiveOrganization } from "@/lib/auth-client";
import type { PostureIntegration } from "@/lib/posture-types";
import {
  usePostureIntegrations,
  usePostureMutations,
} from "@/lib/queries/management";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/posture/integrations")({
  component: PostureIntegrationsPage,
});

function ProviderMark({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex size-5 items-center justify-center rounded text-[9px] font-bold tracking-tight",
        className,
      )}
      aria-hidden
    >
      {children}
    </span>
  );
}

const PROVIDER_META: Record<
  PostureIntegration["provider"],
  { label: string; icon: ReactNode }
> = {
  crowdstrike: {
    label: "CrowdStrike",
    icon: (
      <ProviderMark className="bg-foreground text-background">CS</ProviderMark>
    ),
  },
  sentinelone: {
    label: "SentinelOne",
    icon: (
      <ProviderMark className="bg-foreground text-background">S1</ProviderMark>
    ),
  },
  intune: {
    label: "Microsoft Intune",
    icon: (
      <ProviderMark className="bg-muted-foreground text-background">
        IN
      </ProviderMark>
    ),
  },
  custom: {
    label: "Custom webhook",
    icon: <CableIcon className="size-5" aria-hidden />,
  },
};

function formatPollInterval(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  return `${Math.round(secs / 3600)}h`;
}

function PostureIntegrationsPage() {
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: integrations, isPending } = usePostureIntegrations(orgId);
  const { data: canCreate = false } = useCan(orgId, "posture", "create");
  const { data: canUpdate = false } = useCan(orgId, "posture", "update");
  const { data: canDelete = false } = useCan(orgId, "posture", "delete");
  const mutations = usePostureMutations(orgId);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  if (!orgId) {
    return (
      <PosturePageShell>
        <IntegrationsSkeleton />
      </PosturePageShell>
    );
  }

  return (
    <PosturePageShell
      actions={
        canCreate ? (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <PlusIcon className="mr-1.5 size-3.5" />
            Add integration
          </Button>
        ) : undefined
      }
    >
      {isPending ? (
        <IntegrationsSkeleton />
      ) : !integrations?.length ? (
        <EmptyState
          icon={<CableIcon className="size-8" />}
          title="Connect a security platform"
          description="Import posture signals from CrowdStrike, SentinelOne, Intune, or a custom webhook to enrich device compliance checks."
          action={
            canCreate ? (
              <Button onClick={() => setCreateOpen(true)}>
                Add integration
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Integrations">
          {integrations.map((item) => {
            const meta = PROVIDER_META[item.provider];
            return (
              <li
                key={item.id}
                className="flex flex-col gap-4 rounded-lg border border-border/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-md">
                      {meta.icon}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium">{meta.label}</p>
                      <p className="text-muted-foreground text-xs">
                        Polls every{" "}
                        {formatPollInterval(item.pollingIntervalSecs)}
                        {" · "}
                        {item.lastSyncedAt
                          ? `Synced ${formatDistanceToNow(new Date(item.lastSyncedAt), { addSuffix: true })}`
                          : "Never synced"}
                      </p>
                    </div>
                  </div>
                  <Badge variant={item.enabled ? "default" : "secondary"}>
                    {item.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>

                <div className="mt-auto flex justify-end gap-1">
                  {canUpdate ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mutations.syncIntegration.isPending}
                      onClick={() => {
                        setSyncingId(item.id);
                        void mutations.syncIntegration
                          .mutateAsync(item.id)
                          .then(() => toast.success("Sync started"))
                          .catch((err: Error) => toast.error(err.message))
                          .finally(() => setSyncingId(null));
                      }}
                    >
                      <RefreshCwIcon
                        className={cn(
                          "mr-1.5 size-3.5",
                          syncingId === item.id && "animate-spin",
                        )}
                      />
                      Sync now
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${meta.label}`}
                      onClick={() => setDeleteId(item.id)}
                    >
                      <TrashIcon className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <CreateIntegrationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        loading={mutations.createIntegration.isPending}
        onSubmit={async (values) => {
          try {
            await mutations.createIntegration.mutateAsync(values);
            toast.success("Integration created");
            setCreateOpen(false);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to create",
            );
          }
        }}
      />

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Remove integration"
        description="External posture attributes from this integration will stop updating."
        confirmLabel="Remove"
        destructive
        loading={mutations.removeIntegration.isPending}
        onConfirm={async () => {
          if (!deleteId) return;
          try {
            await mutations.removeIntegration.mutateAsync(deleteId);
            toast.success("Integration removed");
            setDeleteId(null);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to remove",
            );
          }
        }}
      />
    </PosturePageShell>
  );
}

function CreateIntegrationDialog({
  open,
  onOpenChange,
  loading,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  onSubmit: (values: {
    provider: PostureIntegration["provider"];
    config: Record<string, unknown>;
    pollingIntervalSecs?: number;
    enabled?: boolean;
  }) => Promise<void>;
}) {
  const [form, setForm] = useState<IntegrationFormValues>({
    provider: "crowdstrike",
    config: defaultConfigFor("crowdstrike"),
    pollingIntervalSecs: 300,
    enabled: true,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      provider: "crowdstrike",
      config: defaultConfigFor("crowdstrike"),
      pollingIntervalSecs: 300,
      enabled: true,
    });
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add integration</DialogTitle>
        </DialogHeader>
        <IntegrationFormFields value={form} onChange={setForm} />
        <p className="text-muted-foreground text-[11px]">
          {
            INTEGRATION_PROVIDERS.find((p) => p.value === form.provider)
              ?.description
          }
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            disabled={loading}
            onClick={() => {
              const error = validateIntegrationForm(form);
              if (error) {
                toast.error(error);
                return;
              }
              void onSubmit({
                provider: form.provider,
                config: sanitizeIntegrationConfig(form.provider, form.config),
                enabled: form.enabled,
                pollingIntervalSecs: form.pollingIntervalSecs,
              });
            }}
          >
            {loading ? "Creating…" : "Create integration"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IntegrationsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Skeleton className="h-36 w-full rounded-lg" />
      <Skeleton className="h-36 w-full rounded-lg" />
    </div>
  );
}
