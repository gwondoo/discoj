const sharp=require('sharp');const path=require('node:path');
(async()=>{const root=path.resolve(__dirname,'../../..'),dir=path.join(root,'activity-test/public/dj');
const names=['idle','groove-left','groove-right','sleep','dig','confused'];const panels=[];
for(let i=0;i<names.length;i++){
 const full=await sharp({create:{width:1024,height:1024,channels:4,background:'#e6dfd0'}}).composite([{input:path.join(dir,names[i]+'.png')},{input:path.join(dir,'console.png')}]).png().toBuffer();
 panels.push({input:await sharp(full).resize(320,320).png().toBuffer(),left:(i%3)*320,top:Math.floor(i/3)*350});
 panels.push({input:Buffer.from(`<svg width="320" height="30"><text x="160" y="21" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#333">${names[i]}</text></svg>`),left:(i%3)*320,top:Math.floor(i/3)*350+320});
}
await sharp({create:{width:960,height:700,channels:4,background:'#e6dfd0'}}).composite(panels).png().toFile(path.join(__dirname,'preview.png'));
})();
