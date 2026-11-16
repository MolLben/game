import http from 'node:http';
import { WebSocketServer, type RawData } from 'ws';
import { DEFAULT_PORT } from '@kinetic/shared';
import { Matchmaker } from './matchmaker';
import { ClientSession } from './session';

const PORT = Number(process.env.PORT ?? DEFAULT_PORT);

const mm = new Matchmaker();

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: mm.stats() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, maxPayload: 4 * 1024 });

function toArrayBuffer(data: RawData): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  const b = Array.isArray(data) ? Buffer.concat(data) : data;
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

wss.on('connection', (ws) => {
  ws.binaryType = 'arraybuffer';
  const session = new ClientSession(
    ws,
    (hello) => {
      if (hello.mode === 'join') return mm.find(String(hello.code ?? '')) ?? 'Room not found or full.';
      if (hello.mode === 'create') return mm.createPrivate(hello.map);
      return mm.quickPlay();
    },
    (m) => console.log(m),
  );
  const helloTimer = setTimeout(() => {
    if (!session.player) ws.close(4001, 'hello timeout');
  }, 5000);

  ws.on('message', (data, isBinary) => {
    const buf = toArrayBuffer(data);
    if (isBinary) session.onBinary(buf);
    else session.onText(Buffer.from(buf).toString('utf8'));
  });
  ws.on('close', () => {
    clearTimeout(helloTimer);
    session.onClose();
  });
  ws.on('error', () => ws.close());
});

server.listen(PORT, () => console.log(`KINETIC server listening on :${PORT}`));
