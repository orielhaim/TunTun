/**
 * Curated catalog of posture attributes collected by the Tunnet agent.
 */

export type PostureValueType = "bool" | "string" | "number" | "string[]";

export type PostureOperator =
  | "=="
  | "!="
  | ">="
  | "<="
  | ">"
  | "<"
  | "IN"
  | "NOT IN"
  | "IS SET"
  | "IS NOT SET"
  | "MATCHES"
  | "CONTAINS";

export type PostureAttributeCategory =
  | "security"
  | "endpoint"
  | "identity"
  | "system"
  | "macos";

export type PosturePlatform = "windows" | "macos" | "linux" | "any";

export type CatalogAttribute = {
  key: string;
  label: string;
  description: string;
  valueType: PostureValueType;
  suggestedOperators: PostureOperator[];
  platforms: PosturePlatform[];
  category: PostureAttributeCategory;
  /** Suggested enum values for string attributes (optional). */
  enumValues?: string[];
};

export const CATEGORY_LABELS: Record<PostureAttributeCategory, string> = {
  security: "Security controls",
  endpoint: "Endpoint protection",
  identity: "Identity & management",
  system: "System & OS",
  macos: "macOS",
};

const BOOL_OPS: PostureOperator[] = ["==", "!=", "IS SET", "IS NOT SET"];
const STRING_OPS: PostureOperator[] = [
  "==",
  "!=",
  "IN",
  "NOT IN",
  "CONTAINS",
  "MATCHES",
  "IS SET",
  "IS NOT SET",
];
const NUMBER_OPS: PostureOperator[] = [
  "==",
  "!=",
  ">=",
  "<=",
  ">",
  "<",
  "IS SET",
  "IS NOT SET",
];

