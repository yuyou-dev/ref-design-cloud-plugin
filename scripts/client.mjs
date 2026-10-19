import {profile} from './profile.mjs';
export function remoteError(config,error){
 return [config?.token,config?.platformToken].filter(Boolean).reduce((s,t)=>s.replaceAll(t,'[REDACTED]'),String(error?.message||error));
}
export function credentialHeaders(config){
 if(config.origin!==profile.apiOrigin)throw Error('连接器只允许访问 Ref Design 固定云端地址');
 return {Authorization:`Bearer ${config.platformToken}`,'x-retouch-authorization':`Bearer ${config.token}`};
}
export function boundFetch(config,request=fetch){
 credentialHeaders(config);
 return (input,options={})=>{
  const url=new URL(typeof input==='object'&&'url'in input?input.url:String(input));
  if(url.origin!==profile.apiOrigin||url.username||url.password)throw Error('禁止向其他地址发送凭据');
  return config.requestGate?config.requestGate.fetch(input,{...options,redirect:'error'},request):request(input,{...options,redirect:'error'});
 };
}
