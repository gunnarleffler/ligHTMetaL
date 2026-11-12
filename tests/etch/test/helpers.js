import { deflateSync } from 'node:zlib';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}
/** Original one-pixel RGBA PNG generated without third-party assets. */
export function png(width = 1, height = 1) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc(height*(1+4*width));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    rows.set([40,120,200,128], y*(1+4*width)+1+x*4);
  }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
const identity = () => [1,0,0,1,0,0];
export function elements() {
  return [
    { id: 'stroke', type: 'stroke', transform: identity(), points: [[1,2,0.5],[3,4,0.7]], color: '#112233', width: 3, pressure: true },
    { id: 'line', type: 'line', transform: identity(), start: [0,0], end: [50,30], stroke: '#112233', strokeWidth: 2, lineCap: 'round' },
    { id: 'rect', type: 'rect', transform: identity(), x: 0, y: 0, width: 50, height: 30, fill: null, stroke: '#112233', strokeWidth: 2, lineJoin: 'round', miterLimit: 4 },
    { id: 'ellipse', type: 'ellipse', transform: identity(), cx: 25, cy: 15, rx: 25, ry: 15, fill: '#336699', stroke: null, strokeWidth: 0 },
    { id: 'path', type: 'path', transform: [1,0.2,0.3,1,20,-10], commands: [['M',0,0],['C',10,0,20,30,30,30],['L',0,30],['Z']], fill: '#336699', fillRule: 'nonzero', stroke: '#112233', strokeWidth: 2, lineCap: 'butt', lineJoin: 'miter', miterLimit: 4 },
    { id: 'image', type: 'image', transform: identity(), assetId: 'asset', x: 10, y: 10, width: 32, height: 32, alt: 'Original blue pixel' },
  ];
}
export function fixture() {
  return { format: 'lightmetal-etch', version: 1, background: null,
    layers: [{ id: 'layer', name: 'Original marks', visible: true, locked: false, offset: [10,-20], elements: elements() }],
    assets: [{ id: 'asset', mime: 'image/png', width: 1, height: 1, data: png() }] };
}
export function code(expected) { return error => error.code === expected; }
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
