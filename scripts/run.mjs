import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';

const root = process.cwd();
const webDir = resolve(root, 'dist/web');
const dataDir = process.env.DAO_DEN_LONG_DATA_DIR
  ? resolve(process.env.DAO_DEN_LONG_DATA_DIR)
  : join(homedir(), '.dao-den-long');
const leaderboardPath = join(dataDir, 'leaderboard.json');

const NAME_REGEX = /^[\p{L}0-9_]{3,12}$/u;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sortAndTrim(entries) {
  return [...entries]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ta = Date.parse(a.achieved_at);
      const tb = Date.parse(b.achieved_at);
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
      return String(a.achieved_at).localeCompare(String(b.achieved_at));
    })
    .slice(0, 10);
}

function readLeaderboard() {
  try {
    if (!existsSync(leaderboardPath)) return { entries: [] };
    const raw = JSON.parse(readFileSync(leaderboardPath, 'utf8'));
    if (!raw || !Array.isArray(raw.entries)) return { entries: [] };
    return { entries: sortAndTrim(raw.entries) };
  } catch {
    return { entries: [] };
  }
}

function writeLeaderboard(entries) {
  mkdirSync(dirname(leaderboardPath), { recursive: true });
  const payload = { entries: sortAndTrim(entries) };
  writeFileSync(leaderboardPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

function formatIsoWithTz(date = new Date()) {
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(offsetMin / 60)}:${pad(offsetMin % 60)}`
  );
}

// Parse CLI flags: --export-leaderboard <out.json>, --port <num>
const argv = process.argv.slice(2);
let exportPath = null;
let port = Number.parseInt(process.env.PORT ?? '4173', 10);

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--export-leaderboard') {
    exportPath = argv[++i];
    if (!exportPath) {
      process.stderr.write('Missing file path for --export-leaderboard\n');
      process.exit(2);
    }
  } else if (argv[i] === '--port') {
    port = Number.parseInt(argv[++i] ?? '4173', 10);
  }
}

if (exportPath !== null) {
  const outAbs = resolve(root, exportPath);
  mkdirSync(dirname(outAbs), { recursive: true });
  const data = readLeaderboard();
  writeFileSync(outAbs, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`Exported ${data.entries.length} leaderboard entries to ${exportPath}`);
  process.exit(0);
}

if (!existsSync(join(webDir, 'index.html'))) {
  process.stderr.write('dist/web/index.html not found. Run "npm run build" first.\n');
  process.exit(1);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
    const data = readLeaderboard();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
    return;
  }

  if (url.pathname === '/api/leaderboard' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 16384) req.destroy();
    });
    req.on('end', () => {
      try {
        const item = JSON.parse(body);
        const name = typeof item.name === 'string' ? item.name.trim().normalize('NFC') : '';
        if (!NAME_REGEX.test(name)) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Tên phải gồm 3–12 ký tự chữ/số/_ (hỗ trợ tiếng Việt).' }));
          return;
        }
        const entry = {
          name,
          score: Math.max(0, Math.floor(Number(item.score) || 0)),
          nights_won: Math.max(0, Math.min(3, Math.floor(Number(item.nights_won) || 0))),
          achieved_at:
            typeof item.achieved_at === 'string' && !Number.isNaN(Date.parse(item.achieved_at))
              ? item.achieved_at
              : formatIsoWithTz(),
          seed: Math.floor(Number(item.seed) || 0),
        };
        const current = readLeaderboard().entries;
        const updated = writeLeaderboard([...current, entry]);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(updated));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Invalid JSON' }));
      }
    });
    return;
  }

  // Static file serving from dist/web
  let reqPath = decodeURIComponent(url.pathname);
  if (reqPath === '/') reqPath = '/index.html';
  const safePath = resolve(webDir, `.${reqPath}`);
  if (!safePath.startsWith(webDir) || !existsSync(safePath) || statSync(safePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }
  const mime = MIME_TYPES[extname(safePath).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  res.end(readFileSync(safePath));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Đảo Đèn Lồng v1.0.0 running at http://localhost:${port}/`);
  console.log(`Local leaderboard file: ${leaderboardPath}`);
});
