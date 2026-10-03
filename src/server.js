import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {networkInterfaces} from 'node:os';
import {pathToFileURL} from 'node:url';
import {WebSocketServer,WebSocket} from 'ws';
import {createEncounter,applyCommand} from './encounter.js';
import {publicRoster,playerView,dmView} from './projection.js';

function example(){
  let s=createEncounter();
  for(const [name,playerName,actorType,initiative,zone] of [['Mira','Sam','pc',22,5],['Torren','Alex','pc',17,3],['Elira','Jess','pc',14,4],['Giant spiders','','enemy',12,0],['Ritualists','','npc',9,1]])
    s=applyCommand(s,{type:'addActor',name,playerName,actorType,initiative,zone});
  return s;
}
export function createServer({port=3000,host='0.0.0.0',dmToken=randomBytes(24).toString('hex')}={}){
  let state=createEncounter(),revision=0;
  const undo=[],registrations=new Map();
  const assets=new Map([['/','index.html'],['/index.html','index.html'],['/styles.css','styles.css'],['/app.js','app.js'],['/ui.js','ui.js'],['/dm.js','dm.js'],['/player.js','player.js']]);
  const server=http.createServer(async(req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname, file=assets.get(path);
    if(req.method!=='GET'||!file){res.writeHead(404);res.end('Not found');return;}
    try{
      const data=await readFile(new URL(`../public/${file}`,import.meta.url));
      res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'"});res.end(data);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:16*1024});
  server.on('upgrade',(req,socket,head)=>{
    let allowed=req.url==='/live';
    if(req.headers.origin){try{allowed=allowed&&new URL(req.headers.origin).host===req.headers.host;}catch{allowed=false;}}
    if(!allowed){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
  });
  const send=(ws,msg)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(msg));};
  const snapshot=ws=>send(ws,{type:'snapshot',role:ws.role,revision,data:ws.role==='dm'?{...dmView(state),canUndo:undo.length>0}:ws.role==='player'?playerView(state,ws.actorId):{roster:publicRoster(state)}});
  function changed(){revision++;for(const [key,id] of registrations)if(!state.actors.some(a=>a.id===id&&!a.removed))registrations.delete(key);for(const ws of wss.clients)snapshot(ws);}
  function remember(){undo.push(structuredClone(state));if(undo.length>50)undo.shift();}
  function validToken(value){if(typeof value!=='string')return false;const a=Buffer.from(value),b=Buffer.from(dmToken);return a.length===b.length&&timingSafeEqual(a,b);}
  wss.on('connection',ws=>{
    ws.role='chooser';ws.actorId=null;ws.on('error',()=>{});snapshot(ws);
    ws.on('message',raw=>{
      let id=null;
      try{
        const message=JSON.parse(raw);id=message.id;
        if(typeof id!=='string'||id.length>100||!message.payload||typeof message.payload!=='object')throw new Error('Invalid request.');
        const p=message.payload;
        if(message.type==='subscribe'){
          if(!['chooser','player','dm'].includes(p.role))throw new Error('Invalid role.');
          if(p.role==='dm'&&!validToken(p.token))throw new Error('The DM key is incorrect. Copy it from the host terminal.');
          ws.role=p.role;ws.actorId=typeof p.actorId==='string'?p.actorId:null;snapshot(ws);
          send(ws,{type:'ack',id,revision});
        }else if(message.type==='register'){
          if(typeof p.key!=='string'||p.key.length<3||p.key.length>100)throw new Error('Registration key is required.');
          let actorId=registrations.get(p.key);
          if(!actorId){
            const next=applyCommand(state,{...p,type:'register'});remember();state=next;actorId=state.actors.at(-1).id;registrations.set(p.key,actorId);changed();
          }
          send(ws,{type:'ack',id,revision,actorId});
        }else if(message.type==='command'){
          if(ws.role!=='dm')throw new Error('Only the DM can control the encounter.');
          if(message.revision!==revision)throw new Error('The scene changed. Review the updated view and try again.');
          if(p.type==='undo'){
            if(!undo.length)throw new Error('Nothing to undo.');state=undo.pop();
          }else{
            const next=p.type==='reset'?createEncounter():p.type==='example'?example():applyCommand(state,p);
            remember();state=next;
          }
          changed();send(ws,{type:'ack',id,revision});
        }else throw new Error('Unknown request.');
      }catch(error){send(ws,{type:'error',id,message:error.message,revision});}
    });
  });
  return {dmToken,address:()=>server.address(),listen:()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolve();});}),close:()=>new Promise(resolve=>{for(const ws of wss.clients)ws.terminate();wss.close();server.close(resolve);})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const app=createServer({port:Number(process.env.PORT||3000),host:process.env.HOST||'0.0.0.0'});
  try{
    await app.listen();const port=app.address().port;
    console.log(`\nTemporal Atrium\nLocal: http://localhost:${port}\nDM key: ${app.dmToken}\nPrivate DM link: http://localhost:${port}/#dm=${app.dmToken}`);
    for(const addresses of Object.values(networkInterfaces()))for(const a of addresses??[])if(a.family==='IPv4'&&!a.internal)console.log(`Player link: http://${a.address}:${port}`);
    console.log('\nKeep this terminal open. Encounter state is held in memory.\n');
    for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
  }catch(error){console.error(`Unable to start: ${error.message}`);process.exitCode=1;}
}
