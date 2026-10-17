import { tmpdir } from 'os';
import {
  basename, join, relative, resolve,
} from 'path';
import {
  Context, fs, Handler, Logger, NotFoundError, param, SettingModel, sha1,
  size, SystemModel, Types, UiContextBase,
} from 'hydrooj';
import esbuild from 'esbuild';

declare module 'hydrooj' {
  interface UI {
    esbuildPlugins?: esbuild.Plugin[];
  }
  interface SystemKeys {
    'ui-default.nav_logo_dark': string;
  }
  interface UiContextBase {
    constantVersion?: string;
    /** 前端产物（public 下的 hydro-*.js、theme-*.css）的版本戳，用来给它们的 URL 加 ?v=。 */
    bundleVersion?: string;
  }
}

const vfs: Record<string, string> = {};
const hashes: Record<string, string> = {};
const logger = new Logger('ui');
const tmp = tmpdir();

/**
 * 前端产物（webpack 打到 packages/ui-default/public）的版本戳。
 * 浏览器把 hydro-*.js、theme-*.css 缓存一天，而且模板里的 URL 只有版本号
 * （4.58.5 这种），重新构建后 URL 不变，用户就一直在跑旧包——表现为新模板配旧脚本，
 * 页面功能像是没生效。这里把文件名和大小拼起来取哈希，构建一换戳就换，URL 跟着变。
 * 在模块加载时算一次：产物变了要重启进程才会生效，和模板的加载时机一致。
 */
const bundleVersion = (() => {
  try {
    const dir = resolve(__dirname, '../public');
    // 只哈希入口产物本身：chunk 的文件名里已经带内容哈希，入口一变它就跟着变。
    // 用文件内容而不是大小/时间戳，重新构建但产物没变时戳保持不变，浏览器不用重下。
    const sig = fs.readdirSync(dir)
      .filter((i) => /^(?:hydro-.*\.js|theme-.*\.css)$/.test(i))
      .sort()
      .map((i) => `${i}:${sha1(fs.readFileSync(join(dir, i), 'utf-8'))}`)
      .join('|');
    return sha1(sig).substring(0, 8);
  } catch (e) {
    return '';
  }
})();

const federationPlugin: esbuild.Plugin = {
  name: 'federation',
  setup(b) {
    const packages = {
      'react/jsx-runtime': 'jsxRuntime',
      react: 'React',
      'react-dom/client': 'ReactDOM',
      'react-dom': 'ReactDOM',
      jquery: '$',
    };
    b.onResolve({ filter: /^@hydrooj\/ui-default/ }, () => ({
      path: 'api',
      namespace: 'ui-default',
    }));
    for (const key in packages) {
      b.onResolve({ filter: new RegExp(`^${key}$`) }, () => ({
        path: packages[key],
        namespace: 'ui-default',
      }));
    }
    b.onLoad({ filter: /.*/, namespace: 'ui-default' }, (args) => {
      if (args.path === 'api') {
        return {
          contents: 'module.exports = window.HydroExports;',
          loader: 'tsx',
        };
      }
      return {
        contents: `module.exports = window.HydroExports['${args.path}'];`,
        loader: 'tsx',
      };
    });
  },
};

const build = async (contents: string) => {
  const res = await esbuild.build({
    tsconfigRaw: '{"compilerOptions":{"experimentalDecorators":true}}',
    format: 'iife' as 'iife',
    bundle: true,
    outdir: tmp,
    sourcemap: SystemModel.get('ui-default.nosourcemap') ? false : 'external',
    splitting: false,
    write: false,
    target: ['chrome65'],
    plugins: [
      ...(global.Hydro.ui.esbuildPlugins || []),
      federationPlugin,
    ],
    minify: !process.env.DEV,
    stdin: {
      contents,
      sourcefile: 'stdin.ts',
      resolveDir: tmp,
      loader: 'ts',
    },
  });
  if (res.errors.length) console.error(res.errors);
  if (res.warnings.length) console.warn(res.warnings);
  return res;
};

const applyCss = (css: string) => `
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(css)};
  document.head.appendChild(style);
`;

