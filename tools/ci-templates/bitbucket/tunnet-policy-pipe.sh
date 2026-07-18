#!/usr/bin/env bash
# Bitbucket Pipelines pipe for Tunnet policy-as-code.
#
# Usage in bitbucket-pipelines.yml:
#
#   - pipe: ./tools/ci-templates/bitbucket/tunnet-policy-pipe.sh
#     variables:
#       ACTION: test
#       POLICY_PATH: .tunnet
#       TUNNET_API_URL: $TUNNET_API_URL
#       TUNNET_API_KEY: $TUNNET_API_KEY
#
# Apply on main:
#
#   - pipe: ./tools/ci-templates/bitbucket/tunnet-policy-pipe.sh
#     variables:
#       ACTION: apply
#       FORCE: "false"

set -euo pipefail

ACTION="${ACTION:-test}"
POLICY_PATH="${POLICY_PATH:-.tunnet}"
FORCE="${FORCE:-false}"
SIMULATE_SCENARIOS="${SIMULATE_SCENARIOS:-[]}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION_DIR="$(cd "${SCRIPT_DIR}/../../gitops-policy-action" && pwd)"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required but was not found in PATH" >&2
  exit 1
fi

if [[ -z "${TUNNET_API_URL:-}" ]]; then
  echo "TUNNET_API_URL is required" >&2
  exit 1
fi

if [[ -z "${TUNNET_API_KEY:-}" ]]; then
  echo "TUNNET_API_KEY is required" >&2
  exit 1
fi

cd "${ACTION_DIR}"
bun install

export INPUT_ACTION="${ACTION}"
export INPUT_POLICY_PATH="${POLICY_PATH}"
export INPUT_TUNNET_API_URL="${TUNNET_API_URL}"
export INPUT_TUNNET_API_KEY="${TUNNET_API_KEY}"
export INPUT_COMMENT_ON_PR="false"
export INPUT_SIMULATE_SCENARIOS="${SIMULATE_SCENARIOS}"
export INPUT_FORCE="${FORCE}"

exec bun run src/index.ts
