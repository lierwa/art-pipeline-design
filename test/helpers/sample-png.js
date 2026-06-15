const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");

function writeSamplePng(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const png = new PNG({ width: 32, height: 32 });
  for (let y = 8; y < 24; y++) {
    for (let x = 8; x < 24; x++) {
      const offset = (png.width * y + x) * 4;
      png.data[offset] = 255;
      png.data[offset + 1] = 180;
      png.data[offset + 2] = 200;
      png.data[offset + 3] = 255;
    }
  }
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function writeFullyTransparentPng(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const png = new PNG({ width: 32, height: 32 });
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function writeFullyOpaquePng(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const png = new PNG({ width: 32, height: 32 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 255;
    png.data[i + 1] = 180;
    png.data[i + 2] = 200;
    png.data[i + 3] = 255;
  }
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function writeRgbPng(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const png = new PNG({ width: 32, height: 32 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 255;
    png.data[i + 1] = 180;
    png.data[i + 2] = 200;
    png.data[i + 3] = 255;
  }
  fs.writeFileSync(filePath, PNG.sync.write(png, { colorType: 2 }));
}

module.exports = {
  writeFullyOpaquePng,
  writeFullyTransparentPng,
  writeRgbPng,
  writeSamplePng
};
