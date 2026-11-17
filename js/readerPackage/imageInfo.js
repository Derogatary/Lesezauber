// Magic-Byte- und Groessenpruefung fuer Paketbilder (PNG, JPEG, WebP) OHNE zu dekodieren.
// Zweck: ein Bild, das nur vorgibt, PNG zu sein (oder eine Pixel-Bombe ist), wird abgewiesen, bevor der Browser es
// ueberhaupt dekodiert. Liefert {mime, width, height} oder wirft Error mit code 'IMAGE_INVALID'.
export const IMAGE_LIMITS = Object.freeze({maxSide: 16384, maxPixels: 50_000_000});

const bad = detail => { const e = new Error('IMAGE_INVALID: ' + detail); e.code = 'IMAGE_INVALID'; throw e; };
const u16be = (b, i) => (b[i] << 8) | b[i + 1];
const u32be = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u24le = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const ascii = (b, i, n) => String.fromCharCode(...b.subarray(i, i + n));

function png(b) {
  if (b.length < 33 || ascii(b, 12, 4) !== 'IHDR' || u32be(b, 8) !== 13) bad('PNG-Kopf');
  return {mime: 'image/png', width: u32be(b, 16), height: u32be(b, 20)};
}
function jpeg(b) {
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) bad('JPEG-Marker');
    const marker = b[i + 1];
    if (marker === 0xff) { i += 1; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = u16be(b, i + 2);
    if (len < 2) bad('JPEG-Segment');
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 9 > b.length) bad('JPEG-Kopf');
      return {mime: 'image/jpeg', width: u16be(b, i + 7), height: u16be(b, i + 5)};
    }
    i += 2 + len;
  }
  return bad('JPEG ohne Rahmenkopf');
}
function webp(b) {
  if (b.length < 30 || ascii(b, 8, 4) !== 'WEBP') bad('WebP-Kopf');
  const kind = ascii(b, 12, 4);
  if (kind === 'VP8X') return {mime: 'image/webp', width: u24le(b, 24) + 1, height: u24le(b, 27) + 1};
  if (kind === 'VP8L') {
    if (b[20] !== 0x2f) bad('VP8L-Signatur');
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
    return {mime: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1};
  }
  if (kind === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) bad('VP8-Signatur');
    return {mime: 'image/webp', width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff};
  }
  return bad('WebP-Variante');
}

export function inspectImage(bytes, limits = IMAGE_LIMITS) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12) bad('zu kurz');
  let info;
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG' && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) info = png(bytes);
  else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) info = jpeg(bytes);
  else if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') info = webp(bytes);
  else bad('unbekanntes Format (Magic Bytes)');
  if (!(info.width > 0 && info.height > 0) || info.width > limits.maxSide || info.height > limits.maxSide ||
      info.width * info.height > limits.maxPixels) bad('Abmessungen');
  return info;
}
