#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-}"

if [[ -z "$BASE_URL" ]]; then
  echo "Usage: npm run smoke:url -- https://your-deployment-url" >&2
  exit 1
fi

BASE_URL="${BASE_URL%/}"

echo "Smoke test target: $BASE_URL"

request() {
  local path="$1"
  curl -fsS "$BASE_URL$path"
}

echo "1/4 health"
HEALTH="$(request /api/health)"
echo "$HEALTH" | node -e '
let body = "";
process.stdin.on("data", c => body += c);
process.stdin.on("end", () => {
  const data = JSON.parse(body);
  if (!data.ok || data.database !== "ok") {
    console.error("Health check failed:", data);
    process.exit(1);
  }
  console.log(`ok env=${data.appEnv} db=${data.database}`);
});
'

echo "2/4 products"
PRODUCTS="$(request /api/products)"
echo "$PRODUCTS" | node -e '
let body = "";
process.stdin.on("data", c => body += c);
process.stdin.on("end", () => {
  const rows = JSON.parse(body);
  if (!Array.isArray(rows) || rows.length === 0) {
    console.error("Products check failed:", rows);
    process.exit(1);
  }
  console.log(`ok products=${rows.length}`);
});
'

echo "3/4 production capacity"
CAPACITY="$(request /api/bom/GSS20P/production-capacity)"
echo "$CAPACITY" | node -e '
let body = "";
process.stdin.on("data", c => body += c);
process.stdin.on("end", () => {
  const data = JSON.parse(body);
  if (typeof data.maxProducible !== "number") {
    console.error("Capacity check failed:", data);
    process.exit(1);
  }
  console.log(`ok GSS20P maxProducible=${data.maxProducible}`);
});
'

echo "4/4 orchestrator latest"
ORCHESTRATOR="$(request /api/orchestrator/latest)"
echo "$ORCHESTRATOR" | node -e '
let body = "";
process.stdin.on("data", c => body += c);
process.stdin.on("end", () => {
  const data = JSON.parse(body);
  if (typeof data.redCount !== "number" || typeof data.yellowCount !== "number") {
    console.error("Orchestrator check failed:", data);
    process.exit(1);
  }
  console.log(`ok red=${data.redCount} yellow=${data.yellowCount}`);
});
'

echo "Smoke test passed."
