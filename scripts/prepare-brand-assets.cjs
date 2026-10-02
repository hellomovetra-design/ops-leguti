// Prepare display sizes from the supplied originals; never overwrite the source artwork.
const sharp = require("sharp");
const base = "public/branding/";
async function trimAlpha(source) {
  const { data, info } = await sharp(base + source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left=info.width, top=info.height, right=-1, bottom=-1;
  for (let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
    if(data[(y*info.width+x)*info.channels+info.channels-1]>8) {
      left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
    }
  }
  if(right<left)throw new Error("Empty artwork");
  return sharp(base + source).extract({left,top,width:right-left+1,height:bottom-top+1}).png().toBuffer();
}
(async()=>{
  const horizontal=await trimAlpha("ops-leguti-horizontal-source.png");
  await sharp(horizontal).resize({width:1000,withoutEnlargement:true}).png().toFile(base+"ops-leguti-horizontal.png");
  for(const size of [32,48])await sharp(base+"ops-leguti-app-source.png").resize(size,size).png().toFile(base+`favicon-${size}.png`);
  for(const size of [180,192,512])await sharp(base+"ops-leguti-app-source.png").resize(size,size).png().toFile(base+`app-icon-${size}.png`);
  console.log("Brand assets prepared from supplied artwork.");
})().catch(error=>{console.error(error);process.exit(1)});
