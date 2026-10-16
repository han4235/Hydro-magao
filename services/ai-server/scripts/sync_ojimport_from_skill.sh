#!/usr/bin/env bash
# 从 Cursor 搬题姬 skill 同步到 ai-server/ojimport；GESP 课件自 llm-wiki 同步文本（PDF 可选）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILL="${OJIMPORT_SKILL:-$ROOT/../../.cursor/skills/ojimport-2.0.0}"
THEORY="${THEORY_SAMPLE:-}"
GESP_WIKI="${GESP_WIKI:-$ROOT/../../llm-wiki/raw_sources/GESP_Training_Materials}"
GESP_WIKI_ALT="${GESP_WIKI_ALT:-$ROOT/../../../base/llm-wiki/raw_sources/GESP_Training_Materials}"
DEST="$ROOT/ojimport"
if [[ ! -d "$SKILL/steps" ]]; then
  echo "找不到 skill: $SKILL" >&2
  exit 1
fi
mkdir -p "$DEST/steps" "$DEST/question/testdata" "$DEST/theory" "$DEST/references" "$DEST/gesp/training_materials"
for f in 00-detect-url.md 01-init.md 02-get-info.md 03-gesp.md 04-problem.md 05-config.md \
  06-std.md 07-testdata.md 08-package.md 09-from-file.md 10-from-text.md 11-testdata-only.md \
  12-training.md; do
  cp "$SKILL/steps/$f" "$DEST/steps/$f"
done
sed -i '' 's|llm-wiki/raw_sources/GESP_Training_Materials|ojimport/gesp/training_materials|g' "$DEST/steps/03-gesp.md" 2>/dev/null || \
  sed -i 's|llm-wiki/raw_sources/GESP_Training_Materials|ojimport/gesp/training_materials|g' "$DEST/steps/03-gesp.md"
cp "$SKILL/question/problem.yaml" "$SKILL/question/problem_zh.md" "$DEST/question/"
cp "$SKILL/question/std.cpp" "$SKILL/question/mkdata.cpp" "$SKILL/question/mkin.h" "$DEST/question/"
cp "$SKILL/question/testdata/config.yaml" "$DEST/question/testdata/config.full.yaml"
if [[ -f "$SKILL/references/testdata-design.md" ]]; then
  cp "$SKILL/references/testdata-design.md" "$DEST/references/testdata-design.md"
fi
if [[ ! -f "$DEST/question/testdata/config.sample-only.yaml" ]]; then
  cat >"$DEST/question/testdata/config.sample-only.yaml" <<'EOF'
# ai-server 单题导入：仅写入样例 .in/.out 时使用（完整 25 组见 config.full.yaml）
time: 1s
memory: 128m
EOF
fi
sync_gesp_text() {
  local src="$1"
  [[ -d "$src" ]] || return 0
  find "$src" -maxdepth 1 -type f \( -name '*.md' -o -name '*.cpp' \) -exec cp -f {} "$DEST/gesp/training_materials/" \;
}
sync_gesp_text "$GESP_WIKI"
sync_gesp_text "$GESP_WIKI_ALT"
if [[ "${OJIMPORT_FULL_GESP_MD:-1}" == "1" ]]; then
  echo "批量 PDF/DOCX → md（llm-wiki → ojimport/gesp/training_materials）..."
  python3 "$ROOT/scripts/import_gesp_wiki_to_md.py" || true
  if grep -q '\.pdf$' "$ROOT/ojimport/gesp/training_materials/IMPORT_FAILURES.txt" 2>/dev/null; then
    echo "扫描版 PDF OCR 补全..."
    python3 "$ROOT/scripts/import_gesp_pdf_ocr.py" || exit 1
  fi
fi
if [[ "${OJIMPORT_COPY_GESP_BINARIES:-0}" == "1" ]]; then
  for src in "$GESP_WIKI" "$GESP_WIKI_ALT"; do
    [[ -d "$src" ]] && cp -Rn "$src/"* "$DEST/gesp/training_materials/" 2>/dev/null || true
  done
fi
THEORY_DEFAULT="$ROOT/../../../base/hydroj/生成题目文件/gesp理论题/work_GESP2025610_一级客观题21"
if [[ -z "$THEORY" ]]; then
  THEORY="$THEORY_DEFAULT"
fi
if [[ -d "$THEORY" && -f "$THEORY/problem.yaml" && -f "$THEORY/testdata/config.yaml" ]]; then
  mkdir -p "$DEST/theory/template/testdata"
  cp "$THEORY/problem.yaml" "$DEST/theory/template/problem.yaml"
  cp "$THEORY/problem_zh.md" "$DEST/theory/template/problem_zh.md"
  cp "$THEORY/testdata/config.yaml" "$DEST/theory/template/testdata/config.yaml"
  cp "$THEORY/problem.yaml" "$DEST/theory/example_problem.yaml"
  cp "$THEORY/problem_zh.md" "$DEST/theory/example_problem_zh.md"
  cp "$THEORY/testdata/config.yaml" "$DEST/theory/example_testdata_config.yaml"
  echo "理论卷模版: $THEORY → theory/template/ + example_*"
else
  echo "警告: 未找到理论卷模版 $THEORY（请检查 B 区 work_GESP2025610_一级客观题21）" >&2
fi
echo "已同步到 $DEST（请检查 VERSION、SKILL_AVOID.md、prompts/）"
