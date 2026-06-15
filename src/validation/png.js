const fs = require("node:fs");
const { PNG } = require("pngjs");

function validatePngAsset(filePath) {
  if (!filePath.endsWith(".png")) throw new Error(`not a png: ${filePath}`);
  const png = PNG.sync.read(fs.readFileSync(filePath));
  let visible = 0;
  for (let i = 3; i < png.data.length; i += 4) {
    if (png.data[i] > 0) visible++;
  }
  if (visible < 200) throw new Error(`too few visible pixels: ${filePath}`);
  return { width: png.width, height: png.height, visiblePixels: visible };
}

module.exports = { validatePngAsset };
