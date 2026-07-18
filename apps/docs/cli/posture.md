# tunnet posture

Inspect device posture attributes collected by the local agent, and evaluate posture definitions without going through the dashboard.

Also see the [Device Posture](/products/posture/) product overview.

## Usage

```bash
tunnet posture status [--json]
tunnet posture check [--file <path>] [--json]
```

## status

Collects attributes once and prints them (or JSON with `--json`).

```bash
tunnet posture status
tunnet posture status --json
```

Typical keys include `device:diskEncryption`, `device:firewallEnabled`, `device:antivirusInstalled`, `node:os`, and `node:tunnetVersion`. Availability depends on OS and collector support.

## check

Evaluates named posture definitions against the attributes just collected.

Without `--file`, definitions are empty and the check reports a trivial pass (useful to confirm collection works). With `--file`, pass a JSON object mapping definition names to assertion arrays:

```json
{
  "secure-workstation": [
    "device:diskEncryption == true",
    "device:firewallEnabled == true"
  ],
  "macos-only": [
    "node:os == 'macos'"
  ]
}
```

```bash
tunnet posture check
tunnet posture check --file ./postures.json
tunnet posture check --file ./postures.json --json
```

Output shows pass/fail per definition, failing assertions, and an overall score when scoring weights are configured.
