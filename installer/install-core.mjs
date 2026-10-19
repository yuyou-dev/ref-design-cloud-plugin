import path from 'node:path';
import fs from 'node:fs';
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
function managedPackage(entry,base) {
 if(typeof entry!=='string'||!path.isAbsolute(entry))return null;
 const relative=path.relative(path.join(base,'packages'),entry).split(path.sep);
 if(relative.length!==3||!semver.test(relative[0])||relative[1]!=='dist'||relative[2]!=='start-mcp.mjs')return null;
 const root=path.join(base,'packages',relative[0]);
 try { if(fs.realpathSync(entry)!==entry||fs.realpathSync(root)!==root)return null; } catch {return null;}
 return root;
}
function managedNode(node,base){
 if(typeof node!=='string'||!path.isAbsolute(node))return false;
 const parts=path.relative(path.join(base,'tools'),node).split(path.sep);
 if(!/^node-v\d+\.\d+\.\d+-(?:darwin|linux|win)-(?:arm64|x64)$/.test(parts[0]))return false;
 if(!((parts.length===3&&parts[1]==='bin'&&parts[2]==='node')||(parts.length===2&&parts[1]==='node.exe')))return false;
 try{return fs.realpathSync(node)===node;}catch{return false;}
}
export function installConnector({root,node,base,skillDestination,run}) {
 const entry=path.join(root,'dist/start-mcp.mjs'),cli=path.join(root,'dist/cli.mjs');
 if(!fs.existsSync(entry)||!fs.existsSync(cli))throw Error('发布包不完整：缺少连接器 dist。');
 const list=run(['mcp','list','--json']);
 if(list.status!==0)throw Error('无法读取 Codex MCP 配置；未修改配置。');
 const existing=JSON.parse(list.stdout).find(s=>s.name==='ref_design_cloud');
 const transport=existing&&(existing.transport||existing),args=transport?.args||[];
 const same=transport&&transport.command===node&&args.length===1&&args[0]===entry;
 let previousRoot;
 if(existing&&!same){
  previousRoot=args.length===1&&managedPackage(args[0],base);
  if(!previousRoot||!managedPackage(entry,base)||!managedNode(transport.command,base)||!managedNode(node,base)||transport.cwd||Object.keys(transport.env||{}).length)throw Error('ref_design_cloud 同名连接来自不同路径，保留原配置。请人工核对后再安装。');
 }
 const skillSource=path.join(root,'skills/design-workspace/SKILL.md');
 const source=fs.existsSync(skillSource)?fs.readFileSync(skillSource):null;
 if(fs.existsSync(skillDestination)&&fs.lstatSync(skillDestination).isSymbolicLink())throw Error('同名技能是符号链接，保留原文件。');
 const installed=fs.existsSync(skillDestination)?fs.readFileSync(skillDestination):null;
 if(installed&&source&&!installed.equals(source)){
  const previousSkill=previousRoot&&path.join(previousRoot,'skills/design-workspace/SKILL.md');
  if(!previousSkill||!fs.existsSync(previousSkill)||fs.realpathSync(previousSkill)!==previousSkill||!installed.equals(fs.readFileSync(previousSkill)))throw Error('同名技能内容不同，保留原文件；请核对后继续。');
 }
 if(existing&&!same){
  if(run(['mcp','remove','ref_design_cloud']).status!==0)throw Error('旧版本注册迁移失败');
  if(run(['mcp','add','ref_design_cloud','--',node,entry]).status!==0){
   const rollback=run(['mcp','add','ref_design_cloud','--',transport.command,...args]);
   throw Error(rollback.status===0?'新版注册失败，已恢复旧版本':'新版注册失败，旧版恢复失败；请人工恢复连接配置');
  }
 }else if(!existing&&run(['mcp','add','ref_design_cloud','--',node,entry]).status!==0)throw Error('Codex MCP 注册失败；请检查 CLI 状态。');
 if(source&&(!installed||!installed.equals(source))){
  fs.mkdirSync(path.dirname(skillDestination),{recursive:true,mode:0o700});
  fs.writeFileSync(skillDestination,source,{mode:0o600,flag:installed?'w':'wx'});
 }
 return {installed:true,node,cli,mcp:'ref_design_cloud',next:'使用返回的 node 运行 cli connect；用户自行登录授权。'};
}
