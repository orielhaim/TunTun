import {
  type ParsedSelector,
  parseSelector,
  SelectorParseError,
} from "./selector";
import {
  aclKey,
  type PolicyDocument,
  type ValidationIssue,
  type ValidationResult,
} from "./types";

function issue(path: string | undefined, message: string): ValidationIssue {
  return { path, message };
}

function checkUnique(
  names: string[],
  entity: string,
  errors: ValidationIssue[],
): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      errors.push(issue(entity, `duplicate name '${name}'`));
    }
    seen.add(name);
  }
}

function isValidPortSpec(spec: string): boolean {
  const single = Number.parseInt(spec, 10);
  if (!Number.isNaN(single) && single > 0 && single <= 65535) {
    return true;
  }
  const dash = spec.split("-");
  if (dash.length === 2) {
    const start = Number.parseInt(dash[0] ?? "", 10);
    const end = Number.parseInt(dash[1] ?? "", 10);
    return (
      !Number.isNaN(start) &&
      !Number.isNaN(end) &&
      start > 0 &&
      end > 0 &&
      start <= end
    );
  }
  return false;
}

function checkSelectorRefs(
  sel: string,
  path: string,
  refs: {
    tags: Set<string>;
    hostAliases: Set<string>;
    ipSets: Set<string>;
  },
  errors: ValidationIssue[],
): void {
  let parsed: ParsedSelector;
  try {
    parsed = parseSelector(sel);
  } catch (error) {
    const message =
      error instanceof SelectorParseError ? error.message : String(error);
    errors.push(issue(path, message));
    return;
  }

  switch (parsed.kind) {
    case "tag":
      if (!refs.tags.has(parsed.value)) {
        errors.push(issue(path, `unknown tag '${parsed.value}'`));
      }
      break;
    case "host_alias":
      if (!refs.hostAliases.has(parsed.value)) {
        errors.push(issue(path, `unknown host alias '${parsed.value}'`));
      }
      break;
    case "ip_set":
      if (!refs.ipSets.has(parsed.value)) {
        errors.push(issue(path, `unknown ip set '${parsed.value}'`));
      }
      break;
    default:
      break;
  }
}

export function validateDocument(doc: PolicyDocument): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const tags = new Set(doc.tags.map((t) => t.name));
  const hostAliases = new Set(doc.host_aliases.map((h) => h.name));
  const ipSets = new Set(doc.ip_sets.map((s) => s.name));
  const postures = new Set(doc.postures.map((p) => p.name));

  checkUnique(
    doc.tags.map((t) => t.name),
    "tags",
    errors,
  );
  checkUnique(doc.acls.map(aclKey), "acls", errors);

  const refs = { tags, hostAliases, ipSets };

  for (const acl of doc.acls) {
    if (acl.action !== "allow" && acl.action !== "deny") {
      errors.push(
        issue(
          `acls.${acl.name}`,
          `invalid action '${acl.action}', expected allow or deny`,
        ),
      );
    }
    if (acl.src.length === 0) {
      warnings.push(issue(`acls.${acl.name}.src`, "empty src matches nothing"));
    }
    if (acl.dst.length === 0) {
      warnings.push(issue(`acls.${acl.name}.dst`, "empty dst matches nothing"));
    }
    for (const sel of [...acl.src, ...acl.dst]) {
      checkSelectorRefs(sel, `acls.${acl.name}`, refs, errors);
    }
    for (const posture of acl.posture) {
      if (!postures.has(posture)) {
        errors.push(
          issue(`acls.${acl.name}.posture`, `unknown posture '${posture}'`),
        );
      }
    }
    for (const port of acl.ports) {
      if (!isValidPortSpec(port)) {
        errors.push(
          issue(`acls.${acl.name}.ports`, `invalid port spec '${port}'`),
        );
      }
    }
  }

  for (const test of doc.tests) {
    try {
      parseSelector(test.src);
    } catch (error) {
      const message =
        error instanceof SelectorParseError ? error.message : String(error);
      errors.push(issue(`tests.${test.name}.src`, message));
    }
    for (const dst of [...test.accept, ...test.deny]) {
      const selectorPart = dst.includes(":") ? dst.split(":")[0] : dst;
      try {
        parseSelector(selectorPart === dst ? dst : dst.replace(/:[^:]*$/, ""));
      } catch {
        try {
          parseSelector(dst);
        } catch (error) {
          const message =
            error instanceof SelectorParseError ? error.message : String(error);
          errors.push(issue(`tests.${test.name}.dst`, message));
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
