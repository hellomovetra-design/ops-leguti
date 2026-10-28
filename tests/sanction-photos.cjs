const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
let failAt=0,uploaded=0,removed=[];
const kit={isImageKitConfigured:()=>true,uploadToImageKit:async(file,path)=>{uploaded++;if(uploaded===failAt)throw Error('Upload gagal');return{path,fileId:String(uploaded)}},deleteFromImageKit:async(id)=>removed.push(id)};
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sanction-photos.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:()=>kit,crypto:globalThis.crypto,Uint8Array});
const {validateSanctionPhotos,uploadSanctionPhotos,sanctionPhotoView}=m.exports;
const jpg=()=>new File([new Uint8Array([255,216,255,1])],'foto.jpg',{type:'image/jpeg'});
(async()=>{
 await assert.rejects(()=>validateSanctionPhotos([]),/minimal 1/);await validateSanctionPhotos([jpg()]);await validateSanctionPhotos([jpg(),jpg(),jpg()]);
 await assert.rejects(()=>validateSanctionPhotos([jpg(),jpg(),jpg(),jpg()]),/maksimal 3/);await assert.rejects(()=>validateSanctionPhotos([jpg()],3),/maksimal 3/);
 await assert.rejects(()=>validateSanctionPhotos([new File(['not a photo'],'fake.jpg',{type:'image/jpeg'})]),/valid/);
 await assert.rejects(()=>validateSanctionPhotos([new File(['<svg/>'],'fake.svg',{type:'image/svg+xml'})]),/valid/);
 await assert.rejects(()=>validateSanctionPhotos([new File([new Uint8Array(3*1024*1024+1)],'big.jpg',{type:'image/jpeg'})]),/3 MB/);
 failAt=2;await assert.rejects(()=>uploadSanctionPhotos([jpg(),jpg()],'test'),/Upload gagal/);assert.deepEqual(removed,['1'],'Partial upload cleaned up');
 uploaded=0;failAt=0;const photos=await uploadSanctionPhotos([jpg()],'test');assert(photos[0].path.startsWith('sanctions/test/'));
 const view=sanctionPhotoView({id:'test',updated_at:'now',photos},'admin');assert(view[0].url.startsWith('/api/employee-sanctions?'));assert(!Object.hasOwn(view[0],'path'));assert(!Object.hasOwn(view[0],'fileId'));
 console.log('PASS: 1–3 proof photos, size/magic-byte validation, no SVG, partial-upload cleanup and private proxy URLs.');
})().catch(e=>{console.error(e);process.exitCode=1});
