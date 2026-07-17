import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { EntityStatus } from "@/components/app/entity-status";
import { PageHeader } from "@/components/app/page-header";
import { PageToolbar } from "@/components/app/page-toolbar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-permission";
import { useActiveOrganization } from "@/lib/auth-client";
import {
  useMachines,
  useSendSettings,
  useTransferMutations,
  useTransfers,
  useUpdateSendSettings,
} from "@/lib/queries/management";

export const Route = createFileRoute("/app/transfers/")({
  component: TransfersPage,
});

type TransferRow = NonNullable<ReturnType<typeof useTransfers>["data"]>[number];
type ConsentMode = "auto_accept" | "prompt" | "deny";

function TransfersPage() {
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: canManage = false } = useCan(orgId, "transfer", "accept");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [consentEndpointId, setConsentEndpointId] = useState<string>("");

  const statusArg = statusFilter === "all" ? undefined : statusFilter;
  const { data: transfers, isPending } = useTransfers(orgId, statusArg);
  const { data: machines } = useMachines(orgId);
  const { accept, reject } = useTransferMutations(orgId);
  const { data: sendSettings } = useSendSettings(
    orgId,
    consentEndpointId || undefined,
  );
  const updateSendSettings = useUpdateSendSettings(orgId);

  useEffect(() => {
    if (!consentEndpointId && machines && machines.length > 0) {
      setConsentEndpointId(machines[0]?.endpointId);
    }
  }, [machines, consentEndpointId]);

  const filtered = useMemo(() => {
    const list = transfers ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (t) =>
        t.fileName.toLowerCase().includes(q) ||
        t.senderEndpointId.toLowerCase().includes(q) ||
        (t.receiverEndpointId?.toLowerCase().includes(q) ?? false) ||
        t.blake3Hash.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q),
    );
  }, [transfers, search]);

  const columns = useMemo<ColumnDef<TransferRow>[]>(
    () => [
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const s = row.original.status;
          const mapped =
            s === "completed"
              ? "active"
              : s === "failed" || s === "rejected"
                ? "error"
                : s === "transferring" || s === "offered" || s === "pending"
                  ? "pending"
                  : "stopped";
          return <EntityStatus status={mapped} />;
        },
      },
      {
        accessorKey: "fileName",
        header: "File",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.fileName}</div>
            <div className="text-muted-foreground text-xs tabular-nums">
              {formatBytes(row.original.sizeBytes)}
              {row.original.status === "transferring"
                ? ` · ${row.original.progressPct}%`
                : null}
            </div>
          </div>
        ),
      },
      {
        id: "peers",
        header: "From → To",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {shortId(row.original.senderEndpointId)} →{" "}
            {row.original.receiverEndpointId
              ? shortId(row.original.receiverEndpointId)
              : "—"}
          </span>
        ),
      },
      {
        id: "hash",
        header: "Hash",
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-xs">
            {row.original.blake3Hash.slice(0, 12)}…
          </span>
        ),
      },
      {
        id: "when",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {formatDistanceToNow(new Date(row.original.createdAt), {
              addSuffix: true,
            })}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const t = row.original;
          if (t.status !== "pending" || !canManage || !t.receiverEndpointId) {
            return null;
          }
          return (
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={accept.isPending || reject.isPending}
                onClick={() =>
                  accept.mutate({
                    transferId: t.id,
                    endpointId: t.receiverEndpointId!,
                  })
                }
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={accept.isPending || reject.isPending}
                onClick={() =>
                  reject.mutate({
                    transferId: t.id,
                    endpointId: t.receiverEndpointId!,
                  })
                }
              >
                Reject
              </Button>
            </div>
          );
        },
      },
    ],
    [accept, reject, canManage],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transfers"
        description="P2P file transfers across the mesh"
      />

      {canManage && machines && machines.length > 0 ? (
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="consent-machine">Machine consent</Label>
            <Select
              value={consentEndpointId}
              onValueChange={(value) => {
                if (value) setConsentEndpointId(value);
              }}
            >
              <SelectTrigger id="consent-machine" className="w-[220px]">
                <SelectValue placeholder="Select machine" />
              </SelectTrigger>
              <SelectContent>
                {machines.map((m) => (
                  <SelectItem key={m.endpointId} value={m.endpointId}>
                    {m.hostname || shortId(m.endpointId)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="consent-mode">Mode</Label>
            <Select
              value={sendSettings?.consentMode ?? "prompt"}
              disabled={
                !consentEndpointId ||
                updateSendSettings.isPending ||
                sendSettings === undefined
              }
              onValueChange={(value) => {
                if (!consentEndpointId) return;
                updateSendSettings.mutate({
                  endpointId: consentEndpointId,
                  consentMode: value as ConsentMode,
                });
              }}
            >
              <SelectTrigger id="consent-mode" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto_accept">Auto-accept</SelectItem>
                <SelectItem value="prompt">Prompt</SelectItem>
                <SelectItem value="deny">Deny</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Checkbox
              id="pin-blobs"
              checked={sendSettings?.pinBlobs ?? false}
              disabled={
                !consentEndpointId ||
                updateSendSettings.isPending ||
                sendSettings === undefined
              }
              onCheckedChange={(checked) => {
                if (!consentEndpointId) return;
                updateSendSettings.mutate({
                  endpointId: consentEndpointId,
                  pinBlobs: checked === true,
                });
              }}
            />
            <Label htmlFor="pin-blobs">Pin blobs after receive</Label>
          </div>
        </div>
      ) : null}

      <PageToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search file, peer, hash…"
        filters={
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              if (value) setStatusFilter(value);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="transferring">Transferring</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No transfers"
          description="Send a file with `tunnet send ./file peer` or from the SDK."
        />
      ) : (
        <DataTable columns={columns} data={filtered} />
      )}
    </div>
  );
}

function shortId(id: string) {
  return id.length <= 10 ? id : `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
}
