const {chromium}=require('/opt/node-tools/node_modules/playwright');
(async()=>{
 const b=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-video-capture='+__dirname+'/cam.y4m','--use-file-for-fake-audio-capture='+__dirname+'/mic.wav','--enable-unsafe-webgpu','--enable-features=Vulkan','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const p=await b.newPage(); p.on('console',m=>{ if(m.type()==='error') console.log('console.error:',m.text().slice(0,300))});
 await p.goto('http://localhost:8765/index.html'); await p.waitForFunction(()=>document.title==='done',null,{timeout:120000});
 console.log(JSON.stringify(await p.evaluate(()=>window.__out),null,1)); await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
