/**
 * Organization Internal CA — issues short-lived leaf certs for TunTun Serve.
 *
 * Root CA PEM is public (distributed in snapshots). Private keys are encrypted
 * at rest with AES-256-GCM using TUNTUN_CA_ENCRYPTION_KEY (32-byte hex or
 * base64). Without that env var, a derived key from a warning-level fallback
 * is used so local dev still works — never use that in production.
 */

import "reflect-metadata";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import * as x509 from "@peculiar/x509";
import { schema } from "@tuntun/db";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "./db";

const LEAF_DAYS = 90;
const CA_YEARS = 10;
const ALG: RsaHashedKeyGenParams = {
  name: "RSASSA-PKCS1-v1_5",
  hash: "SHA-256",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
};

function encryptionKey(): Buffer {
  const raw = process.env.TUNTUN_CA_ENCRYPTION_KEY;
  if (raw) {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
    const b64 = Buffer.from(raw, "base64");
    if (b64.length === 32) return b64;
    throw new Error(
      "TUNTUN_CA_ENCRYPTION_KEY must be 32-byte hex (64 chars) or base64",
    );
  }
  console.warn(
    "TUNTUN_CA_ENCRYPTION_KEY unset — using insecure local-dev CA key",
  );
  return createHash("sha256").update("tuntun-dev-ca-key").digest();
}

export function encryptPem(pem: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(pem, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptPem(blob: string): string {
  const key = encryptionKey();
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

function fingerprintSha256(certPem: string): string {
  const b64 = certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");
  return createHash("sha256").update(Buffer.from(b64, "base64")).digest("hex");
}

async function generateCa(organizationId: string, orgName: string) {
  const keys = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]);
  const notBefore = new Date();
  const notAfter = new Date(notBefore);
  notAfter.setFullYear(notAfter.getFullYear() + CA_YEARS);

  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: randomBytes(16).toString("hex"),
    name: `CN=TunTun Internal CA (${orgName}), O=${organizationId}`,
    notBefore,
    notAfter,
    signingAlgorithm: ALG,
    keys,
    extensions: [
      new x509.BasicConstraintsExtension(true, 0, true),
      new x509.KeyUsagesExtension(
        x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign,
        true,
      ),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
    ],
  });

  const certPem = cert.toString("pem");
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
  const privateKeyPem = pkcs8ToPem(pkcs8);

  return {
    certificatePem: certPem,
    privateKeyPem,
    fingerprintSha256: fingerprintSha256(certPem),
    notBefore,
    notAfter,
  };
}

function pkcs8ToPem(pkcs8: ArrayBuffer): string {
  const b64 = Buffer.from(pkcs8).toString("base64");
  const lines = b64.match(/.{1,64}/g)?.join("\n") ?? b64;
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  return Buffer.from(b64, "base64").buffer.slice(
    Buffer.from(b64, "base64").byteOffset,
    Buffer.from(b64, "base64").byteOffset +
      Buffer.from(b64, "base64").byteLength,
  );
}

/** Ensure org has a root CA; create one if missing. Returns public PEM. */
export async function ensureOrganizationCa(
  organizationId: string,
  orgName = "organization",
): Promise<{ certificatePem: string; fingerprintSha256: string }> {
  const existing = await db.query.organizationCas.findFirst({
    where: eq(schema.organizationCas.organizationId, organizationId),
  });
  if (existing) {
    return {
      certificatePem: existing.certificatePem,
      fingerprintSha256: existing.fingerprintSha256,
    };
  }

  const ca = await generateCa(organizationId, orgName);
  await db.insert(schema.organizationCas).values({
    organizationId,
    certificatePem: ca.certificatePem,
    encryptedPrivateKey: encryptPem(ca.privateKeyPem),
    fingerprintSha256: ca.fingerprintSha256,
    notBefore: ca.notBefore,
    notAfter: ca.notAfter,
  });

  return {
    certificatePem: ca.certificatePem,
    fingerprintSha256: ca.fingerprintSha256,
  };
}