export async function buildUI() {
  const start = Date.now();
  let totalSize = 0;
  const entryPoints: string[] = [];
  const lazyModules: string[] = [];
  const newFiles = ['entry.js'];
  for (const addon of Object.values(global.addons) as string[]) {
    let publicPath = resolve(addon, 'frontend');
    if (!fs.existsSync(publicPath)) publicPath = resolve(addon, 'public');
    if (!fs.existsSync(publicPath)) continue;
    const targets = fs.readdirSync(publicPath);
    for (const target of targets) {
      if (/\.page\.[jt]sx?$/.test(target)) entryPoints.push(join(publicPath, target));
      if (/\.lazy\.[jt]sx?$/.test(target)) lazyModules.push(join(publicPath, target));
    }
  }
  function addFile(name: string, content: string) {
    vfs[name] = content;
    hashes[name] = sha1(content).substring(0, 8);
    logger.info('+ %s-%s: %s', name, hashes[name].substring(0, 6), size(content.length));
    newFiles.push(name);
    totalSize += content.length;
  }
  for (const m of lazyModules) {
    const name = basename(m).split('.')[0];
    const { outputFiles } = await build(`window.lazyModuleResolver['${name}'](require('${relative(tmp, m).replace(/\\/g, '\\\\')}'))`);
    const css = outputFiles.filter((i) => i.path.endsWith('.css')).map((i) => i.text).join('\n');
    for (const file of outputFiles) {
      if (file.path.endsWith('.css')) continue;
      addFile(basename(m).replace(/\.[tj]sx?$/, '.js'), (css ? applyCss(css) : '') + file.text);
    }
  }
  for (const lang in global.Hydro.locales) {
    if (!/^[a-zA-Z_]+$/.test(lang)) continue;
    if (!global.Hydro.locales[lang].__interface) continue;
    const str = `window.LOCALES=${JSON.stringify(global.Hydro.locales[lang][Symbol.for('iterate')])};`;
    addFile(`lang-${lang}.js`, str);
  }
  const entry = await build([
    `window.lazyloadMetadata = ${JSON.stringify(hashes)};`,
    `window.LANGS=${JSON.stringify(SettingModel.langs)};`,
    ...entryPoints.map((i) => `import '${relative(tmp, i).replace(/\\/g, '\\\\')}';`),
  ].join('\n'));
  const pages = entry.outputFiles.filter((i) => i.path.endsWith('.js')).map((i) => i.text);
  const css = entry.outputFiles.filter((i) => i.path.endsWith('.css')).map((i) => i.text);
  addFile('entry.js', `window._hydroLoad=()=>{
    ${css.length ? applyCss(css.join('\n')) : ''}
    ${pages.join('\n')}
  };`);
  UiContextBase.constantVersion = hashes['entry.js'];
  UiContextBase.bundleVersion = bundleVersion;
  for (const key in vfs) {
    if (newFiles.includes(key)) continue;
    delete vfs[key];
    delete hashes[key];
  }
  logger.success('UI addons built in %d ms (%s)', Date.now() - start, size(totalSize));
}

class UiConstantsHandler extends Handler {
  noCheckPermView = true;

  @param('name', Types.Filename)
  async all(domainId: string, name: string) {
    this.response.type = 'application/javascript';
    if (!vfs[name]) throw new NotFoundError(name);
    this.response.addHeader('ETag', hashes[name]);
    this.response.body = vfs[name];
    this.response.addHeader('Cache-Control', 'public, max-age=86400');
  }
}

export async function apply(ctx: Context) {
  ctx.Route('constant', '/lazy/:version/:name', UiConstantsHandler);
  ctx.Route('constant', '/resource/:version/:name', UiConstantsHandler);
  ctx.on('app/started', buildUI);
  const debouncedBuildUI = ctx.debounce(buildUI, 2000);
  const triggerHotUpdate = (path?: string) => {
    if (path && !path.includes('/ui-default/') && !path.includes('/public/') && !path.includes('/frontend/')) return;
    debouncedBuildUI();
  };
  ctx.on('system/setting', () => triggerHotUpdate());
  ctx.on('system/setting-loaded', () => triggerHotUpdate());
  ctx.on('app/watch/change', triggerHotUpdate);
  ctx.on('app/watch/unlink', triggerHotUpdate);
  ctx.on('app/i18n/update', debouncedBuildUI);
  debouncedBuildUI();
}
