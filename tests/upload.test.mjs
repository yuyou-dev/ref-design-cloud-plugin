import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {upload} from '../scripts/upload.mjs';
async function fixture(run){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ref-upload-retry-'));
 const file=path.join(dir,'input.png'),bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40000,7)]);
 await fs.writeFile(file,bytes);
 const receipt={asset:{id:'asset'},source:{sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}};
 const ok=name=>({structuredContent:name==='begin_attachment_upload'?{uploadId:'upload'}:name==='complete_attachment_upload'?receipt:name==='get_project'?{project:{reference:{id:'asset'}}}:{ok:true}});
 try{await run({file,receipt,ok});}finally{await fs.rm(dir,{recursive:true,force:true});}
}
const limited=retryAt=>({isError:true,structuredContent:{message:'rate limited',diagnostic:{httpStatus:429,retryable:true,retryAt}}});
test('429 retries same chunk and completion after retryAt without replaying begin',()=>fixture(async({file,ok})=>{
 const calls=[],delays=[];let now=1000,chunkFailed=false,completeFailed=false;
 const result=await upload({call:async(name,args)=>{
  calls.push({name,args:structuredClone(args),at:now});
  if(name==='append_attachment_chunk'&&!chunkFailed){chunkFailed=true;return limited(now+3000);}
  if(name==='complete_attachment_upload'&&!completeFailed){completeFailed=true;return limited(now+4000);}
  return ok(name);
 }},'project',file,{now:()=>now,sleep:async ms=>{delays.push(ms);now+=ms;}});
 assert.equal(result.asset.id,'asset');assert.deepEqual(delays,[3000,4000]);
 assert.equal(calls.filter(c=>c.name==='begin_attachment_upload').length,1);
 const chunks=calls.filter(c=>c.name==='append_attachment_chunk');assert.deepEqual(chunks[0].args,chunks[1].args);assert.equal(chunks[1].at-chunks[0].at,3000);
 assert.equal(calls.filter(c=>c.name==='complete_attachment_upload').length,2);
 assert.equal(calls.at(-1).name,'get_project');
}));
test('permanent errors do not retry and cancellation failure preserves original diagnostic',()=>fixture(async({file,ok})=>{
 const calls=[];await assert.rejects(upload({call:async name=>{calls.push(name);if(name==='append_attachment_chunk')return {isError:true,structuredContent:{message:'permission denied',diagnostic:{httpStatus:403,retryable:false}}};if(name==='cancel_attachment_upload')throw Error('cancel failed');return ok(name);}},'project',file),e=>e.message==='permission denied'&&e.diagnostic.httpStatus===403);
 assert.deepEqual(calls,['begin_attachment_upload','append_attachment_chunk','cancel_attachment_upload']);
}));
test('retryable begin is never replayed',()=>fixture(async({file})=>{
 let calls=0;await assert.rejects(upload({call:async()=>{calls++;return limited(999999);}},'project',file),/rate limited/);assert.equal(calls,1);
}));
test('retries are bounded and do not wait beyond upload lifetime',()=>fixture(async({file,ok})=>{
 for(const delay of [1000,600000]){let now=0,calls=0,waits=0;
  await assert.rejects(upload({call:async name=>{if(name==='append_attachment_chunk'){calls++;return limited(now+delay);}return ok(name);}},'project',file,{now:()=>now,sleep:async ms=>{waits++;now+=ms;}}),/rate limited/);
  assert.equal(calls,delay===1000?5:1);assert.equal(waits,delay===1000?4:0);
 }
}));
test('source hash, byte count, and current project reference are verified',()=>fixture(async({file,receipt,ok})=>{
 for(const kind of ['hash','bytes','reference']){
  await assert.rejects(upload({call:async name=>{
   if(name==='complete_attachment_upload')return {structuredContent:{...receipt,source:{...receipt.source,...kind==='hash'?{sha256:'bad'}:kind==='bytes'?{bytes:1}:{}}}};
   if(name==='get_project'&&kind==='reference')return {structuredContent:{project:{reference:{id:'old'}}}};
   return ok(name);
  }},'project',file),kind==='reference'?/参考图/:/字节校验/);
 }
}));
test('result upload verifies purpose and project without replacing reference',()=>fixture(async({file,receipt})=>{
 const calls=[];const {asset,source}=receipt;
 const result=await upload({call:async(name,args)=>{calls.push({name,args});return {structuredContent:name==='begin_attachment_upload'?{uploadId:'result-upload'}:name==='complete_attachment_upload'?{asset,source,projectId:'project',purpose:'result'}:{ok:true}};}},'project',file,{purpose:'result'});
 assert.equal(result.asset.id,asset.id);assert.equal(calls[0].args.purpose,'result');assert.equal(calls.some(c=>c.name==='get_project'),false);
}));
