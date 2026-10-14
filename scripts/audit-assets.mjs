import {createRequire} from 'node:module';
import {readdir,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(process.env.RUNTIME_MODULES+'/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1672,height:941},reducedMotion:'reduce'});
const failed=[];page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));
await page.goto('http://127.0.0.1:5173',{waitUntil:'networkidle'});
const results=[];
for(const dir of ['media','brand'])for(const file of await readdir(`public/${dir}`)){
 const asset=`/${dir}/${file}`;const response=await page.request.get(`http://127.0.0.1:5173${asset}`);
 const decoded=await page.evaluate(async asset=>{if(asset.endsWith('.webm')){const video=document.createElement('video');video.muted=true;video.src=asset;await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(new Error('video decode failed'));});await video.play();await new Promise(resolve=>setTimeout(resolve,300));const result={width:video.videoWidth,height:video.videoHeight,duration:video.duration,time:video.currentTime};video.pause();video.removeAttribute('src');video.load();return result;}const image=new Image();image.src=asset;await image.decode();return {width:image.naturalWidth,height:image.naturalHeight};},asset);
 results.push({asset,bytes:(await stat(`public${asset}`)).size,status:response.status(),type:response.headers()['content-type'],decoded});
}
await page.screenshot({path:'docs/product/verification/asset-audit-before.png',fullPage:true});
await writeFile('docs/product/verification/asset-audit-before.json',JSON.stringify({results,failed},null,2));console.log(JSON.stringify({checked:results.length,failed,results},null,2));await browser.close();
