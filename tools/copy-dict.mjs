// 解析器と辞書（lindera-wasm-web-ipadic）を node_modules から dict/ に写す（公開物はコミットする）
// 使い方: npm install && node tools/copy-dict.mjs
// 版を上げたら: package.json の版、constants.js の analyzer（version・path・bytes）、sw.js、worker.js の import のパスを直し、
// tools/measure-tool.mjs で精度を測り直して使い方ページの数字を更新する
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/lindera-wasm-web-ipadic/package.json'), 'utf8'));
const out = path.join(ROOT, 'dict', 'lindera-' + pkg.version);
fs.mkdirSync(out, { recursive: true });
for (const f of ['lindera_wasm.js', 'lindera_wasm_bg.wasm']) fs.copyFileSync(path.join(ROOT, 'node_modules/lindera-wasm-web-ipadic', f), path.join(out, f));
fs.copyFileSync(path.join(ROOT, 'node_modules/lindera-wasm-web-ipadic/LICENSE'), path.join(out, 'LICENSE-lindera-wasm.txt'));
console.log(out, fs.statSync(path.join(out, 'lindera_wasm_bg.wasm')).size, 'bytes');
