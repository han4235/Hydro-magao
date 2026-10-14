import 'md-editor-rt/lib/style.css';

import zh_TW from '@vavt/cm-extension/dist/locale/zh-TW';
import Anchor from 'markdown-it-anchor';
import Footnote from 'markdown-it-footnote';
import Mark from 'markdown-it-mark';
import MergeCells from 'markdown-it-merge-cells';
import TOC from 'markdown-it-table-of-contents';
import React from 'react';
import { allToolbar, config, DropdownToolbar, MdEditor } from 'md-editor-rt';
import Imsize from '../../backendlib/markdown-it-imsize';
import katex from '../../backendlib/markdown-it-katex';
import { Media } from '../../backendlib/markdown-it-media';
import { xssProtector } from '../../backendlib/markdown-it-xss';

const pagename = document.documentElement.getAttribute('data-page');
const previewConfig: Record<string, string> = {
  problem_edit: './file/',
  homework_edit: './file/public/',
  contest_edit: './file/public/',
};
const isCreatePage = ['problem_create', 'homework_create', 'contest_create'].includes(pagename);
const filePreviewPrefix = previewConfig[pagename] || (isCreatePage ? `/file/${UserContext._id}/` : null);

config({
  markdownItConfig(mdit) {
    mdit.options.html = true;
    mdit.options.linkify = true;
    mdit.linkify.tlds('.py', false);
    mdit.linkify.tlds('.zip', false);
    mdit.linkify.tlds('.mov', false);
    mdit.use(Media);
    mdit.use(Footnote);
    mdit.use(Mark);
    mdit.use(Imsize);
    mdit.use(Anchor);
    mdit.use(TOC);
    mdit.use(MergeCells);
    mdit.use(xssProtector);
    mdit.use(katex);
    if (filePreviewPrefix) {
      mdit.core.ruler.before('normalize', 'xss', (state) => {
        state.src = state.src.replace(/file:\/\//g, filePreviewPrefix);
      });
    }
  },
  markdownItPlugins() {
    // disable all default plugins
    return [];
  },
  codeMirrorExtensions(extensions) {
    return extensions.filter((i) => i.type !== 'linkShortener');
  },
  editorConfig: {
    languageUserDefined: {
      'zh-TW': zh_TW,
    },
  },
});

const palette = ['#24292f', '#cf222e', '#c45c26', '#9a6700', '#1a7f37', '#0969da', '#8250df'];

function wrapColor(color: string, selected: string) {
  const open = `<font color="${color}">`;
  const close = '</font>';
  const text = selected || '文字';
  return {
    targetValue: `${open}${text}${close}`,
    select: true,
    deviationStart: open.length,
    deviationEnd: -close.length,
  };
}

export function ColorToolbar(props: {
  insert?: (generate: (selectedText: string) => {
    targetValue: string;
    select?: boolean;
    deviationStart?: number;
    deviationEnd?: number;
  }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [color, setColor] = React.useState('#c45c26');
  const apply = (next: string) => {
    props.insert?.((selected) => wrapColor(next, selected));
    setOpen(false);
  };
  return (
    <DropdownToolbar
      title="颜色"
      visible={open}
      onChange={setOpen}
      overlay={(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8, minWidth: 196 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {palette.map((item) => (
              <button
                key={item}
                type="button"
                title={item}
                onClick={() => apply(item)}
                style={{
                  width: 22,
                  height: 22,
                  padding: 0,
                  borderRadius: 4,
                  border: '1px solid rgba(0,0,0,.18)',
                  background: item,
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            自定义
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <button type="button" onClick={() => apply(color)} style={{ fontSize: 12, cursor: 'pointer' }}>
            使用这个颜色
          </button>
        </div>
      )}
    >
      <span style={{ color, fontWeight: 700 }}>A</span>
    </DropdownToolbar>
  );
}

export { allToolbar, MdEditor };
