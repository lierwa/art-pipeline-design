const fs = require("node:fs");
const { PNG } = require("pngjs");

function validatePngAsset(filePath) {
  if (!filePath.endsWith(".png")) throw new Error(`not a png: ${filePath}`);
  const contents = fs.readFileSync(filePath);
  let png;
  try {
    png = PNG.sync.read(contents);
  } catch (error) {
    throw new Error(`invalid png: ${filePath}: ${error.message}`);
  }
  const hasAlpha = png.alpha === true && (png.colorType === 4 || png.colorType === 6);
  if (!hasAlpha) throw new Error(`png must include an alpha channel: ${filePath}`);

  let visible = 0;
  let transparent = 0;
  for (let i = 3; i < png.data.length; i += 4) {
    if (png.data[i] > 0) visible++;
    if (png.data[i] < 255) transparent++;
  }
  if (visible < 200) throw new Error(`too few visible pixels: ${filePath}`);
  if (transparent === 0) throw new Error(`png must include at least one transparent pixel: ${filePath}`);
  return { width: png.width, height: png.height, visiblePixels: visible, transparentPixels: transparent, hasAlpha };
}

module.exports = { validatePngAsset };
