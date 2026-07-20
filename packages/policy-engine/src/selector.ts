export type ParsedSelector =
  | { kind: "any" }
  | { kind: "endpoint"; value: string }
  | { kind: "tag"; value: string }
  | { kind: "cidr"; value: string }
  | { kind: "user"; value: string }
  | { kind: "host_alias"; value: string }
  | { kind: "ip_set"; value: string };

export class SelectorParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelectorParseError";
  }
}

function isEndpointHex(s: string): boolean {
  return s.length >= 16 && s.length <= 64 && /^[0-9a-fA-F]+$/.test(s);
}

function looksLikeCidr(s: string): boolean {
  return /^[\d.:a-fA-F/]+$/.test(s) && s.includes("/");
}

export function parseSelector(raw: string): ParsedSelector {
  const s = raw.trim();
  if (!s) {
    throw new SelectorParseError("empty selector");
  }
  if (s === "*") {
    return { kind: "any" };
  }
  if (s.startsWith("tag:")) {
    return { kind: "tag", value: s.slice(4) };
  }
  if (s.startsWith("user:")) {
    return { kind: "user", value: s.slice(5) };
  }
  if (s.startsWith("group:user:") || s.startsWith("group:device:")) {
    throw new SelectorParseError(`unsupported group selector: ${s}`);
  }
  if (s.startsWith("host:")) {
    return { kind: "host_alias", value: s.slice(5) };
  }
  if (s.startsWith("ipset:")) {
    return { kind: "ip_set", value: s.slice(6) };
  }
  if (looksLikeCidr(s)) {
    return { kind: "cidr", value: s };
  }
  if (isEndpointHex(s)) {
    return { kind: "endpoint", value: s };
  }
  throw new SelectorParseError(`invalid selector syntax: ${s}`);
}

export function simulationTags(parsed: ParsedSelector): string[] {
  switch (parsed.kind) {
    case "any":
    case "endpoint":
    case "cidr":
      return [];
    case "tag":
      return [parsed.value];
    case "user":
      return [`user:${parsed.value}`, parsed.value];
    case "host_alias":
      return [`host:${parsed.value}`];
    case "ip_set":
      return [`ipset:${parsed.value}`];
  }
}

export function simulationEndpoint(parsed: ParsedSelector): string | undefined {
  if (parsed.kind === "endpoint") {
    return parsed.value;
  }
  return undefined;
}

export function selectorMatches(
  parsed: ParsedSelector,
  endpointHex: string,
  tags: string[],
): boolean {
  switch (parsed.kind) {
    case "any":
      return true;
    case "endpoint":
      return endpointHex === parsed.value;
    case "tag":
      return tags.includes(parsed.value);
    case "user":
      return (
        tags.includes(`user:${parsed.value}`) || tags.includes(parsed.value)
      );
    case "host_alias":
      return tags.includes(`host:${parsed.value}`);
    case "ip_set":
      return tags.includes(`ipset:${parsed.value}`);
    case "cidr":
      return false;
  }
}
