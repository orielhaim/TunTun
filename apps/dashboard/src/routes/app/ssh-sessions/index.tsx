import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { EntityStatus } from "@/components/app/entity-status";
import { PageHeader } from "@/components/app/page-header";
import { PageToolbar } from "@/components/app/page-toolbar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { isAdminRole, useMemberRole } from "@/hooks/use-member-role";
import { useActiveOrganization } from "@/lib/auth-client";
import {
  useSshRecording,
  useSshRecordings,
  useSshSessionMutations,
  useSshSessions,
} from "@/lib/queries/management";
import "asciinema-player/dist/bundle/asciinema-player.css";

export const Route = createFileRoute("/app/ssh-sessions/")({
  component: SshSessionsPage,
});

type SessionRow = NonNullable<
  ReturnType<typeof useSshSessions>["data"]
>[number];

function SshSessionsPage() {
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: role } = useMemberRole(orgId);
  const isAdmin = isAdminRole(role);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [playSessionId, setPlaySessionId] = useState<string | null>(null);
  const [killId, setKillId] = useState<string | null>(null);

  const statusArg = statusFilter === "all" ? undefined : statusFilter;
  const { data: sessions, isPending } = useSshSessions(orgId, statusArg);
  const { data: recordings } = useSshRecordings(orgId);
  const { kill } = useSshSessionMutations(orgId);

  const recordingSessionIds = useMemo(
    () => new Set((recordings ?? []).map((r) => r.sessionId)),
    [recordings],
  );

  const filtered = useMemo(() => {
    const list = sessions ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.targetUser.toLowerCase().includes(q) ||
        (s.srcHostname?.toLowerCase().includes(q) ?? false) ||
        (s.dstHostname?.toLowerCase().includes(q) ?? false) ||
        s.id.toLowerCase().includes(q),
    );
  }, [sessions, search]);

  const columns = useMemo<ColumnDef<SessionRow>[]>(
    () => [
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <EntityStatus
            status={
              row.original.status === "ended"
                ? "stopped"
                : row.original.status === "killed"
                  ? "error"
                  : row.original.status
            }
          />
        ),
      },
      {
        id: "path",
        header: "Peer → Machine",
        cell: ({ row }) => {
          const s = row.original;
          const from = s.srcHostname ?? s.srcEndpointId.slice(0, 8);
          const to = s.dstHostname ?? s.dstEndpointId.slice(0, 8);
          return (
            <span className="font-mono text-xs">
              {from} → {to}
            </span>
          );
        },
      },
      {
        id: "user",
        header: "User",
        cell: ({ row }) => row.original.targetUser,
      },
      {
        id: "started",
        header: "Started",
        cell: ({ row }) =>
          formatDistanceToNow(new Date(row.original.startedAt), {
            addSuffix: true,
          }),
      },
      {
        id: "duration",
        header: "Duration",
        cell: ({ row }) => {
          const ms = row.original.durationMs;
          if (ms == null) {
            if (row.original.status === "active") return "live";
            return "—";
          }
          const secs = Math.round(ms / 1000);
          if (secs < 60) return `${secs}s`;
          return `${Math.floor(secs / 60)}m ${secs % 60}s`;
        },
      },
      {
        id: "recorded",
        header: "Recorded",
        cell: ({ row }) =>
          row.original.recorded || recordingSessionIds.has(row.original.id)
            ? "yes"
            : "no",
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const s = row.original;
          const canPlay = s.recorded || recordingSessionIds.has(s.id);
          return (
            <div className="flex justify-end gap-2">
              {canPlay ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPlaySessionId(s.id)}
                >
                  Play
                </Button>
              ) : null}
              {isAdmin && s.status === "active" ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setKillId(s.id)}
                >
                  Kill
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [isAdmin, recordingSessionIds],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="SSH Sessions"
        description="Live and historical mesh SSH sessions, with recording playback."
      />
      <PageToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Filter by user, machine, or session…"
        count={filtered.length}
        countLabel={filtered.length === 1 ? "session" : "sessions"}
        filters={
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value ?? "all")}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="ended">Ended</SelectItem>
              <SelectItem value="killed">Killed</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No SSH sessions"
          description="Sessions appear here when peers connect with tunnet ssh."
        />
      ) : (
        <DataTable columns={columns} data={filtered} />
      )}

      <ConfirmDialog
        open={killId != null}
        onOpenChange={(open) => {
          if (!open) setKillId(null);
        }}
        title="Kill SSH session?"
        description="This force-closes the remote PTY session on the destination agent."
        confirmLabel="Kill session"
        destructive
        onConfirm={async () => {
          if (!killId) return;
          await kill.mutateAsync(killId);
          setKillId(null);
        }}
      />

      <Dialog
        open={playSessionId != null}
        onOpenChange={(open) => {
          if (!open) setPlaySessionId(null);
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Session recording</DialogTitle>
          </DialogHeader>
          {playSessionId ? (
            <CastPlayer orgId={orgId} sessionId={playSessionId} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CastPlayer({
  orgId,
  sessionId,
}: {
  orgId: string | undefined;
  sessionId: string;
}) {
  const { data, isPending, error } = useSshRecording(orgId, sessionId);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data?.castText || !hostRef.current) return;
    let disposed = false;
    let player: { dispose: () => void } | null = null;
    void import("asciinema-player").then((mod) => {
      if (disposed || !hostRef.current) return;
      hostRef.current.innerHTML = "";
      player = mod.create({ data: data.castText }, hostRef.current, {
        fit: "width",
        autoPlay: true,
        preload: true,
      });
    });
    return () => {
      disposed = true;
      player?.dispose();
    };
  }, [data?.castText]);

  if (isPending) return <Skeleton className="h-64 w-full" />;
  if (error || !data) {
    return (
      <p className="text-muted-foreground text-sm">
        Recording not available for this session.
      </p>
    );
  }
  return <div ref={hostRef} className="min-h-64 w-full overflow-hidden" />;
}
