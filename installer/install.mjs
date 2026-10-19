import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {installConnector} from './install-core.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const entry = path.join(root, 'dist/start-mcp.mjs');
const cli = path.join(root, 'dist/cli.mjs');
let codex = process.env.REF_DESIGN_CODEX_BIN || 'codex';
if (process.platform === 'win32' && codex === 'codex') {
  const found = spawnSync('where.exe', ['codex'], { encoding: 'utf8', windowsHide: true });
  const candidates = (found.stdout || '').trim().split(/\r?\n/);
  codex = candidates.find(p => /\.exe$/i.test(p)) || candidates.find(p => /\.cmd$/i.test(p)) || codex;
}
if (!fs.existsSync(entry) || !fs.existsSync(cli)) throw new Error('发布包不完整：缺少连接器 dist。');
function run(args) {
  if (process.platform === 'win32' && /\.cmd$/i.test(codex)) {
    const js = path.resolve(path.dirname(codex), '../@openai/codex/bin/codex.js');
    if (!fs.existsSync(js)) throw new Error('请使用 Codex 可执行文件路径或官方 npm 安装路径');
    return spawnSync(node, [js, ...args], { encoding: 'utf8', windowsHide: true });
  }
  return spawnSync(codex, args, { encoding: 'utf8', windowsHide: true });
}
const base = path.resolve(process.env.REF_DESIGN_CONNECTOR_HOME || path.join(os.homedir(), '.ref-design-cloud'));
const skillDestination = path.join(process.env.REF_DESIGN_SKILLS_DIR || path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills'), 'ref-design-cloud-workspace/SKILL.md');
const installed = installConnector({root,node,base,skillDestination,run});
const version = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
console.log(JSON.stringify({...installed,version},null,2));
