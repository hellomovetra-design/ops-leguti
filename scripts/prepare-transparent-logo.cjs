// Reuse the original transparent artwork; only resize, never redraw the logo.
const sharp = require("sharp");
const base = "public/branding/";
(async () => {
  for (const size of [32, 48, 192, 512]) {
    await sharp(base + "ops-leguti-monogram-source.png").resize(size, size).png().toFile(base + `app-logo-transparent-${size}.png`);
  }
  console.log("Transparent PWA logo sizes prepared.");
})().catch(error => { console.error(error); process.exitCode = 1; });
