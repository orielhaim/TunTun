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
              };
              if (payload.type === "presence" && payload.patch) {
                applyPresencePatch(queryClient, activeOrgId, payload.patch);
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
    applyPresencePatch(queryClient, orgId, pickPresenceFields(device));
  }
}
