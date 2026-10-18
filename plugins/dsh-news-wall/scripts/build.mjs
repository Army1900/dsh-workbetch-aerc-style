/**
 * 构建脚本：零依赖、零工具链。
 *
 *   src/index.mjs  ─┐
 *   src/feed.mjs    ├─ 直接拷贝到 lib/（Host 半部是标准 ESM，宿主直接 import）
 *   src/sources.mjs ┘
 *
 *   src/client.js  ──── 包进 DSH 的模块加载协议 → lib/client.js
 *
 * 客户端那层包装是官方约定（等价于 harness 里 tsdown 的 banner/footer/intro）：
 *
 *   window.__ModuleLoader__.load({ id, factory: (require) => { ... } })
 *
 * factory 里的 `require` 由 shell 的模块表提供，只认识 react / react-dom /
 * @deepseek-ai/cordis / @deepseek-ai/dsh-client-ui-slots 等平台模块；本插件的
 * 客户端代码除了 react 不用任何依赖，所以不需要打包器。
 */

import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PACKAGE_ID = 'dsh-news-wall'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const srcDir = join(root, 'src')
const libDir = join(root, 'lib')

rmSync(libDir, { recursive: true, force: true })
mkdirSync(libDir, { recursive: true })

// 1) Host 半部：原样拷贝（新增模块必须加进这张表）
const hostFiles = ['index.mjs', 'feed.mjs', 'sources.mjs', 'prefs.mjs', 'semantic.mjs']
for (const file of hostFiles) {
  copyFileSync(join(srcDir, file), join(libDir, file))
}

// 1b) 完整性自检：lib/ 里每个相对 import 都必须真的存在。
//     少拷一个模块 = 宿主重启后直接加载失败，这里当场拦住。
const missing = []
for (const file of hostFiles) {
  const source = readFileSync(join(libDir, file), 'utf8')
  for (const match of source.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)) {
    const specifier = match[1]
    if (!existsSync(join(libDir, specifier))) missing.push(`${file} → ${specifier}`)
  }
}
if (missing.length > 0) {
  console.error('✗ 构建产物缺少依赖：')
  for (const entry of missing) console.error(`   ${entry}`)
  process.exit(1)
}

// 2) Client 半部：包进模块加载协议
const body = readFileSync(join(srcDir, 'client.js'), 'utf8')
const indented = body
  .replace(/\s+$/, '')
  .split('\n')
  .map((line) => (line.length === 0 ? line : `\t\t${line}`))
  .join('\n')

const bundle = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(PACKAGE_ID)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
${indented}
\t\treturn module.exports;
\t}
});
`

writeFileSync(join(libDir, 'client.js'), bundle)

const clientKb = (Buffer.byteLength(bundle) / 1024).toFixed(1)
console.log(`✓ lib/index.mjs  lib/feed.mjs  lib/sources.mjs`)
console.log(`✓ lib/client.js   ${clientKb} KB`)
