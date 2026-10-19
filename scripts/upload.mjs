import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
// Local paths stay in this client; only bytes and a basename reach the service.
export async function upload(bridge,projectId,file,{now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const stat=await fs.stat(file);if(!stat.isFile()||stat.size<1||stat.size>5*1024*1024)throw Error('附件必须为 1 byte–5 MiB 的图片文件');
 const bytes=await fs.readFile(file);if(bytes.length!==stat.size)throw Error('文件在读取期间发生变化');
 const mimeType=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'?'image/webp':undefined;
 if(!mimeType)throw Error('仅支持 PNG、JPEG、WebP');
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const deadline=now()+9*60*1000;let retries=0;
 async function call(name,args){
  const retrySafe=name==='append_attachment_chunk'||name==='complete_attachment_upload'||name==='get_project';
  for(let attempt=0;;attempt++){
   try{
    const r=await bridge.call(name,args);
    const value=r.structuredContent||JSON.parse(r.content.find(c=>c.type==='text').text);
    if(r.isError)throw Object.assign(Error(value.message||'附件上传未完成'),{diagnostic:value.diagnostic});
    return value;
   }catch(error){
    const d=error.diagnostic;
    const delay=Number.isFinite(d?.retryAt)?Math.max(1000,d.retryAt-now()):10000;
    if(!retrySafe||!d?.retryable||attempt>=4||retries>=12||now()+delay>=deadline)throw error;
    retries++;await sleep(delay);
    if(now()>=deadline)throw error;
   }
  }
 }
 const start=await call('begin_attachment_upload',{projectId,filename:path.basename(file),mimeType,byteLength:bytes.length,sha256});
 const uploadId=start.uploadId;if(!uploadId)throw Error('无效上传会话');
 try{
  for(let offset=0,index=0;offset<bytes.length;offset+=32768,index++)await call('append_attachment_chunk',{projectId,uploadId,index,dataBase64:bytes.subarray(offset,offset+32768).toString('base64')});
  const result=await call('complete_attachment_upload',{projectId,uploadId});
  if(result.source?.sha256!==sha256||result.source?.bytes!==bytes.length)throw Error('附件原始字节校验失败，已停止生成');
  const saved=await call('get_project',{projectId});
  if(!result.asset?.id||saved.project?.reference?.id!==result.asset.id)throw Error('工程参考图与上传素材不一致，已停止生成');
  return result;
 }catch(e){try{await bridge.call('cancel_attachment_upload',{projectId,uploadId});}catch{}throw e;}
}
