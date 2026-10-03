// Compose a code-native circular badge around the original logo (no redraw).
const fs = require("node:fs/promises");
const sharp = require("sharp");
const base = "public/branding/";
(async () => {
  const logo = (await fs.readFile(base + "app-logo-transparent-192.png")).toString("base64");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><circle cx="64" cy="64" r="63" fill="white"/><image x="8" y="8" width="112" height="112" href="data:image/png;base64,${logo}"/></svg>`;
  await fs.writeFile(base + "browser-favicon-white-circle.svg", svg);
  for (const size of [32, 48]) {
    await sharp(Buffer.from(svg)).resize(size, size).png().toFile(base + `browser-favicon-white-circle-${size}.png`);
  }
  console.log("Browser favicons prepared; PWA icons unchanged.");
})().catch(error => { console.error(error); process.exitCode = 1; });