export const POSTURE_ATTRIBUTES: CatalogAttribute[] = [
  {
    key: "device:diskEncryption",
    label: "Disk encryption",
    description:
      "Full-disk encryption is enabled (BitLocker, FileVault, LUKS).",
    valueType: "bool",
    suggestedOperators: BOOL_OPS,
    platforms: ["any"],
    category: "security",
  },
  {
    key: "device:diskEncryptionType",
    label: "Encryption type",
    description: "Encryption technology in use.",
    valueType: "string",
    suggestedOperators: STRING_OPS,
    platforms: ["any"],
    category: "security",
    enumValues: ["bitlocker", "filevault", "luks", "apfs"],
  },
  {
    key: "device:firewallEnabled",
    label: "Firewall",
    description: "Host firewall is enabled.",
    valueType: "bool",
    suggestedOperators: BOOL_OPS,
    platforms: ["any"],
    category: "security",
  },
  {
    key: "device:secureBoot",
    label: "Secure Boot",
    description: "UEFI Secure Boot is enabled.",
    valueType: "bool",
    suggestedOperators: BOOL_OPS,
    platforms: ["windows", "linux"],
    category: "security",
  },
  {
    key: "device:tpmPresent",
    label: "TPM present",
    description: "A Trusted Platform Module is available.",
    valueType: "bool",
    suggestedOperators: BOOL_OPS,
    platforms: ["windows", "linux"],
    category: "security",
  },
  {
    key: "device:tpmVersion",
    label: "TPM version",
    description: "Reported TPM version string.",
    valueType: "string",
    suggestedOperators: STRING_OPS,
    platforms: ["windows", "linux"],
    category: "security",
  },
  {
    key: "device:screenLockEnabled",
    label: "Screen lock",
    description: "Automatic screen lock / idle lock is enabled.",
    valueType: "bool",
    suggestedOperators: BOOL_OPS,
    platforms: ["any"],
    category: "security",
  },
  {
    key: "device:passwordProtected",
    label: "Password protected",
    description: "Device requires a password or PIN to unlock.",
    valueType: "bool",
    suggestedOperators: BOOL_OPS,
    platforms: ["any"],
    category: "security",
  },
  {
    key: "device:antivirusInstalled",
    label: "Antivirus installed",
    description: "An antivirus / EDR product is installed.",
    valueType: "bool",
    suggestedOperators: BOOL_OPS,
    platforms: ["any"],
    category: "endpoint",
  },
  {
    key: "device:antivirusUpToDate",
    label: "Antivirus up to date",
    description: "Antivirus definitions or agent are current.",
    valueType: "bool",
    suggestedOperators: BOOL_OPS,
    platforms: ["any"],
    category: "endpoint",
  },
  {
    key: "device:antivirusName",
    label: "Antivirus name",
    description: "Name of the installed antivirus product.",
    valueType: "string",
    suggestedOperators: STRING_OPS,
    platforms: ["any"],
    category: "endpoint",
  },
  {
    key: "device:osUpdatePending",
    label: "OS update pending",
    description: "Critical OS updates are waiting to be installed.",
    valueType: "bool",
    suggestedOperators: BOOL_OPS,
    platforms: ["any"],
    category: "endpoint",
  },
  {
    key: "device:mdmManaged",
    label: "MDM managed",
    description: "Device is enrolled in mobile device management.",
    valueType: "bool",
    suggestedOperators: BOOL_OPS,
    platforms: ["any"],
    category: "identity",
  },
  {
    key: "device:domainJoined",
    label: "Domain joined",
    description: "Device is joined to a directory domain.",
    valueType: "bool",
    suggestedOperators: BOOL_OPS,
    platforms: ["windows", "linux"],
    category: "identity",
  },
  {
    key: "device:sipEnabled",
    label: "System Integrity Protection",
    description: "macOS SIP is enabled.",
    valueType: "bool",
    suggestedOperators: BOOL_OPS,
    platforms: ["macos"],
    category: "macos",
  },
  {
    key: "device:gatekeeperEnabled",
    label: "Gatekeeper",
    description: "macOS Gatekeeper is enabled.",
    valueType: "bool",
    suggestedOperators: BOOL_OPS,
    platforms: ["macos"],
    category: "macos",
  },
  {
    key: "node:os",
    label: "Operating system",
    description: "OS family reported by the agent.",
    valueType: "string",
    suggestedOperators: STRING_OPS,
    platforms: ["any"],
    category: "system",
    enumValues: ["windows", "macos", "linux"],
  },
  {
    key: "node:osVersion",
    label: "OS version",
    description: "OS version string.",
    valueType: "string",
    suggestedOperators: STRING_OPS,
    platforms: ["any"],
    category: "system",
  },
  {
    key: "node:osBuild",
    label: "OS build",
    description: "OS build number or identifier.",
    valueType: "string",
    suggestedOperators: STRING_OPS,
    platforms: ["any"],
    category: "system",
  },
  {
    key: "node:arch",
    label: "Architecture",
    description: "CPU architecture.",
    valueType: "string",
    suggestedOperators: STRING_OPS,
    platforms: ["any"],
    category: "system",
    enumValues: ["x86_64", "aarch64", "arm64", "i686"],
  },
  {
    key: "node:hostname",
    label: "Hostname",
    description: "Device hostname.",
    valueType: "string",
    suggestedOperators: STRING_OPS,
    platforms: ["any"],
    category: "system",
  },
  {
    key: "node:kernel",
    label: "Kernel",
    description: "Kernel version string.",
    valueType: "string",
    suggestedOperators: STRING_OPS,
    platforms: ["linux", "macos"],
    category: "system",
  },
  {
    key: "node:tunnetVersion",
    label: "Tunnet version",
    description: "Installed Tunnet agent version.",
    valueType: "string",
    suggestedOperators: [
      "==",
      "!=",
      ">=",
      "<=",
      ">",
      "<",
      "IS SET",
      "IS NOT SET",
    ],
    platforms: ["any"],
    category: "system",
  },
  {
    key: "node:uptime",
    label: "Uptime (seconds)",
    description: "Seconds since last boot.",
    valueType: "number",
    suggestedOperators: NUMBER_OPS,
    platforms: ["any"],
    category: "system",
  },
  {
    key: "device:postureScore",
    label: "Posture score",
    description: "Computed device posture score (0–100).",
    valueType: "number",
    suggestedOperators: NUMBER_OPS,
    platforms: ["any"],
    category: "system",
  },
];

