/**
 * 表格行内数学公式里的竖线（`$|s|$` 这种写法）会被 markdown-it 的表格块规则
 * 当成单元格分隔符，于是表头格数和分隔行对不上，GFM 索性放弃整张表，
 * 把整块降级成一个普通段落 —— 页面上就看见一坨带竖线的文字。
 *
 *    | 测试点编号 | $|s| \le$ | 特殊条件 |
 *    |:-:|:-:|:-:|
 *
 * 表头被 escapedSplit 切成 5 格（测试点编号 / $ / s / \le$ / 特殊条件），
 * 分隔行只有 3 格，两者不等 → 整表作废。
 *
 * 这里在块解析之前，把表格块内处于数学区间里的裸 | 转义成 \|。
 * markdown-it 切格子时会把 \| 还原成单个 |，所以 KaTeX 拿到的仍是 |，数学语义不变。
 *
 * 三道闸门，宁漏不误伤：
 *   1. 只认「顶格竖线打头（缩进 ≤3）+ 下一行是合法分隔行」的表格块，
 *      正文段落、代码围栏、行内渲染一律不碰；
 *   2. 只在转义后格数正好等于期望格数、且转义前不相等时才改写（见 needsFix）。
 *      这样 `| 价格 $100 | 无 |` 这种孤零零一个 $ 的格子不会被误判成数学区间而拆坏；
 *   3. 分隔行必须含竖线，免得把 `---`（分隔线/二级标题）认成单列表格的分隔行。
 */

const ROW_RE = /^ {0,3}\|/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const DELIM_CELL_RE = /^:?-+:?$/;

/** 照抄 markdown-it 表格块规则里的 escapedSplit。 */
function escapedSplit(str: string): string[] {
  const result = [];
  let current = '';
  let lastPos = 0;
  let isEscaped = false;
  for (let pos = 0; pos < str.length; pos++) {
    const ch = str.charCodeAt(pos);
    if (ch === 0x7c/* | */) {
      if (!isEscaped) {
        result.push(current + str.substring(lastPos, pos));
        current = '';
        lastPos = pos + 1;
      } else {
        current += str.substring(lastPos, pos - 1);
        lastPos = pos;
      }
    }
    isEscaped = ch === 0x5c/* \ */;
  }
  result.push(current + str.substring(lastPos));
  return result;
}

/** 一行会被切成几个格子（和 markdown-it 一样掐掉首尾空档）。 */
function cellCount(line: string): number {
  const cells = escapedSplit(line.trim());
  if (cells.length && cells[0] === '') cells.shift();
  if (cells.length && cells[cells.length - 1] === '') cells.pop();
  return cells.length;
}

/** 分隔行 -> 列数；不是分隔行返回 0。 */
function delimiterColumns(line: string): number {
  const text = line.trim();
  if (!text.includes('|')) return 0;
  const cells = text.split('|');
  let n = 0;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i].trim();
    if (!cell) {
      // 首尾允许空档，中间不许
      if (i === 0 || i === cells.length - 1) continue;
      return 0;
    }
    if (!DELIM_CELL_RE.test(cell)) return 0;
    n += 1;
  }
  return n;
}

/** 把一行里处于 $...$ 内部的裸 | 转义成 \|，已转义的原样留。 */
function escapeMathPipes(line: string): string {
  let out = '';
  let inMath = false;
  let isEscaped = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (isEscaped) {
      out += ch;
      isEscaped = false;
      continue;
    }
    if (ch === '\\') {
      out += ch;
      isEscaped = true;
      continue;
    }
    if (ch === '$') {
      out += ch;
      inMath = !inMath;
      continue;
    }
    out += (ch === '|' && inMath) ? '\\|' : ch;
  }
  return out;
}

/** 转义能救、且非转义不可时，才返回转义结果，否则返回 null。 */
function needsFix(line: string, expected: number): string | null {
  if (cellCount(line) === expected) return null;
  const fixed = escapeMathPipes(line);
  return cellCount(fixed) === expected ? fixed : null;
}

function fixSource(src: string): string {
  if (src.indexOf('|') === -1 || src.indexOf('$') === -1) return src;
  const lines = src.split('\n');
  let fence = '';
  for (let i = 0; i < lines.length - 1; i++) {
    const mark = FENCE_RE.exec(lines[i]);
    if (mark) {
      const ch = mark[1][0];
      fence = fence === ch ? '' : (fence || ch);
      continue;
    }
    if (fence) continue;
    if (!ROW_RE.test(lines[i])) continue;
    const columnCount = delimiterColumns(lines[i + 1]);
    if (!columnCount) continue;

    const head = needsFix(lines[i], columnCount);
    if (head !== null) lines[i] = head;

    // 表格正文行不参与「表能不能建」的判定（多出的格子被丢、少的被补空），
    // 但格子数错位会串内容，所以同样按列数校正。
    for (let j = i + 2; j < lines.length && ROW_RE.test(lines[j]); j++) {
      const row = needsFix(lines[j], columnCount);
      if (row !== null) lines[j] = row;
    }
  }
  return lines.join('\n');
}

export function mathPipes(md) {
  function fixer(state) {
    if (state.inlineMode) return;
    state.src = fixSource(state.src);
  }
  md.core.ruler.before('block', 'math_pipes', fixer);
}