/** Generate a new org CA, replace the old one, and stamp rotatedAt. */
export async function rotateOrganizationCa(
  organizationId: string,
  orgName = "organization",
): Promise<{
  fingerprintSha256: string;
  notBefore: Date;
  notAfter: Date;
  rotatedAt: Date;
}> {
  const ca = await generateCa(organizationId, orgName);
  const rotatedAt = new Date();
  const encryptedPrivateKey = encryptPem(ca.privateKeyPem);

  await db
    .insert(schema.organizationCas)
    .values({
      organizationId,
      certificatePem: ca.certificatePem,
      encryptedPrivateKey,
      fingerprintSha256: ca.fingerprintSha256,
      notBefore: ca.notBefore,
      notAfter: ca.notAfter,
      rotatedAt,
    })
    .onConflictDoUpdate({
      target: schema.organizationCas.organizationId,
      set: {
        certificatePem: ca.certificatePem,
        encryptedPrivateKey,
        fingerprintSha256: ca.fingerprintSha256,
        notBefore: ca.notBefore,
        notAfter: ca.notAfter,
        rotatedAt,
      },
    });

  await db
    .update(schema.internalCertificates)
    .set({ revokedAt: rotatedAt })
    .where(
      and(
        eq(schema.internalCertificates.organizationId, organizationId),
        isNull(schema.internalCertificates.revokedAt),
      ),
    );

  return {
    fingerprintSha256: ca.fingerprintSha256,
    notBefore: ca.notBefore,
    notAfter: ca.notAfter,
    rotatedAt,
  };
}

export type IssuedLeaf = {
  id: string;
  hostname: string;
  certificatePem: string;
  /** Plaintext private key — deliver to agent once, never store plaintext. */
  privateKeyPem: string;
  fingerprintSha256: string;
  notBefore: Date;
  notAfter: Date;
};

/** Issue (or reuse valid) leaf cert for hostname on a machine. */
export async function issueLeafCertificate(input: {
  organizationId: string;
  endpointId: string;
  hostname: string;
  orgName?: string;
}): Promise<IssuedLeaf> {
  await ensureOrganizationCa(input.organizationId, input.orgName);

  const existing = await db.query.internalCertificates.findFirst({
    where: and(
      eq(schema.internalCertificates.endpointId, input.endpointId),
      eq(schema.internalCertificates.hostname, input.hostname),
    ),
  });
  if (
    existing &&
    !existing.revokedAt &&
    existing.notAfter.getTime() > Date.now() + 7 * 86_400_000
  ) {
    return {
      id: existing.id,
      hostname: existing.hostname,
      certificatePem: existing.certificatePem,
      privateKeyPem: decryptPem(existing.encryptedPrivateKey),
      fingerprintSha256: existing.fingerprintSha256,
      notBefore: existing.notBefore,
      notAfter: existing.notAfter,
    };
  }

  const caRow = await db.query.organizationCas.findFirst({
    where: eq(schema.organizationCas.organizationId, input.organizationId),
  });
  if (!caRow) throw new Error("Organization CA missing after ensure");

  const caCert = new x509.X509Certificate(caRow.certificatePem);
  const caKeyPem = decryptPem(caRow.encryptedPrivateKey);
  const caPrivateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(caKeyPem),
    ALG,
    false,
    ["sign"],
  );

  const leafKeys = await crypto.subtle.generateKey(ALG, true, [
    "sign",
    "verify",
  ]);
  const notBefore = new Date();
  const notAfter = new Date(notBefore);
  notAfter.setDate(notAfter.getDate() + LEAF_DAYS);

  const leaf = await x509.X509CertificateGenerator.create({
    serialNumber: randomBytes(16).toString("hex"),
    subject: `CN=${input.hostname}`,
    issuer: caCert.subject,
    notBefore,
    notAfter,
    signingAlgorithm: ALG,
    publicKey: leafKeys.publicKey,
    signingKey: caPrivateKey,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(
        x509.KeyUsageFlags.digitalSignature |
          x509.KeyUsageFlags.keyEncipherment,
        true,
      ),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth]),
      new x509.SubjectAlternativeNameExtension([
        { type: "dns", value: input.hostname },
      ]),
      await x509.SubjectKeyIdentifierExtension.create(leafKeys.publicKey),
      await x509.AuthorityKeyIdentifierExtension.create(caCert),
    ],
  });

  const certificatePem = leaf.toString("pem");
  const privateKeyPem = pkcs8ToPem(
    await crypto.subtle.exportKey("pkcs8", leafKeys.privateKey),
  );
  const fp = fingerprintSha256(certificatePem);

  const [row] = await db
    .insert(schema.internalCertificates)
    .values({
      organizationId: input.organizationId,
      endpointId: input.endpointId,
      hostname: input.hostname,
      certificatePem,
      encryptedPrivateKey: encryptPem(privateKeyPem),
      fingerprintSha256: fp,
      notBefore,
      notAfter,
    })
    .returning();

  return {
    id: row!.id,
    hostname: input.hostname,
    certificatePem,
    privateKeyPem,
    fingerprintSha256: fp,
    notBefore,
    notAfter,
  };
}
