// 真实浏览器里跑一遍课件系统的单点登录：注入 OJ 票据 → 打开 /ppt/ → 看最终落到哪。
// 用 Chrome DevTools 协议，不依赖 playwright/puppeteer（Node 自带 WebSocket 就够）。
const { spawn } = require('child_process');
const fs = require('fs');

const CHROME = process.env.CHROME_BIN ||
  process.env.HOME + '/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/' +
  'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const [sid, target] = process.argv.slice(2);
const PORT = 9333 + Math.floor(Math.random() * 200);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu',
  `--remote-debugging-port=${PORT}`,
  '--remote-debugging-address=127.0.0.1',
  '--remote-allow-origins=*',
  `--user-data-dir=/tmp/cdp-ppt-verify-${PORT}`,
  '--no-first-run', '--no-default-browser-check',
  'about:blank',
], { stdio: 'ignore' });

let ws;
let nextId = 1;
const pending = new Map();

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error('超时: ' + method)); }
    }, 20000);
  });
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true });
  return r.result && r.result.result ? r.result.result.value : undefined;
}

async function findPageTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch (_) { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('没等到调试端口');
}

(async () => {
  const page = await findPageTarget();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg);
    }
  };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  await send('Network.enable');
  await send('Page.enable');
  await send('Network.setCookie', {
    name: 'sid', value: sid,
    domain: 'mahao.anosm.com', path: '/', secure: true, sameSite: 'Lax',
  });

  await send('Page.navigate', { url: target });

  // 单点登录是客户端跳的，轮询直到地址稳定
  let last = '';
  let stable = 0;
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    const href = await evaluate('location.href');
    if (href && href === last && !href.includes('oj-sso')) { stable++; } else { stable = 0; }
    last = href || last;
    if (stable >= 2) break;
  }

  const info = await evaluate(`JSON.stringify({
    href: location.href,
    title: document.title,
    text: (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').slice(0, 260)
  })`);
  console.log('  最终地址: ' + last);
  console.log('  页面内容: ' + (info || '').slice(0, 400));
})().catch((e) => {
  console.error('  失败: ' + e.message);
  process.exitCode = 1;
}).finally(() => {
  try { ws && ws.close(); } catch (_) {}
  chrome.kill('SIGKILL');
});
