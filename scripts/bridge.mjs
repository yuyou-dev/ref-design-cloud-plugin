import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createOnboarding} from './onboarding.mjs';
import {credentialHeaders,boundFetch,remoteError} from './client.mjs';
import {profile} from './profile.mjs';
import {createRequestGate} from './cloud-errors.mjs';
const object={type:'object',properties:{},additionalProperties:false};
const localTools=[
 {name:'ref_design_connect',description:'首次连接或重新登录 Ref Design 云端工作台。返回本机安全登录页；在 Codex 内置浏览器打开，让用户登录魔搭，再在 Ref Design 输入配对码。密码与令牌不得进入聊天。',inputSchema:object},
 {name:'ref_design_connection_status',description:'检查配对进度和已保存连接。返回工作区与友好的状态，不返回凭据。登录后调用，配对完成后核对云端身份。',inputSchema:object,annotations:{readOnlyHint:true}},
];
const result=value=>({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value});
export function createBridge({onboarding=createOnboarding(),changed=()=>{},now=Date.now,requestGate=createRequestGate({now}),makeClient=()=>new Client({name:'ref-design-cloud',version:profile.version})}={}){
 let remote,config,key,connecting,discovery,remoteTools=[],listedAt=0,listPending,verified,statusPending;
 const failure=error=>({isError:true,...result({ok:false,state:error.diagnostic?.retryable?'retry_wait':'needs_attention',message:config?remoteError(config,error):'连接未就绪，请重新登录 Ref Design。',...(error.diagnostic?{diagnostic:error.diagnostic,retryAt:error.diagnostic.retryAt}:{}),...(discovery?{discovery}:{} )})});
 async function connected(){
  const next=await onboarding.config(),nextKey=next.token+next.platformToken;
  if(remote&&key===nextKey)return remote;
  if(connecting)return connecting;
  connecting=(async()=>{
   if(remote)await remote.close();remote=undefined;config={...next,requestGate};remoteTools=[];listedAt=0;verified=undefined;
   const client=makeClient();
   try{await client.connect(new StreamableHTTPClientTransport(new URL(config.origin+'/mcp'),{requestInit:{headers:credentialHeaders(config),redirect:'error'},fetch:boundFetch(config)}));}
   catch(e){await client.close().catch(()=>{});throw e;}
   remote=client;key=nextKey;return remote;
  })().finally(()=>{connecting=undefined;});return connecting;
 }
 async function list(){
  if(listPending)return listPending;
  if(discovery?.retryAt>now()||listedAt>now())return [...localTools,...remoteTools];
  listPending=(async()=>{
   try{
    const found=(await(await connected()).listTools()).tools.filter(t=>!localTools.some(l=>l.name===t.name));
    const notify=discovery?.state==='unavailable'||JSON.stringify(found)!==JSON.stringify(remoteTools);
    remoteTools=found;discovery={state:'available'};listedAt=now()+30000;
    if(notify)await changed();
   }catch(error){if(error.code==='NOT_CONNECTED'){discovery={state:'not_connected'};return localTools;}discovery={state:'unavailable',message:'设计工具暂时无法加载，请查看连接状态后稍候重试。',retryAt:error.diagnostic?.retryAt||now()+10000,...(error.diagnostic?{diagnostic:{...error.diagnostic,phase:'tool_discovery'}}:{})};}
   return [...localTools,...remoteTools];
  })().finally(()=>{listPending=undefined;});return listPending;
 }
 async function checkStatus(){
  const status=await onboarding.status();
  if(!['connected','saved'].includes(status.state))return result({...status,...(discovery?{discovery}:{})});
  const blocked=requestGate.pending();if(blocked)throw blocked;
  if(verified?.until>now())return result({...verified.status,...(discovery?{discovery}:{})});
  const checked=await(await connected()).callTool({name:'list_projects',arguments:{}});
  if(checked.isError)return checked;
  const actual=checked.structuredContent||JSON.parse(checked.content.find(c=>c.type==='text').text);

  await list();
  const value={...status,state:'connected',message:'已连接云端工作区，可以开始设计。',projectCount:(actual.projects||[]).length,discovery};
  verified={until:now()+5000,status:value};return result(value);
 }
 async function call(name,args={}){
  try{
   if(name==='ref_design_connect')return result(await onboarding.begin());
   if(name==='ref_design_connection_status'){
    if(!statusPending)statusPending=checkStatus().finally(()=>{statusPending=undefined;});
    return await statusPending;
   }
   const client=await connected();
   return await client.callTool({name,arguments:args});
  }catch(error){return failure(error);}
 }
 return {list,call,async close(){await onboarding.stop();if(remote)await remote.close();}};
}
