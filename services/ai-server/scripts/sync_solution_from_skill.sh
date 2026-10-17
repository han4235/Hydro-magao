#!/usr/bin/env bash
# 从 Cursor 题解 skill（md-playwright-solution）同步到 ai-server/solution。
# 只覆盖 SKILL.md、steps/、references/；VERSION、FLOW.md、prompts/ 由本仓维护。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILL="${SOLUTION_SKILL:-$ROOT/../../.cursor/skills/md-playwright-solution}"
DEST="$ROOT/solution"
if [[ ! -f "$SKILL/SKILL.md" ]]; then
  echo "找不到 skill: $SKILL" >&2
  exit 1
fi
mkdir -p "$DEST/steps" "$DEST/references" "$DEST/prompts"
cp "$SKILL/SKILL.md" "$DEST/SKILL.md"
for f in 00-detect-input.md 01-init.md 02-fetch-problem.md 03-statement.md 04-analysis.md \
  05-code.md 06-complexity.md 07-format-check.md 08-humanize.md 09-save.md 10-batch.md; do
  cp "$SKILL/steps/$f" "$DEST/steps/$f"
done
cp "$SKILL/references/solution-spec.md" "$DEST/references/solution-spec.md"
echo "已同步到 ${DEST}（VERSION、FLOW.md、prompts/ 保留本仓版本）"
