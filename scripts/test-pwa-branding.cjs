const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const sharp = require("sharp");
(async () => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("app/manifest.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports });
  const manifest = exports.default();
  assert.equal(manifest.background_color, "#f5f7fb");
  assert.equal(manifest.theme_color, "#102d57");
  assert.equal(manifest.id, "/pwa"); assert.equal(manifest.start_url, "/pwa");
  for (const icon of manifest.icons) {
    const file = `public${icon.src}`;
    const size = Number(icon.sizes.split("x")[0]);
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, size); assert.equal(info.height, size);
    assert.equal(data[3], 0, "Top-left corner must be transparent");
    let blue = 0, red = 0, transparent = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i + 3] === 0) transparent++;
      if (data[i + 3] > 200 && data[i] < 100 && data[i + 2] > data[i] + 30) blue++;
      if (data[i + 3] > 200 && data[i] > 180 && data[i + 1] < 100 && data[i + 2] < 120) red++;
    }
    assert.ok(transparent > size * size * .3); assert.ok(blue > size * size * .1); assert.ok(red > size * size * .01);
  }
  assert.ok(fs.readFileSync("app/pwa/loading.tsx", "utf8").includes("app-logo-transparent-192.png"));
  console.log("PASS: manifest, stable install identity, icon sizes, transparent alpha, original blue/red artwork, loading reference");
})().catch(error => { console.error(error); process.exitCode = 1; });
