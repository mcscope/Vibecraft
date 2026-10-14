// VibeCraft relay: a tiny WebSocket server (plain Node, no dependencies) that
// puts players into rooms and forwards their messages to each other. It never
// looks inside game messages; factions travel as data and each client checks
// what it receives.
//
//   node scripts/relay.mjs [port]      (default 5190, or $RELAY_PORT)
//
// Protocol (JSON text frames):
//   client → relay  { t: 'join', room, name }
//   relay  → client { t: 'joined', you, room }               your seat id
//   relay  → room   { t: 'peers', peers: [{ id, name }] }    in join order (first = host)
//   client → relay  { t: 'msg', data, to? }                  forwarded to the room (or one peer)
//   relay  → client { t: 'msg', from, data }
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const PORT = Number(process.argv[2] ?? process.env.RELAY_PORT ?? 5190);
const MAX_MESSAGE = 64 * 1024 * 1024; // faction bundles carry their art
const rooms = new Map(); // room -> Set<client>
let nextId = 1;

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
  res.end(`VibeCraft relay: ${[...rooms.values()].reduce((n, r) => n + r.size, 0)} players in ${rooms.size} rooms\n`);
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || req.headers.upgrade?.toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  const client = { id: nextId++, name: '', room: null, socket, buf: Buffer.alloc(0), parts: [] };
  socket.on('data', (chunk) => { client.buf = Buffer.concat([client.buf, chunk]); readFrames(client); });
  socket.on('close', () => leave(client));
  socket.on('error', () => leave(client));
});

/** Decode as many complete frames as the buffer holds (client frames are masked). */
function readFrames(c) {
  for (;;) {
    const b = c.buf;
    if (b.length < 2) return;
    const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
    if (len > MAX_MESSAGE) { c.socket.destroy(); return; }
    const mask = masked ? b.subarray(off, off + 4) : null;
    if (masked) off += 4;
    if (b.length < off + len) return;
    const payload = Buffer.from(b.subarray(off, off + len));
    if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    c.buf = b.subarray(off + len);
    if (op === 0x8) { c.socket.end(frame(Buffer.alloc(0), 0x8)); leave(c); return; } // close
    if (op === 0x9) { c.socket.write(frame(payload, 0xa)); continue; } // ping → pong
    if (op === 0xa) continue;
    if (op === 0x1 || op === 0x0) {
      c.parts.push(payload);
      if (!fin) continue;
      const text = Buffer.concat(c.parts).toString('utf8');
      c.parts = [];
      try { handle(c, JSON.parse(text)); } catch { /* ignore junk */ }
    }
  }
}

/** Encode a server frame (never masked). */
function frame(payload, op = 0x1) {
  const n = payload.length;
  const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
  if (n >= 126 && n < 65536) { head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(n, 2); }
  else if (n >= 65536) { head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([head, payload]);
}
const send = (c, obj) => { if (!c.socket.destroyed) c.socket.write(frame(Buffer.from(JSON.stringify(obj), 'utf8'))); };

function peers(room) {
  const list = [...(rooms.get(room) ?? [])].map((c) => ({ id: c.id, name: c.name }));
  for (const c of rooms.get(room) ?? []) send(c, { t: 'peers', peers: list });
}

function handle(c, m) {
  if (m.t === 'join' && typeof m.room === 'string' && !c.room) {
    c.room = m.room.slice(0, 40);
    c.name = String(m.name ?? `Player ${c.id}`).slice(0, 32);
    if (!rooms.has(c.room)) rooms.set(c.room, new Set());
    rooms.get(c.room).add(c);
    send(c, { t: 'joined', you: c.id, room: c.room });
    peers(c.room);
    console.log(`${c.name} (#${c.id}) joined "${c.room}" (${rooms.get(c.room).size} there)`);
  } else if (m.t === 'msg' && c.room) {
    for (const o of rooms.get(c.room) ?? []) if (o !== c && (m.to === undefined || m.to === o.id)) send(o, { t: 'msg', from: c.id, data: m.data });
  }
}

function leave(c) {
  if (!c.room) return;
  const r = rooms.get(c.room);
  r?.delete(c);
  console.log(`${c.name} (#${c.id}) left "${c.room}"`);
  if (r && r.size === 0) rooms.delete(c.room); else peers(c.room);
  c.room = null;
}

server.listen(PORT, () => console.log(`VibeCraft relay on ws://0.0.0.0:${PORT}`));
