import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dump = path.join(root, 'debug-draft.json');
const port = Number(process.env.PORT) || 4180;

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) return item.address;
    }
  }
  return '127.0.0.1';
}

function contentType(file) {
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'text/html; charset=utf-8';
}

function send(res, status, type, body) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');

  if (req.method === 'OPTIONS') {
    send(res, 204, 'text/plain', '');
    return;
  }

  if (req.method === 'POST' && url.pathname === '/debug-draft') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        fs.writeFileSync(dump, Buffer.concat(chunks));
        send(res, 204, 'text/plain', '');
      } catch {
        send(res, 500, 'text/plain', 'write failed');
      }
    });
    return;
  }

  let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(root)) {
    send(res, 403, 'text/plain', 'forbidden');
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      send(res, 404, 'text/plain', 'Not found');
      return;
    }
    send(res, 200, contentType(file), data);
  });
});

server.listen(port, '0.0.0.0', () => {
  const ip = lanAddress();
  console.log(`PC     http://127.0.0.1:${port}/`);
  console.log(`phone  http://${ip}:${port}/`);
});
