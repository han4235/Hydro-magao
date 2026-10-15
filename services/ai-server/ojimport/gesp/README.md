# Step 03 定级参考材料

- `steps/03-gesp.md`：等级表 + 近两年真题基准名单（LLM 系统提示必含）。
- `training_materials/`：执行 `scripts/sync_ojimport_from_skill.sh`（默认 `OJIMPORT_FULL_GESP_MD=1`）会把 llm-wiki 下全部课件 **PDF/DOCX 转为 .md`** 写入此目录；亦复制已有 `.md`/`.cpp`。单独转换：`python3 scripts/import_gesp_wiki_to_md.py`。PDF 原件可选 `OJIMPORT_COPY_GESP_BINARIES=1` 复制进目录（一般不必，已有 md）。

定级时须对照 `03-gesp.md` 中的真题画像；课件原文见 `training_materials/`（镜像内路径，勿再依赖仓库外的 llm-wiki）。

当前本机已批量转换约 159 份 `.md`（约 1.9MB）。`IMPORT_FAILURES.txt` 列出扫描版 PDF。补全命令：

```bash
cd services/ai-server
python3 scripts/import_gesp_pdf_ocr.py
```

（需 `pip install pymupdf pytesseract`，系统已装 `tesseract` 且含 `chi_sim`。）

LLM 系统提示内课件摘录有 80k 字符上限，完整文件均在目录内供部署与后续检索。
