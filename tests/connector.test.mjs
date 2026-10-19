import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createOnboarding} from '../scripts/onboarding.mjs';
import {profile} from '../scripts/profile.mjs';
import {boundFetch,credentialHeaders} from '../scripts/client.mjs';
import {createStore} from '../scripts/store.mjs';
import {createRequestGate} from '../scripts/cloud-errors.mjs';
test('credentials are restricted to fixed service and redirects disabled',async()=>{
 const c={origin:profile.apiOrigin,token:'app',platformToken:'platform'};
 assert.deepEqual(credentialHeaders(c),{Authorization:'Bearer platform','x-retouch-authorization':'Bearer app'});
 assert.throws(()=>credentialHeaders({...c,origin:'https://evil.example'}));
 let options;const f=boundFetch(c,async(u,o)=>{options=o;return new Response('{}');});
 assert.throws(()=>f('https://evil.example/mcp'));
 await f(profile.apiOrigin+'/mcp',{redirect:'follow'});assert.equal(options.redirect,'error');
});
test('private credentials store permissions',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ref-store-'));try{const s=createStore(dir);await s.write({token:'private'});assert.deepEqual(await s.read(),{token:'private'});if(process.platform!=='win32')assert.equal((await fs.stat(path.join(dir,'connection.json'))).mode&0o777,0o600);await s.clear();assert.deepEqual(await s.read(),{});}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('gateway backoff retains retry interval and never exposes response body',async()=>{
 let now=1000,calls=0;const gate=createRequestGate({now:()=>now});const request=async()=>{calls++;return new Response('{"secret":"hidden"}',{status:429,headers:{'retry-after':'3'}});};
 await assert.rejects(gate.fetch(profile.apiOrigin+'/mcp',{},request),e=>e.diagnostic.retryAt===4000&&!e.message.includes('hidden'));
 await assert.rejects(gate.fetch(profile.apiOrigin+'/mcp',{},request));assert.equal(calls,1);
});
test('device contract stores tokens privately and refreshes app authorization',async()=>{
 let saved={},now=1000;const routes=[];
 const ob=createOnboarding({store:{read:async()=>saved,write:async v=>saved=v},now:()=>now,platformLogin:async()=>({url:'https://www.modelscope.cn/authorize',complete:async()=>({accessToken:'platform',expiresAt:9999999})}),refresh:async p=>p,request:async(u,o)=>{routes.push([u,o]);if(u.endsWith('/health'))return Response.json({ok:true});if(u.endsWith('/device/start'))return Response.json({deviceCode:'secret-device',userCode:'1234-5678',expiresIn:600,interval:5});if(u.endsWith('/device/poll'))return Response.json({status:'authorized',access_token:'app',refresh_token:'refresh',client_id:'retouch-cloud-device',expires_in:3600});if(u.endsWith('/oauth/token'))return Response.json({access_token:'app2',refresh_token:'refresh2',expires_in:3600});throw Error(u);}});
 try{
  const initial=await ob.begin();assert.equal(initial.state,'awaiting_platform');
  const callback=new URL('/callback?code=example',initial.loginUrl);const response=await fetch(callback);assert.equal(response.status,200);
  const status=await ob.status();assert.equal(status.state,'connected');assert.equal(JSON.stringify(status).includes('secret-device'),false);assert.equal(saved.token.access_token,'app');
  now+=3600000;assert.equal((await ob.config()).token,'app2');
  assert.equal(JSON.parse(routes.find(([u])=>u.endsWith('/oauth/token'))[1].body).resource,profile.browserOrigin+'/mcp');
 }finally{await ob.stop();}
});
test('bridge verifies live list_projects and does not retry unauthorized mutation',async()=>{
 const {createBridge}=await import('../scripts/bridge.mjs');let calls=[];
 const config={origin:profile.apiOrigin,token:'private-app',platformToken:'private-platform'};
 const bridge=createBridge({onboarding:{status:async()=>({state:'saved'}),config:async()=>config,stop:async()=>{}},makeClient:()=>({connect:async()=>{},close:async()=>{},listTools:async()=>({tools:[]}),callTool:async request=>{calls.push(request.name);if(request.name==='list_projects')return {structuredContent:{projects:[{id:'one'}]}};throw Error('HTTP 401 private-app private-platform');}})});
 try{const status=await bridge.call('ref_design_connection_status');assert.equal(status.structuredContent.state,'connected');assert.equal(status.structuredContent.projectCount,1);assert.deepEqual(calls,['list_projects']);const failure=await bridge.call('design_create_job',{});assert.equal(failure.isError,true);assert.equal(JSON.stringify(failure).includes('private-app'),false);assert.deepEqual(calls,['list_projects','design_create_job']);}finally{await bridge.close();}
});
test('CLI upload sends bytes through chunks and keeps absolute path local',async()=>{
 const {upload}=await import('../scripts/upload.mjs');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ref-upload-'));const file=path.join(dir,'input.png');const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40000,7)]);await fs.writeFile(file,bytes);
 const calls=[];try{const result=await upload({call:async(name,args)=>{calls.push({name,args});return {structuredContent:name==='begin_attachment_upload'?{uploadId:'id'}:name==='complete_attachment_upload'?{asset:{id:'asset'},source:{sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}}:name==='get_project'?{project:{reference:{id:'asset'}}}:{ok:true}};}},'project',file);assert.equal(result.asset.id,'asset');assert.equal(JSON.stringify(calls).includes(dir),false);const decoded=Buffer.concat(calls.filter(c=>c.name==='append_attachment_chunk').map(c=>Buffer.from(c.args.dataBase64,'base64')));assert.deepEqual(decoded,bytes);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
