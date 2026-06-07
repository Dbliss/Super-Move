// One-off: replace the light-gray baked background of the studio home images
// with pure white, so they match the other home-type photos (which are on white).
// Flood-fills from the image corners so only the connected background is touched,
// leaving the building's own light pixels intact. Built-in zlib only (no deps).
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function readPNG(p) {
  const b = fs.readFileSync(p);
  let pos = 8;
  const idat = [];
  let w, h, bitDepth, colorType;
  while (pos < b.length) {
    const len = b.readUInt32BE(pos);
    const type = b.toString('ascii', pos + 4, pos + 8);
    const data = b.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 2) throw new Error('expected 8-bit RGB');
  return { w, h, raw: zlib.inflateSync(Buffer.concat(idat)) };
}

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

// Unfilter scanlines -> flat RGB pixel buffer (w*h*3).
function unfilter(raw, w, h) {
  const bpp = 3, stride = w * bpp;
  const out = Buffer.alloc(stride * h);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[pos++];
    for (let x = 0; x < stride; x++) {
      const v = raw[pos++];
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const ul = (y > 0 && x >= bpp) ? out[(y - 1) * stride + x - bpp] : 0;
      let r;
      if (ft === 0) r = v;
      else if (ft === 1) r = v + a;
      else if (ft === 2) r = v + up;
      else if (ft === 3) r = v + ((a + up) >> 1);
      else if (ft === 4) r = v + paeth(a, up, ul);
      else throw new Error('bad filter ' + ft);
      out[y * stride + x] = r & 0xff;
    }
  }
  return out;
}

// Re-emit with filter type 0 (None) on every scanline.
function refilter(px, w, h) {
  const stride = w * 3;
  const out = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    out[y * (stride + 1)] = 0;
    px.copy(out, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return out;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.concat([tb, data]);
  const crc = Buffer.alloc(4); crc.writeInt32BE(crc32(crcBuf), 0);
  return Buffer.concat([len, tb, data, crc]);
}
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c;
}

function writePNG(p, w, h, px) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const idat = zlib.deflateSync(refilter(px, w, h), { level: 9 });
  fs.writeFileSync(p, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]));
}

function whiten(file) {
  const { w, h, raw } = readPNG(file);
  const px = unfilter(raw, w, h);
  // Background colour sampled from the top-left corner.
  const br = px[0], bg = px[1], bb = px[2];
  const TH = 32; // colour distance tolerance
  const near = (i) => {
    const dr = px[i] - br, dg = px[i + 1] - bg, db = px[i + 2] - bb;
    return dr * dr + dg * dg + db * db <= TH * TH;
  };
  const visited = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => { if (x >= 0 && x < w && y >= 0 && y < h) { const idx = y * w + x; if (!visited[idx] && near(idx * 3)) { visited[idx] = 1; stack.push(idx); } } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const idx = stack.pop();
    const i = idx * 3;
    px[i] = 255; px[i + 1] = 255; px[i + 2] = 255;
    const x = idx % w, y = (idx / w) | 0;
    push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
  }
  writePNG(file, w, h, px);
  console.log('whitened', path.basename(file), `${w}x${h}`, `bg was rgb(${br},${bg},${bb})`);
}

whiten('images/studio.png');
whiten('images/studio_interior.png');
