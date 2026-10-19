import http from 'node:http';
import {randomBytes} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {profile as defaultProfile} from './profile.mjs';
import {createStore} from './store.mjs';
const beginPlatformLogin=(...args)=>import('./platform-auth.mjs').then(m=>m.beginPlatformLogin(...args));
const refreshPlatformLogin=(...args)=>import('./platform-auth.mjs').then(m=>m.refreshPlatformLogin(...args));

import {responseError} from './cloud-errors.mjs';
const expiry=value=>typeof value==='number'?value:Date.parse(value);
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const page=(title,body)=>`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title} · Ref Design</title><style>body{font:16px system-ui;background:#171a1c;color:#f7f5ee;display:grid;place-items:center;min-height:95vh}main{width:min(520px,85vw);padding:36px 0}h1{font-size:32px}p{line-height:1.8;color:#c8c9c9}a{display:inline-block;background:#ecd6a3;color:#222;padding:14px 20px;border-radius:8px;text-decoration:none;margin:12px 0}code{font:26px monospace;letter-spacing:3px;color:#ecd6a3}small{color:#b8bdc0}</style><main><small>REF_DESIGN / 连接你的云端工作台</small><h1>${title}</h1>${body}</main></html>`;
export function createOnboarding({profile=defaultProfile,store=createStore(),platformLogin=beginPlatformLogin,refresh=refreshPlatformLogin,request=fetch,now=Date.now,random=Math.random}={}){
  let phase='login',server,login,localOrigin,nonce,state='idle',message='',pending,platform,expiresAt=0,nextPollAt=0,attempt=0,diagnostic,polling,configPending;
  async function api(route,body){
    const r=await request(profile.apiOrigin+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+platform.accessToken,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw await responseError(r,{path:route,phase:route.endsWith('/poll')?'pairing_poll':phase,attempt,now:now(),random});
    return r.json();
  }
  async function stop(){if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=undefined;}}
  const safeStatus=()=>({ok:!['error','expired','cancelled'].includes(state),state,message,...(diagnostic?{diagnostic,pairingRetained:!!pending}:{}),...(nextPollAt?{retryAt:nextPollAt}:{}),...(pending?{pairingCode:pending.userCode,expiresAt:pending.expiresAt,openUrl:profile.communityUrl}:{}),...(state==='awaiting_platform'?{loginUrl:localOrigin+'/start/'+nonce}:{}),communityUrl:profile.communityUrl});
  async function begin(){
    if(server&&expiresAt>now()&&['awaiting_platform','awaiting_pairing','retry_wait'].includes(state))return safeStatus();
    await stop();pending=undefined;diagnostic=undefined;nextPollAt=0;attempt=0;state='starting';message='正在准备魔搭登录…';expiresAt=now()+15*60*1000;nonce=randomBytes(24).toString('hex');
    server=http.createServer(async(req,res)=>{
      const send=(status,html)=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});res.end(html);};
      if(req.headers.host!==new URL(localOrigin).host||req.method!=='GET'||(req.headers.origin&&req.headers.origin!==localOrigin))return send(403,'不接受此请求');
      if(now()>expiresAt)return send(410,page('连接已过期','<p>请回到 Codex，说“重新连接 Ref Design”。</p>'));
      const url=new URL(req.url,localOrigin);
      if(url.pathname==='/start/'+nonce)return send(200,page('先登录魔搭',`<p>使用你自己的魔搭账号授权 Ref Design 连接器访问云端服务。下一步再登录管理员提供的 Ref Design 工作区。</p><p>密码只在魔搭和 Ref Design 页面输入，不要发送到聊天中。连接凭据仅保存在本机。</p><a href="${escape(login.url)}">使用魔搭账号登录</a>`));
      if(url.pathname==='/callback'&&state==='awaiting_platform'){
        state='checking_platform';
        try{
          phase='login';platform=await login.complete(url.href);phase='access';await setup();
          return send(200,page('魔搭已登录',`<p>打开工作台，登录你的 Ref Design 测试账号，然后点击“连接 Codex”。</p><p>本次配对码</p><code>${escape(pending.userCode)}</code><p>配对码有效期以服务器为准，本次到期时间：${escape(new Date(pending.expiresAt).toISOString())}。确认连接后回到 Codex 即可开始设计。</p><a href="${profile.communityUrl}">打开 Ref Design 工作台</a>`));
        }catch(error){handleFailure(error);return send(state==='retry_wait'?200:400,page(state==='retry_wait'?'正在等待云端恢复':'连接尚未完成',`<p>${escape(message)}</p><p>请回到 Codex 查看连接进度。</p>`));}
      }
      send(404,'页面不存在');
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    localOrigin=`http://127.0.0.1:${server.address().port}`;
    try{login=await platformLogin(localOrigin+'/callback');state='awaiting_platform';message='请在打开的页面登录魔搭。';return safeStatus();}
    catch{await stop();state='error';message='魔搭登录服务暂时不可用，请稍后重试。';return safeStatus();}
  }
  function handleFailure(error){
    diagnostic=error.diagnostic;
    if(diagnostic?.retryable&&phase!=='login'){
      state='retry_wait';nextPollAt=diagnostic.retryAt;attempt++;message=error.message+' 当前连接进度已保留，无需重新登录。';return;
    }
    state=diagnostic?.httpStatus===410?'expired':'error';
    message=state==='expired'?'配对已过期，请重新连接。':'连接未完成，请重新连接或联系管理员。';pending=undefined;
  }
  async function setup(){
    if(phase==='access'){await api('/health');phase='pairing';}
    pending=await api('/api/codex/device/start',{});
    pending.expiresAt=now()+pending.expiresIn*1000;
    phase='pairing_poll';state='awaiting_pairing';diagnostic=undefined;attempt=0;nextPollAt=0;
    message='魔搭已登录。请在 Ref Design 工作区点击“连接 Codex”，输入配对码并确认。';
  }
  async function poll(){
    try{
      if(!pending){await setup();return safeStatus();}
      const result=await api('/api/codex/device/poll',{deviceCode:pending.deviceCode});
      diagnostic=undefined;attempt=0;state='awaiting_pairing';nextPollAt=now()+5000;message='正在等待工作区确认配对。';
      if(['denied','expired'].includes(result.status)){state=result.status==='denied'?'cancelled':'expired';pending=undefined;message='连接未授权或已过期，请重新连接。';return safeStatus();}
      if(result.status==='authorized'){
        await store.write({version:1,profile:profile.apiOrigin,platform,token:{...result,expiresAt:now()+result.expires_in*1000}});
        state='connected';message='已保存用户授权，正在核验云端连接。';pending=undefined;nextPollAt=0;
        return safeStatus();
      }
    }catch(error){handleFailure(error);}
    return safeStatus();
  }
  async function status(){
    if(['awaiting_pairing','retry_wait'].includes(state)){
      if(polling)return polling;
      if(now()>=(pending?.expiresAt||expiresAt)){state='expired';pending=undefined;diagnostic=undefined;nextPollAt=0;message='配对已过期，请重新连接。';return safeStatus();}
      if(now()<nextPollAt)return safeStatus();
      polling=poll().finally(()=>{polling=undefined;});return polling;
    }
    if(state!=='idle')return safeStatus();
    const saved=await store.read();
    if(saved.profile===profile.apiOrigin&&saved.token?.refresh_token)return {ok:true,state:'saved',message:'已找到本机保存的连接，正在使用时会核验云端登录。',communityUrl:profile.communityUrl};
    return {ok:true,state:'not_connected',message:'尚未连接。请开始登录 Ref Design。',communityUrl:profile.communityUrl};
  }
  async function loadConfig(){
    let saved=await store.read();
    if(saved.profile!==profile.apiOrigin||!saved.token?.refresh_token)throw Object.assign(Error('请先调用 ref_design_connect，在浏览器登录并配对。'),{code:'NOT_CONNECTED'});
    const updated=await refresh(saved.platform);
    if(updated!==saved.platform){saved={...saved,platform:updated};await store.write(saved);}
    if(saved.token.expiresAt<=now()+60000){
      const response=await request(profile.apiOrigin+'/oauth/token',{method:'POST',headers:{Authorization:'Bearer '+saved.platform.accessToken,'Content-Type':'application/json'},body:JSON.stringify({grant_type:'refresh_token',client_id:saved.token.client_id,refresh_token:saved.token.refresh_token,resource:profile.browserOrigin+'/mcp'}),redirect:'error',signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw await responseError(response,{path:'/oauth/token',phase:'app_refresh',now:now(),random});
      const tokens=await response.json();
      if(!tokens.access_token||!tokens.refresh_token)throw Error('应用授权已到期，请重新连接。');
      saved={...saved,token:{...saved.token,...tokens,expiresAt:now()+tokens.expires_in*1000}};await store.write(saved);
    }
    return {origin:profile.apiOrigin,token:saved.token.access_token,platformToken:saved.platform.accessToken};
  }
  function config(){return configPending ||= loadConfig().finally(()=>{configPending=undefined;});}
  return {begin,status,config,stop};
}
