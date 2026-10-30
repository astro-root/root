// public/apple-touch-icon.png（元画像・180x180）から各種アイコンを生成する。
// 元画像より大きいサイズは拡大になるため、必要最小限（192px）に留めている。
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const pub = path.resolve(import.meta.dirname, '../public');
const src = fs.readFileSync(path.join(pub, 'apple-touch-icon.png'));
const png = (size) => sharp(src).resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();

// favicon.ico（PNG埋め込み形式: 16 / 32 / 48）
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const dir = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0); e.writeUInt8(s, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(images[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += images[i].length;
  return e;
});
fs.writeFileSync(path.join(pub, 'favicon.ico'), Buffer.concat([header, ...dir, ...images]));

fs.writeFileSync(path.join(pub, 'favicon-32.png'), await png(32));
fs.writeFileSync(path.join(pub, 'icon-192.png'), await png(192));

// favicon.svg: 元画像をそのまま埋め込む（デザインを改変しない）
fs.writeFileSync(
  path.join(pub, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 180 180" width="180" height="180"><image width="180" height="180" xlink:href="data:image/png;base64,${src.toString('base64')}"/></svg>\n`
);

// OGP画像 1200x630: アイコンを中央に置いた単色背景（文字はフォント依存を避けるため入れない）
const icon = await sharp(src).resize(360, 360).png().toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#0d2b6b' } })
  .composite([{ input: icon, gravity: 'center' }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(pub, 'og-default.png'));

console.log('icons generated');
