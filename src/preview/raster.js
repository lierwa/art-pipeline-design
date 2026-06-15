const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");

function createCanvas(width, height, color) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = color[0];
    png.data[i + 1] = color[1];
    png.data[i + 2] = color[2];
    png.data[i + 3] = color[3];
  }
  return png;
}

function drawRect(target, x, y, width, height, color) {
  const minX = Math.max(0, Math.floor(x));
  const minY = Math.max(0, Math.floor(y));
  const maxX = Math.min(target.width, Math.ceil(x + width));
  const maxY = Math.min(target.height, Math.ceil(y + height));
  for (let py = minY; py < maxY; py++) {
    for (let px = minX; px < maxX; px++) {
      const offset = (target.width * py + px) * 4;
      target.data[offset] = color[0];
      target.data[offset + 1] = color[1];
      target.data[offset + 2] = color[2];
      target.data[offset + 3] = color[3];
    }
  }
}

function blendPixel(target, source, targetX, targetY, sourceX, sourceY) {
  if (targetX < 0 || targetY < 0 || targetX >= target.width || targetY >= target.height) return;
  const sourceOffset = (source.width * sourceY + sourceX) * 4;
  const alpha = source.data[sourceOffset + 3] / 255;
  if (alpha === 0) return;

  const targetOffset = (target.width * targetY + targetX) * 4;
  target.data[targetOffset] = Math.round(source.data[sourceOffset] * alpha + target.data[targetOffset] * (1 - alpha));
  target.data[targetOffset + 1] = Math.round(source.data[sourceOffset + 1] * alpha + target.data[targetOffset + 1] * (1 - alpha));
  target.data[targetOffset + 2] = Math.round(source.data[sourceOffset + 2] * alpha + target.data[targetOffset + 2] * (1 - alpha));
  target.data[targetOffset + 3] = 255;
}

function drawScaled(target, source, x, y, width, height) {
  const drawWidth = Math.max(1, Math.floor(width));
  const drawHeight = Math.max(1, Math.floor(height));
  for (let py = 0; py < drawHeight; py++) {
    const sourceY = Math.min(source.height - 1, Math.floor((py / drawHeight) * source.height));
    for (let px = 0; px < drawWidth; px++) {
      const sourceX = Math.min(source.width - 1, Math.floor((px / drawWidth) * source.width));
      blendPixel(target, source, Math.floor(x + px), Math.floor(y + py), sourceX, sourceY);
    }
  }
}

function fitSize(source, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / source.width, maxHeight / source.height);
  return {
    width: Math.max(1, Math.floor(source.width * scale)),
    height: Math.max(1, Math.floor(source.height * scale))
  };
}

function loadAssets(assets) {
  return assets.map((entry) => ({
    ...entry,
    image: PNG.sync.read(fs.readFileSync(entry.source))
  }));
}

function writePng(filePath, png) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function writeContactSheet({ assets, target }) {
  const loaded = loadAssets(assets);
  const columns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(Math.max(1, loaded.length)))));
  const rows = Math.max(1, Math.ceil(loaded.length / columns));
  const cell = 112;
  const padding = 14;
  const sheet = createCanvas(columns * cell, rows * cell, [244, 241, 235, 255]);

  loaded.forEach((entry, index) => {
    const cellX = (index % columns) * cell;
    const cellY = Math.floor(index / columns) * cell;
    drawRect(sheet, cellX + 6, cellY + 6, cell - 12, cell - 12, [255, 251, 242, 255]);
    const size = fitSize(entry.image, cell - padding * 2, cell - padding * 2);
    drawScaled(
      sheet,
      entry.image,
      cellX + Math.floor((cell - size.width) / 2),
      cellY + Math.floor((cell - size.height) / 2),
      size.width,
      size.height
    );
  });

  writePng(target, sheet);
}

function regionFor(entry, index) {
  const region = entry.asset.sourceRegion;
  if (region && region.type === "bbox" && Number.isFinite(region.x) && Number.isFinite(region.y) && Number.isFinite(region.w) && Number.isFinite(region.h)) {
    return region;
  }
  return {
    x: 24 + index * 28,
    y: 24 + index * 24,
    w: Math.max(entry.image.width, 96),
    h: Math.max(entry.image.height, 96)
  };
}

function writeCompositePreview({ assets, target }) {
  const loaded = loadAssets(assets)
    .map((entry, index) => ({ ...entry, region: regionFor(entry, index) }))
    .sort((a, b) => (a.asset.layer || 0) - (b.asset.layer || 0));

  const bounds = loaded.reduce((acc, entry) => ({
    right: Math.max(acc.right, entry.region.x + entry.region.w),
    bottom: Math.max(acc.bottom, entry.region.y + entry.region.h)
  }), { right: 256, bottom: 256 });
  const scale = Math.min(1, 768 / Math.max(bounds.right, bounds.bottom));
  const width = Math.max(256, Math.ceil(bounds.right * scale));
  const height = Math.max(256, Math.ceil(bounds.bottom * scale));
  const canvas = createCanvas(width, height, [226, 238, 232, 255]);

  loaded.forEach((entry) => {
    drawScaled(
      canvas,
      entry.image,
      entry.region.x * scale,
      entry.region.y * scale,
      entry.region.w * scale,
      entry.region.h * scale
    );
  });

  writePng(target, canvas);
}

function writePreviewImages({ assets, exportDir }) {
  writeContactSheet({ assets, target: path.join(exportDir, "contact_sheet.png") });
  writeCompositePreview({ assets, target: path.join(exportDir, "composite_preview.png") });
}

module.exports = { writePreviewImages };
