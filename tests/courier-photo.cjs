const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('lib/courier-photo.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let closed = 0, revoked = 0, attempts = 0, fallback = false;
const canvas = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob(cb) { attempts++; cb(new Blob(['jpeg'], { type: 'image/jpeg' })); } };
class ImageMock { naturalWidth = 4000; naturalHeight = 3000; set src(value) { queueMicrotask(() => fallback === 'fail' ? this.onerror() : this.onload()); } }
const context = { exports: {}, File, Blob, Image: ImageMock, URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => revoked++ }, document: { createElement: () => canvas }, createImageBitmap: async () => { if (fallback) throw Error(); return { width: 1600, height: 1200, close() { closed++; } }; } };
vm.runInNewContext(source, context);
(async () => {
  const prepare = context.exports.prepareCourierPhoto;
  const photo = await prepare(new File(['image'], 'camera.png', { type: 'image/png' }));
  assert.equal(photo.type, 'image/jpeg'); assert.equal(photo.name, 'camera.jpg');
  assert.equal(closed, 1); assert.equal(revoked, 1); assert.equal(canvas.width, 0);
  fallback = true;
  assert.equal((await prepare(new File(['photo'], 'gallery.jpg'))).type, 'image/jpeg');
  fallback = 'fail';
  await assert.rejects(prepare(new File(['bad'], 'broken.heic')), /JPG\/PNG/);
  assert.equal(revoked, 3);
  await assert.rejects(prepare(new File([], 'empty.jpg')), /Ukuran foto/);
  await assert.rejects(prepare(new File(['svg'], 'unsafe.svg')), /JPG/);
  assert.equal(attempts, 2);
  const form = fs.readFileSync('components/courier-check-form.tsx', 'utf8');
  assert.match(form, /Pilih dari galeri<input[^>]+multiple/);
  assert.equal((form.match(/capture="environment"/g) || []).length, 1);
  assert.match(form, /lock.current \|\| photoLock.current/);
  console.log('courier-photo: compression, fallback, cleanup, invalid files, gallery and save guard passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