export type AssertionTemplate = {
  id: string;
  label: string;
  description: string;
  assertions: string[];
};

export const ASSERTION_TEMPLATES: AssertionTemplate[] = [
  {
    id: "secure-workstation",
    label: "Secure workstation",
    description: "Encryption, firewall, AV, and screen lock.",
    assertions: [
      "device:diskEncryption == true",
      "device:firewallEnabled == true",
      "device:antivirusInstalled == true",
      "device:antivirusUpToDate == true",
      "device:screenLockEnabled == true",
    ],
  },
  {
    id: "encrypted-only",
    label: "Encrypted only",
    description: "Require full-disk encryption.",
    assertions: ["device:diskEncryption == true"],
  },
  {
    id: "managed-endpoint",
    label: "Managed endpoint",
    description: "MDM enrollment and up-to-date antivirus.",
    assertions: [
      "device:mdmManaged == true",
      "device:antivirusInstalled == true",
      "device:antivirusUpToDate == true",
    ],
  },
  {
    id: "macos-hardened",
    label: "macOS hardened",
    description: "SIP, Gatekeeper, FileVault, and firewall.",
    assertions: [
      "node:os == 'macos'",
      "device:sipEnabled == true",
      "device:gatekeeperEnabled == true",
      "device:diskEncryption == true",
      "device:firewallEnabled == true",
    ],
  },
  {
    id: "windows-baseline",
    label: "Windows baseline",
    description: "Secure Boot, TPM, BitLocker, and firewall.",
    assertions: [
      "node:os == 'windows'",
      "device:secureBoot == true",
      "device:tpmPresent == true",
      "device:diskEncryption == true",
      "device:firewallEnabled == true",
    ],
  },
];

export function getAttributeByKey(key: string): CatalogAttribute | undefined {
  return POSTURE_ATTRIBUTES.find((a) => a.key === key);
}

export function attributesByCategory(): Array<{
  category: PostureAttributeCategory;
  label: string;
  attributes: CatalogAttribute[];
}> {
  const order: PostureAttributeCategory[] = [
    "security",
    "endpoint",
    "identity",
    "macos",
    "system",
  ];
  return order.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    attributes: POSTURE_ATTRIBUTES.filter((a) => a.category === category),
  }));
}

export const OPERATOR_LABELS: Record<PostureOperator, string> = {
  "==": "equals",
  "!=": "does not equal",
  ">=": "at least",
  "<=": "at most",
  ">": "greater than",
  "<": "less than",
  IN: "is one of",
  "NOT IN": "is not one of",
  "IS SET": "is set",
  "IS NOT SET": "is not set",
  MATCHES: "matches",
  CONTAINS: "contains",
};

export function defaultOperatorFor(
  attr: CatalogAttribute | undefined,
): PostureOperator {
  if (!attr) return "==";
  if (attr.valueType === "bool") return "==";
  if (attr.valueType === "number") return ">=";
  return "==";
}

export function defaultValueFor(
  attr: CatalogAttribute | undefined,
  operator: PostureOperator,
): string | boolean | number | string[] | null {
  if (operator === "IS SET" || operator === "IS NOT SET") return null;
  if (operator === "IN" || operator === "NOT IN") {
    return attr?.enumValues?.slice(0, 1) ?? [];
  }
  if (!attr) return "";
  if (attr.valueType === "bool") return true;
  if (attr.valueType === "number") return 0;
  if (attr.enumValues?.[0]) return attr.enumValues[0];
  return "";
}
