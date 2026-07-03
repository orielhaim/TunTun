import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export function createDb(connectionString: string) {
  const client = postgres(connectionString, { max: 10 });
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;

let _db: Database | undefined;

export function getDb(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!_db) {
    _db = createDb(url);
  }
  return _db;
}

export function createListenClient(connectionString?: string) {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return postgres(url, { max: 1 });
}

export {
  deviceAgentVersion,
  deviceHostname,
  deviceOs,
  normalizeDeviceMetadata,
  parseDeviceMetadata,
  type DeviceMetadataRecord,
} from "./device-metadata";
export { schema };
export { deriveTenantIpv6 } from "./tenant-ipv6";
export {
  formatIp,
  formatIpv4Cidr,
  isIp,
  isIpv4,
  isIpv6,
  isIpCidr,
  isIpv4Cidr,
} from "./ip";
