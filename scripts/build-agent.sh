#!/usr/bin/env bash
set -euo pipefail

VERSION="${VERSION:-0.1.0}"
API_URL="${API_URL:-https://4-2.xn--p1ai/api}"
INSTALLER_BASE_URL="${INSTALLER_BASE_URL:-https://4-2.xn--p1ai/api/v1/installers}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_ROOT="$REPO_ROOT/apps/agent"
DIST_ROOT="$AGENT_ROOT/dist"

mkdir -p "$DIST_ROOT"
find "$DIST_ROOT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +

TARGETS=(
  "windows windows amd64 zip"
  "windows windows arm64 zip"
  "linux linux amd64 tar.gz"
  "linux linux arm64 tar.gz"
  "darwin macos amd64 tar.gz"
  "darwin macos arm64 tar.gz"
)

items_file="$(mktemp)"
trap 'rm -f "$items_file"' EXIT

for target in "${TARGETS[@]}"; do
  read -r goos platform arch archive <<<"$target"
  work_dir="$DIST_ROOT/${platform}-${arch}"
  mkdir -p "$work_dir"

  if [[ "$goos" == "windows" ]]; then
    binary_name="4-2-agent.exe"
  else
    binary_name="4-2-agent"
  fi

  binary_path="$work_dir/$binary_name"
  (
    cd "$AGENT_ROOT"
    GOOS="$goos" GOARCH="$arch" go build -ldflags "-X main.version=$VERSION" -o "$binary_path" ./cmd/agent
  )

  archive_name="4-2-agent-${platform}-${arch}.${archive}"
  archive_path="$DIST_ROOT/$archive_name"

  if [[ "$archive" == "zip" ]]; then
    (
      cd "$work_dir"
      zip -q -9 "$archive_path" "$binary_name"
    )
  else
    tar -czf "$archive_path" -C "$work_dir" "$binary_name"
  fi

  sha256="$(sha256sum "$archive_path" | awk '{print $1}')"
  if [[ "$platform" == "windows" ]]; then
    install_command="\$installRoot = Join-Path \$env:LOCALAPPDATA '4-2'; Expand-Archive -LiteralPath ./$archive_name -DestinationPath \$installRoot -Force; & (Join-Path \$installRoot '4-2-agent.exe') install --api-url $API_URL --scope user --enrollment-token <token-from-site>"
    notes='["Default install scope is user, not system.","Elevation is a separate explicit step and is never requested silently.","Uses Task Scheduler for persistence in a Windows-native way."]'
  elif [[ "$platform" == "macos" ]]; then
    install_command="tar -xzf ./$archive_name && ./4-2-agent install --api-url $API_URL --scope user --enrollment-token <token-from-site>"
    notes='["Default install scope is user, not system.","Elevation is a separate explicit step and is never requested silently.","Uses launchd with LaunchAgent by default; LaunchDaemon only on explicit elevated install."]'
  else
    install_command="tar -xzf ./$archive_name && ./4-2-agent install --api-url $API_URL --scope user --enrollment-token <token-from-site>"
    notes='["Default install scope is user, not system.","Elevation is a separate explicit step and is never requested silently.","Uses systemd user services by default; system-wide mode requires explicit sudo."]'
  fi

  python3 - <<PY >> "$items_file"
import json
print(json.dumps({
  "platform": "$platform",
  "arch": "$arch",
  "filename": "$archive_name",
  "installCommand": """$install_command""",
  "sha256": "$sha256",
  "url": "$INSTALLER_BASE_URL/$archive_name",
  "notes": json.loads('''$notes'''),
}, ensure_ascii=False))
PY
done

python3 - <<PY
import json
from datetime import datetime, timezone

with open("$items_file", "r", encoding="utf-8") as fh:
    items = [json.loads(line) for line in fh if line.strip()]
with open("$DIST_ROOT/manifest.json", "w", encoding="utf-8") as fh:
    json.dump({
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "items": items,
    }, fh, ensure_ascii=False, indent=2)
PY

echo "Agent artifacts generated in $DIST_ROOT"
