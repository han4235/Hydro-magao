import $ from 'jquery';
import { renderLanguageSelect } from 'vj/components/languageselect';
import { load } from 'vj/components/monaco/loader';
import { NamedPage } from 'vj/misc/Page';
import { getAvailableLangs } from 'vj/utils';

const page = new NamedPage(['problem_submit', 'contest_detail_problem_submit', 'homework_detail_problem_submit'], async () => {
  const { config } = UiContext.pdoc;
  if (config.type === 'submit_answer') {
    $('[name="lang"]').val('_');
    return;
  }
  const availableLangs = getAvailableLangs(config.langs);
  const mainLangs = {};
  const preferences = [UserContext.codeLang || ''];
  for (const key in availableLangs) {
    if (config.langs && !config.langs.filter((i) => i === key || i.startsWith(`${key}.`)).length) continue;
    if (window.LANGS[key].pretest === preferences[0]) preferences.push(key);
    if (!key.includes('.')) mainLangs[key] = window.LANGS[key].display;
    else {
      const a = key.split('.')[0];
      mainLangs[a] = window.LANGS[a].display;
    }
  }
  for (const key in availableLangs) {
    if (config.langs && !config.langs.filter((i) => i === key || i.startsWith(`${key}.`)).length) continue;
    if (typeof window.LANGS[key]?.pretest === 'string' && window.LANGS[key].pretest.split('.')[0] === preferences[0].split('.')[0]) {
      preferences.push(key);
    }
  }

  renderLanguageSelect(
    document.getElementById('codelang-selector'),
    '[name="lang"]',
    availableLangs,
    mainLangs,
    preferences,
  );

  // 代码框换成 Monaco，和题目详情页的草稿本用同一个编辑器：语法高亮、行号、
  // 括号匹配。原来的 textarea 留着当无脚本兜底，编辑器每次改动都把值同步回去，
  // 表单提交照旧读 textarea。
  const $code = $('[name="code"]');
  if (!$code.length) return;
  const monacoLang = () => window.LANGS[$('[name="lang"]').val() as string]?.monaco;
  // 字号字体跟记录页源码、题解代码块保持一致，字体栈从已经生效的 CSS 上读，
  // 免得这里再抄一份。
  const style = getComputedStyle($code.get(0));
  const fontFamily = style.fontFamily;
  // 字号和行高也照记录页源码来（14px / 1.6），免得两边看着一大一小。
  const fontSize = Math.round(Number.parseFloat(style.fontSize)) || 14;
  const lineHeight = Math.round(fontSize * 1.6);
  const { default: Editor } = await import('vj/components/editor');
  const editor = new Editor($code, {
    language: monacoLang() || 'cpp',
    fontFamily,
    fontSize,
    lineHeight,
    autoResize: false,
    autoLayout: true,
    lineNumbers: 'on',
  });
  $('[name="lang"]').on('change', async () => {
    const lang = monacoLang();
    if (!lang || !editor.model) return;
    const { monaco } = await load([lang]);
    monaco.editor.setModelLanguage(editor.model, lang);
  });
});

export default page;
