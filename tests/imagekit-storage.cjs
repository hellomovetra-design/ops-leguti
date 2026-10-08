const fs = require("node:fs"), assert = require("node:assert/strict"), ts = require("typescript"), vm = require("node:vm"), crypto = require("node:crypto");
const env = { IMAGEKIT_PRIVATE_KEY: "test-private", IMAGEKIT_URL_ENDPOINT: "https://ik.imagekit.io/test" };
let request;
const api = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("lib/imagekit.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: api.exports, require, process: { env }, URLSearchParams, AbortSignal, Date,
  fetch: async (url, options) => {
    request = { url, options };
    return url.includes("upload.imagekit") ? { ok: true, json: async () => ({ filePath: "/barkur/photo.png", fileId: "file-id" }) }
      : new Response(new Uint8Array([1,2,3]), { headers: { "content-type": "image/png" } });
  },
});
(async () => {
  const image = await api.exports.uploadToImageKit(new File(["png"], "photo.png", { type: "image/png" }), "barkur/photo.png");
  assert.equal(request.options.body.get("isPrivateFile"), "true");
  assert.equal(image.path, "/barkur/photo.png");
  const file = await api.exports.fetchFromImageKit(image.path);
  assert.equal(file.headers.get("content-type"), "image/png");
  const url = new URL(request.url), expiry = url.searchParams.get("ik-t");
  assert.equal(url.searchParams.get("ik-s"), crypto.createHmac("sha1", env.IMAGEKIT_PRIVATE_KEY).update("barkur/photo.png" + expiry).digest("hex"));
  assert.equal(request.options.redirect, "error");
  for (const path of ["../secret", "a/../b", "a?url=https://evil.test", "a#x", "a/%2e%2e/b"]) await assert.rejects(api.exports.fetchFromImageKit(path));
  delete env.IMAGEKIT_PRIVATE_KEY;
  assert.equal(api.exports.isImageKitConfigured(), false);
  env.IMAGEKIT_REQUIRED = "true";
  assert.throws(() => api.exports.isImageKitConfigured());
  console.log("PASS: private uploads, server-side signed retrieval, path validation, strict configuration.");
})().catch(error => { console.error(error); process.exitCode = 1; });
