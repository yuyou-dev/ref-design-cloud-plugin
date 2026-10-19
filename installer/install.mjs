import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
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
const skillSource = path.join(root, 'skills/design-workspace/SKILL.md');
const skillDestination = path.join(process.env.REF_DESIGN_SKILLS_DIR || path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills'), 'ref-design-cloud-workspace/SKILL.md');
if (fs.existsSync(skillSource) && fs.existsSync(skillDestination) && fs.readFileSync(skillSource, 'utf8') !== fs.readFileSync(skillDestination, 'utf8')) throw new Error('同名技能内容不同，保留原文件；请核对后继续。');
const list = run(['mcp', 'list', '--json']);
if (list.status !== 0) throw new Error('无法读取 Codex MCP 配置；请检查 Codex CLI，未修改配置。');
const servers = JSON.parse(list.stdout);
const existing = servers.find(s => s.name === 'ref_design_cloud');
if (existing) {
  const transport = existing.transport || existing;
  const args = transport.args || [];
  if (transport.command !== node || args.length !== 1 || args[0] !== entry) {
    const previous = path.resolve(root, '../0.1.0/dist/start-mcp.mjs');
    if (transport.command !== node || args.length !== 1 || args[0] !== previous) throw new Error('ref_design_cloud 同名连接来自不同路径，保留原配置。请人工核对后再安装。');
    if (run(['mcp', 'remove', 'ref_design_cloud']).status !== 0) throw new Error('旧版本注册迁移失败');
    if (run(['mcp', 'add', 'ref_design_cloud', '--', node, entry]).status !== 0) {
      run(['mcp', 'add', 'ref_design_cloud', '--', node, previous]);
      throw new Error('新版注册失败，已尝试恢复旧版本');
    }
  }
} else {
  const add = run(['mcp', 'add', 'ref_design_cloud', '--', node, entry]);
  if (add.status !== 0) throw new Error('Codex MCP 注册失败；请检查 CLI 状态。');
}
if (fs.existsSync(skillSource)) {
  fs.mkdirSync(path.dirname(skillDestination), { recursive: true, mode: 0o700 });
  if (!fs.existsSync(skillDestination)) fs.writeFileSync(skillDestination, fs.readFileSync(skillSource), { mode: 0o600, flag: 'wx' });
}
console.log(JSON.stringify({ installed: true, version: '0.1.1', node, cli, mcp: 'ref_design_cloud', next: '使用返回的 node 运行 cli connect；用户自行登录授权。' }, null, 2));
