import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { getManagementApiUrl } from "@/lib/env";
import {
  type PresencePatch,
  pickPresenceFields,
  presencePatchEqual,
} from "@/lib/presence-patch";
import { queryKeys } from "@/lib/query-keys";

function parseSseChunk(buffer: string): {
  events: Array<{ type?: string; data: string }>;
  rest: string;
} {
  const events: Array<{ type?: string; data: string }> = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";

  for (const part of parts) {
    if (!part.trim() || part.startsWith(":")) continue;
    let eventType: string | undefined;
    const dataLines: string[] = [];
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }
    if (dataLines.length > 0) {
      events.push({ type: eventType, data: dataLines.join("\n") });
    }
  }

  return { events, rest };
}

function applyPresencePatch(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  patch: PresencePatch,
) {
  queryClient.setQueryData<PresencePatch>(
    queryKeys.devicePresence(orgId, patch.endpointId),
    (old) => (presencePatchEqual(old, patch) ? old : patch),
  );
}

function invalidateEntityQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  kind: string,
  networkId: string | null,
) {
  if (kind === "tunnel") {
    void queryClient.invalidateQueries({ queryKey: queryKeys.tunnels(orgId) });
    if (networkId) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.tunnelsByNetwork(orgId, networkId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.topology(orgId, networkId),
      });
    }
  } else if (kind === "serve") {
    void queryClient.invalidateQueries({ queryKey: queryKeys.serves(orgId) });
    if (networkId) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.servesByNetwork(orgId, networkId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.topology(orgId, networkId),
      });
    }
    void queryClient.invalidateQueries({
      queryKey: [...queryKeys.serves(orgId), "peers"],
      exact: false,
    });
  } else if (kind === "relay") {
    void queryClient.invalidateQueries({ queryKey: queryKeys.relays(orgId) });
  }
}

export function usePresenceStream(orgId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!orgId) return;
    const activeOrgId = orgId;

    const controller = new AbortController();
    let buffer = "";

    async function connect() {
      try {
        const response = await fetch(
          `${getManagementApiUrl()}/api/v1/organizations/${activeOrgId}/presence/stream`,
          {
            credentials: "include",
            headers: { "X-Organization-Id": activeOrgId },
            signal: controller.signal,
          },
        );

        if (!response.ok || !response.body) {
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parsed = parseSseChunk(buffer);
          buffer = parsed.rest;

          for (const event of parsed.events) {
            try {
              const payload = JSON.parse(event.data) as {
                type?: string;
                patch?: PresencePatch;
                kind?: string;
                entityId?: string;
                networkId?: string | null;
              };
              if (payload.type === "presence" && payload.patch) {
                applyPresencePatch(queryClient, activeOrgId, payload.patch);
                void queryClient.invalidateQueries({
                  queryKey: queryKeys.machines(activeOrgId),
                });
                void queryClient.invalidateQueries({
                  queryKey: queryKeys.networks(activeOrgId),
                });
              } else if (payload.type === "entity" && payload.kind) {
                invalidateEntityQueries(
                  queryClient,
                  activeOrgId,
                  payload.kind,
                  payload.networkId ?? null,
                );
              }
            } catch {
              // ignore malformed events
            }
          }
        }
      } catch {
        if (!controller.signal.aborted) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          if (!controller.signal.aborted) {
            void connect();
          }
        }
      }
    }

    void connect();

    return () => {
      controller.abort();
    };
  }, [orgId, queryClient]);
}

export function seedPresenceCache(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  devices: Array<Parameters<typeof pickPresenceFields>[0]>,
) {
  for (const device of devices) {
    const key = queryKeys.devicePresence(orgId, device.endpointId);
    const existing = queryClient.getQueryData<PresencePatch>(key);
    const next = pickPresenceFields(device);
    if (existing) {
      const existingHb = existing.lastHeartbeatAt
        ? new Date(existing.lastHeartbeatAt).getTime()
        : 0;
      const nextHb = next.lastHeartbeatAt
        ? new Date(next.lastHeartbeatAt).getTime()
        : 0;
      // Do not clobber a fresher SSE patch with a stale REST snapshot.
      if (existingHb > nextHb) {
        continue;
      }
      if (
        existingHb === nextHb &&
        !existing.agentConnected &&
        next.agentConnected
      ) {
        continue;
      }
    }
    applyPresencePatch(queryClient, orgId, next);
  }
}
