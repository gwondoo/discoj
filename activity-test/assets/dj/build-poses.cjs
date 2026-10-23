// Deterministic cutout/rig of the original photo. No generated face or expression edits.
// Run with NODE_PATH pointing to a directory containing sharp.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '../../..');
const out = path.join(root, 'activity-test/public/dj');
const dogPath = 'M160 185 C157 181 157 176 161 170 C164 163 174 162 185 161 C198 157 207 158 215 161 C225 164 229 175 232 185 C240 181 248 184 254 187 C265 194 269 207 263 217 L253 232 C249 235 244 238 239 240 L235 255 C235 259 234 263 232 268 C240 267 244 269 245 276 C249 285 244 294 241 300 C244 303 247 310 246 315 C242 321 234 318 229 314 L173 314 C163 313 153 312 145 309 C137 309 137 304 141 300 L145 297 C136 295 134 287 137 279 C140 273 146 268 150 268 C147 260 146 253 146 248 L145 235 C139 233 135 228 136 221 C137 205 144 191 159 186 Z';
const consolePath = 'M63 338 Q60 330 73 326 L108 308 Q120 302 137 307 L300 333 Q328 338 331 353 L329 413 Q326 444 302 463 Q296 469 284 466 L80 406 Q69 402 69 392 Z';
const wrap = body => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;
const png = async svg => {
 const {data,info}=await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 // Remove only near-white background connected to the exterior, preserving enclosed fur highlights.
 const seen=new Uint8Array(info.width*info.height), queue=new Int32Array(seen.length);let head=0,tail=0;
 const visit=i=>{if(i<0||i>=seen.length||seen[i])return;seen[i]=1;const p=i*4;
  if(data[p+3]===0||(Math.min(data[p],data[p+1],data[p+2])>248&&Math.max(data[p],data[p+1],data[p+2])-Math.min(data[p],data[p+1],data[p+2])<6)){data[p+3]=0;queue[tail++]=i;}};
 for(let x=0;x<info.width;x++){visit(x);visit((info.height-1)*info.width+x);}
 for(let y=0;y<info.height;y++){visit(y*info.width);visit(y*info.width+info.width-1);}
 while(head<tail){const i=queue[head++],x=i%info.width;if(x)visit(i-1);if(x<info.width-1)visit(i+1);visit(i-info.width);visit(i+info.width);}
 return sharp(data,{raw:info}).png({palette:true,colours:192,dither:0,effort:10}).toBuffer();
};
(async () => {
 const original = await fs.readFile(path.join(root,'activity-test/public/dj-original.jpeg'));
 const href = 'data:image/jpeg;base64,' + original.toString('base64');
 await fs.mkdir(out,{recursive:true});
 const poses = [
  ['idle',0,0,1], ['idle-blink',0,0,1],
  ['groove-left',-15,0,1], ['groove-right',15,0,1],
  ['sleep',4,32,.94], ['dig',-7,48,.92], ['confused',20,0,1],
 ];
 for(const [name,angle,dy,sy] of poses) {
  const svg=wrap(`<defs><clipPath id="dog"><path d="${dogPath}"/></clipPath></defs><g transform="translate(0 ${dy}) rotate(${angle} 512 700) translate(0 700) scale(1 ${sy}) translate(0 -700)"><g transform="matrix(3.3 0 0 3.3 -131.5 -334.8)"><image xlink:href="${href}" width="399" height="501" clip-path="url(#dog)"/></g></g>`);
  await fs.writeFile(path.join(out,name+'.png'),await png(svg));
 }
 // Clone a blank fabric patch from the original console to cover the front lettering.
 const patch=await sharp(original).extract({left:220,top:375,width:50,height:50}).png().toBuffer();
 const consoleSvg=wrap(`<defs><clipPath id="console"><path d="${consolePath}"/></clipPath><clipPath id="patch"><path d="M74 349 L286 382 L285 461 L80 404 Q73 402 74 389Z"/></clipPath></defs><g transform="matrix(3.05 0 0 2.15 -86  -18)"><g clip-path="url(#console)"><image xlink:href="${href}" width="399" height="501"/><image xlink:href="data:image/png;base64,${patch.toString('base64')}" x="72" y="347" width="216" height="117" preserveAspectRatio="none" clip-path="url(#patch)"/></g></g>`);
 await fs.writeFile(path.join(out,'console.png'),await png(consoleSvg));
 for(const name of [...poses.map(p=>p[0]),'console']) {
  const file=path.join(out,name+'.png'); const m=await sharp(file).metadata();
  console.log(name, m.width+'x'+m.height, m.hasAlpha?'alpha':'NO ALPHA',(await fs.stat(file)).size+' bytes');
 }
})();
