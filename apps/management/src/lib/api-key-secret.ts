import { randomBytes } from "node:crypto";

const API_KEY_PREFIX = "tt_";
const PREFIX_SEGMENT_LEN = 8;

export function generateApiKeySecret(): {
  secret: string;
  secretPrefix: string;
} {
  const segment = randomBytes(6)
    .toString("base64url")
    .slice(0, PREFIX_SEGMENT_LEN);
  const body = randomBytes(24).toString("base64url");
  const secret = `${API_KEY_PREFIX}${segment}_${body}`;
  return { secret, secretPrefix: segment };
}

export function parseApiKeyPrefix(secret: string): string | null {
  if (!secret.startsWith(API_KEY_PREFIX)) {
    return null;
  }
  const rest = secret.slice(API_KEY_PREFIX.length);
  const underscore = rest.indexOf("_");
  if (underscore <= 0) {
    return null;
  }
  return rest.slice(0, underscore);
}
