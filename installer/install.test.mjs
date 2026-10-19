import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const installer = path.join(path.dirname(fileURLToPath(import.meta.url)), 'install.mjs');
for (const mode of ['missing', 'same', 'conflict', 'unreadable', 'upgrade']) test(`installer ${mode}`, () => {
 const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ref-install-test-')));
 try {
 fs.mkdirSync(path.join(dir, 'installer')); fs.mkdirSync(path.join(dir, 'dist'));
 fs.mkdirSync(path.join(dir, 'skills/design-workspace'), { recursive: true });
 fs.writeFileSync(path.join(dir, 'skills/design-workspace/SKILL.md'), 'test-skill');
 fs.copyFileSync(installer, path.join(dir, 'installer/install.mjs'));
 fs.copyFileSync(path.join(path.dirname(installer),'install-core.mjs'),path.join(dir,'installer/install-core.mjs'));
 fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({version:'0.1.2'}));
 fs.writeFileSync(path.join(dir, 'dist/start-mcp.mjs'), ''); fs.writeFileSync(path.join(dir, 'dist/cli.mjs'), '');
 const mock = path.join(dir, 'mock-codex'); const log = path.join(dir, 'calls');
 const existing = ['same','upgrade'].includes(mode) ? [{ name: 'ref_design_cloud', transport: { command: process.execPath, args: [mode==='upgrade'?path.resolve(dir,'../0.1.0/dist/start-mcp.mjs'):path.join(dir, 'dist/start-mcp.mjs')] } }] : mode === 'conflict' ? [{ name: 'ref_design_cloud', transport: { command: '/different/node', args: [] } }] : [];
 fs.writeFileSync(mock, `#!${process.execPath}\nconst fs=require('node:fs');fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(process.argv.slice(2))+'\\n');if(process.argv[3]==='list'){console.log(${JSON.stringify(JSON.stringify(existing))});process.exit(${mode === 'unreadable' ? 1 : 0});}`); fs.chmodSync(mock, 0o700);
 const r = spawnSync(process.execPath, [path.join(dir, 'installer/install.mjs')], { encoding: 'utf8', env: { ...process.env, REF_DESIGN_CODEX_BIN: mock, REF_DESIGN_SKILLS_DIR: path.join(dir, 'skills') } });
 assert.equal(r.status, ['conflict', 'unreadable','upgrade'].includes(mode) ? 1 : 0);
 if (r.status === 0) assert.equal(fs.readFileSync(path.join(dir, 'skills/ref-design-cloud-workspace/SKILL.md'), 'utf8'), 'test-skill');
 const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(calls.length, mode === 'missing' ? 2 : 1);
 if (mode === 'upgrade') assert.equal(calls.length,1,'unmanaged legacy path must not be replaced');
 if (mode === 'missing') assert.deepEqual(calls[1].slice(0, 4), ['mcp', 'add', 'ref_design_cloud', '--']);
 } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
