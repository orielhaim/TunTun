import { schema } from "@tunnet/db";
import { isNull } from "drizzle-orm";
import { db } from "../src/lib/db";

const keys = await db.query.apiKeys.findMany({
  where: isNull(schema.apiKeys.revokedAt),
  limit: 20,
});
console.log(
  "keys",
  keys.map((k) => ({
    id: k.id,
    name: k.name,
    organizationId: k.organizationId,
    secretPrefix: k.secretPrefix,
    scopes: k.scopes,
  })),
);

const orgs = await db.query.organization.findMany({ limit: 20 });
console.log(
  "orgs",
  orgs.map((o) => ({ id: o.id, name: o.name, slug: o.slug })),
);

const nets = await db.query.networks.findMany({ limit: 20 });
console.log(
  "nets",
  nets.map((n) => ({
    id: n.id,
    name: n.name,
    organizationId: n.organizationId,
    cidr: n.cidr,
  })),
);

process.exit(0);
