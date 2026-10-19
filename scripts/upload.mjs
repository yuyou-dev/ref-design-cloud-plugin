import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
// Local paths stay in this client; only bytes and a basename reach the service.
export async function upload(bridge,projectId,file){
 const stat=await fs.stat(file);if(!stat.isFile()||stat.size<1||stat.size>5*1024*1024)throw Error('附件必须为 1 byte–5 MiB 的图片文件');
 const bytes=await fs.readFile(file);if(bytes.length!==stat.size)throw Error('文件在读取期间发生变化');
 const mimeType=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'?'image/webp':undefined;
 if(!mimeType)throw Error('仅支持 PNG、JPEG、WebP');
 const sha256=createHash('sha256').update(bytes).digest('hex');
 async function call(name,args){const r=await bridge.call(name,args);if(r.isError)throw Error('附件上传未完成，请检查连接状态');return r.structuredContent||JSON.parse(r.content.find(c=>c.type==='text').text);}
 const start=await call('begin_attachment_upload',{projectId,filename:path.basename(file),mimeType,byteLength:bytes.length,sha256});
 const uploadId=start.uploadId;if(!uploadId)throw Error('无效上传会话');
 try{
  for(let offset=0,index=0;offset<bytes.length;offset+=32768,index++)await call('append_attachment_chunk',{projectId,uploadId,index,dataBase64:bytes.subarray(offset,offset+32768).toString('base64')});
  return await call('complete_attachment_upload',{projectId,uploadId});
 }catch(e){await bridge.call('cancel_attachment_upload',{projectId,uploadId});throw e;}
}
