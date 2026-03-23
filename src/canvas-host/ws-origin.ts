import { isLoopbackHost } from "../gateway/net.js";
import { isTruthyEnvValue } from "../infra/env.js";

/**
 * Validates the Origin header for WebSocket upgrade requests.
 * Reuses isLoopbackHost() which already handles:
 * localhost, 127.x.x.x, ::1, [::1], ::ffff:127.x.x.x
 */
export function isAllowedWebSocketOrigin(origin: string | undefined): boolean {
  if (isTruthyEnvValue(process.env.OPENCLAW_SKIP_WS_ORIGIN_CHECK)) {
    return true;
  }
  if (!origin || origin === "null") {
    return false;
  }
  try {
    const parsed = new URL(origin);
    return isLoopbackHost(parsed.hostname);
  } catch {
    return false;
  }
}
