/** Matches control-plane `HEARTBEAT_STALE_SECS` (90s). */
export const HEARTBEAT_ONLINE_MS = 90_000;

/** True when the agent has a live WS session with a fresh heartbeat. */
export function isAgentOnline(
  agentConnected: boolean,
  lastHeartbeatAt: Date | string | null | undefined,
  now = Date.now(),
): boolean {
  if (!agentConnected || !lastHeartbeatAt) {
    return false;
  }
  const at =
    typeof lastHeartbeatAt === "string"
      ? new Date(lastHeartbeatAt).getTime()
      : lastHeartbeatAt.getTime();
  if (Number.isNaN(at)) {
    return false;
  }
  return now - at <= HEARTBEAT_ONLINE_MS;
}
