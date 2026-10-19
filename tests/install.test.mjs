import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {installConnector} from '../installer/install-core.mjs';
function fixture(t){
 const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ref-install-')));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const put=(file,text='')=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);return file;};
 const old=path.join(base,'packages/0.1.1'),root=path.join(base,'packages/0.1.2');
 for(const dir of [old,root]){put(path.join(dir,'dist/start-mcp.mjs'));put(path.join(dir,'dist/cli.mjs'));put(path.join(dir,'skills/design-workspace/SKILL.md'),dir===old?'old skill':'new skill');}
 const node=put(path.join(base,'tools/node-v22.23.3-darwin-arm64/bin/node'));
 const oldNode=put(path.join(base,'tools/node-v22.13.0-darwin-arm64/bin/node'));
 const skillDestination=put(path.join(base,'skills/ref-design-cloud-workspace/SKILL.md'),'old skill');
 const transport={command:oldNode,args:[path.join(old,'dist/start-mcp.mjs')]};const calls=[];
 const options={root,node,base,skillDestination,run(args){calls.push(args);return args[1]==='list'?{status:0,stdout:JSON.stringify([{name:'ref_design_cloud',transport}])}:{status:0};}};
 return {options,transport,calls,put,old,root,node,oldNode,skillDestination};
}
test('managed package upgrade replaces matching old skill and preserves identity',t=>{
 const f=fixture(t);const out=installConnector(f.options);assert.equal(out.installed,true);assert.equal(fs.readFileSync(f.skillDestination,'utf8'),'new skill');assert.deepEqual(f.calls.map(c=>c[1]),['list','remove','add']);assert.equal(f.calls[2][4],f.node);
});
test('custom skill blocks upgrade before configuration mutation',t=>{
 const f=fixture(t);f.put(f.skillDestination,'custom skill');assert.throws(()=>installConnector(f.options),/同名技能/);assert.deepEqual(f.calls.map(c=>c[1]),['list']);assert.equal(fs.readFileSync(f.skillDestination,'utf8'),'custom skill');
});
test('unrelated same-name path or command is never replaced',t=>{
 for(const field of ['entry','node','env']){const f=fixture(t);if(field==='entry')f.transport.args=[f.put(path.join(f.options.base,'other/start-mcp.mjs'))];if(field==='node')f.transport.command=process.execPath;if(field==='env')f.transport.env={CUSTOM:'value'};assert.throws(()=>installConnector(f.options),/同名连接/);assert.deepEqual(f.calls.map(c=>c[1]),['list']);}
});
test('failed registration restores original node and entry and leaves skill untouched',t=>{
 const f=fixture(t);const original=f.options.run;let adds=0;f.options.run=args=>{const r=original(args);if(args[1]==='add'&&++adds===1)return {status:1};return r;};assert.throws(()=>installConnector(f.options),/已恢复旧版本/);assert.deepEqual(f.calls.at(-1),['mcp','add','ref_design_cloud','--',f.oldNode,f.transport.args[0]]);assert.equal(fs.readFileSync(f.skillDestination,'utf8'),'old skill');
});
test('same version matching skill is idempotent; custom skill remains protected',t=>{
 const f=fixture(t);f.transport.command=f.node;f.transport.args=[path.join(f.root,'dist/start-mcp.mjs')];f.put(f.skillDestination,'new skill');installConnector(f.options);assert.deepEqual(f.calls.map(c=>c[1]),['list']);f.put(f.skillDestination,'custom');assert.throws(()=>installConnector(f.options),/同名技能/);
});
test('symlinked package cannot establish upgrade provenance',t=>{
 const f=fixture(t);const entry=f.transport.args[0],target=f.put(path.join(f.options.base,'elsewhere.mjs'));fs.unlinkSync(entry);fs.symlinkSync(target,entry);assert.throws(()=>installConnector(f.options),/同名连接/);assert.deepEqual(f.calls.map(c=>c[1]),['list']);
});
