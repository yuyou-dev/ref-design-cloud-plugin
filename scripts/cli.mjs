import fs from 'node:fs/promises';
import {createBridge} from './bridge.mjs';
import {connect} from './cli-connect.mjs';
import {upload} from './upload.mjs';
const bridge=createBridge();
const [command,...args]=process.argv.slice(2);
const show=value=>console.log(JSON.stringify(value));
try{
 if(command==='connect'){
  process.exitCode=await connect(bridge,show);await bridge.close();
 }else{
  if(command==='upload'&&args[0]&&args[1])show(await upload(bridge,args[0],args[1]));
  else if(command==='status')show(await bridge.call('ref_design_connection_status'));
  else if(command==='tools')show(await bridge.list());
  else if(command==='call'&&args[0]){
   const input=args[1]?JSON.parse(await fs.readFile(args[1],'utf8')):{};
   show(await bridge.call(args[0],input));
  }else throw Error('用法：connect | status | tools | call 工具名 [参数JSON文件] | upload 工程ID 本轮附件路径');
  await bridge.close();
 }
}catch{console.error('Ref Design 连接未完成，请重新连接或检查插件安装。');await bridge.close();process.exitCode=1;}
