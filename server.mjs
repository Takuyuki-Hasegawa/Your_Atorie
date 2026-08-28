import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dump = path.join(root, 'debug-draft.json');
const port = Number(process.env.PORT) || 4180;
const publicOrigin = (process.env.PUBLIC_ORIGIN || 'https://takuyuki-hasegawa.github.io/Your_Atorie').replace(/\/$/, '');

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) return item.address;
    }
  }
  return '127.0.0.1';
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  const types = {
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.m4v': 'video/mp4',
    '.html': 'text/html; charset=utf-8'
  };
  return types[ext] || 'application/octet-stream';
}

function send(res, status, type, body) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

function isLoopback(req) {
  const ip = req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function walkCards(trip, visit) {
  for (const card of trip.cards || []) {
    visit(card);
    for (const child of card.cards || []) visit(child);
  }
}

function parseDataUrl(value) {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(value || '');
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

function extensionFor(mime, name) {
  const fromName = path.extname(name || '').toLowerCase();
  if (/^\.(jpe?g|png|gif|webp|mp4|webm|mov|m4v)$/.test(fromName)) return fromName === '.jpeg' ? '.jpg' : fromName;
  const types = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov'
  };
  return types[mime] || '.bin';
}

function isVideoMime(mime, name, mediaType) {
  return mediaType === 'video' || (mime || '').startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(name || '');
}

function writePublished(trip) {
  const requested = String(trip.id || '').trim();
  const id = /^[a-zA-Z0-9_-]+$/.test(requested) ? requested : randomUUID();
  const mediaDir = path.join(root, 'media', id);
  const tripsDir = path.join(root, 'trips');
  fs.mkdirSync(tripsDir, { recursive: true });
  fs.rmSync(mediaDir, { recursive: true, force: true });
  fs.mkdirSync(mediaDir, { recursive: true });
  let n = 0;
  walkCards(trip, card => {
    const parsed = parseDataUrl(card.mediaData);
    delete card.mediaData;
    if (!parsed) {
      card.media = '';
      return;
    }
    const ext = extensionFor(parsed.mime, card.mediaName);
    const file = `${n}${ext}`;
    n += 1;
    fs.writeFileSync(path.join(mediaDir, file), parsed.buffer);
    card.media = `./media/${id}/${file}`;
    card.mediaType = isVideoMime(parsed.mime, card.mediaName, card.mediaType) ? 'video' : 'image';
  });
  if (!n) fs.rmSync(mediaDir, { recursive: true, force: true });
  const payload = {
    id,
    author: trip.author || '',
    title: trip.title || '',
    intro: trip.intro || '',
    cards: trip.cards || []
  };
  fs.writeFileSync(path.join(tripsDir, `${id}.json`), `${JSON.stringify(payload)}\n`);
  return id;
}

function gitEnv() {
  const env = { ...process.env };
  delete env.GIT_TERMINAL_PROMPT;
  return env;
}

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    env: gitEnv(),
    stdio: 'pipe',
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
}

function gitPush() {
  try {
    git(['push', 'origin', 'HEAD']);
    return;
  } catch (first) {
    let token = '';
    try {
      token = execFileSync('gh', ['auth', 'token'], {
        cwd: root,
        env: gitEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        timeout: 15000
      }).trim();
    } catch {
      throw first;
    }
    if (!token) throw first;
    const auth = Buffer.from(`x-access-token:${token}`).toString('base64');
    execFileSync('git', [
      '-c', `http.https://github.com/.extraheader=AUTHORIZATION: Basic ${auth}`,
      'push',
      'origin',
      'HEAD'
    ], {
      cwd: root,
      env: gitEnv(),
      stdio: 'pipe',
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      timeout: 180000
    });
  }
}

function publishGit(id) {
  const files = [`trips/${id}.json`];
  const mediaDir = path.join(root, 'media', id);
  if (fs.existsSync(mediaDir) && fs.readdirSync(mediaDir).length) files.push(`media/${id}`);
  git(['add', '--', ...files]);
  const dirty = git(['status', '--porcelain', '--', ...files]).trim();
  if (!dirty) {
    console.log('publish-git', id, 'already on HEAD');
    return true;
  }
  git(['commit', '-m', `Publish card ${id}`]);
  gitPush();
  console.log('publish-git', id, 'pushed');
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 80 * 1024 * 1024) {
        req.destroy();
        reject(new Error('too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');

  if (req.method === 'OPTIONS') {
    send(res, 204, 'text/plain', '');
    return;
  }

  if (req.method === 'POST' && url.pathname === '/debug-draft') {
    try {
      fs.writeFileSync(dump, await readBody(req));
      send(res, 204, 'text/plain', '');
    } catch {
      send(res, 500, 'text/plain', 'write failed');
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/publish') {
    if (!isLoopback(req)) {
      send(res, 403, 'text/plain', 'local only');
      return;
    }
    try {
      const trip = JSON.parse((await readBody(req)).toString('utf8'));
      if (!trip || !Array.isArray(trip.cards)) throw new Error('bad trip');
      const id = writePublished(trip);
      console.log('publish', id);
      let pushed = false;
      try {
        pushed = publishGit(id);
      } catch (error) {
        const detail = [error.stderr && String(error.stderr), error.stdout && String(error.stdout), error.code]
          .filter(Boolean)
          .join('\n');
        console.log('publish-git fail', detail || String(error && error.message || 'failed'));
      }
      console.log('publish', id, pushed ? 'ok' : 'not-pushed');
      send(res, 200, 'application/json; charset=utf-8', JSON.stringify({
        id,
        url: `${publicOrigin}/?c=${id}`,
        pushed
      }));
    } catch {
      send(res, 400, 'text/plain', 'publish failed');
    }
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
