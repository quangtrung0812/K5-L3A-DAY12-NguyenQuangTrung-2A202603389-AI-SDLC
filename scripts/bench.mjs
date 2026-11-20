import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { arch, release, tmpdir, type as osType } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';

const processStartMs = performance.now();
const root = process.cwd();
const webDir = resolve(root, 'dist/web');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function parseArgs(argv) {
  let seed = 42;
  let duration = 30;
  let out = 'bench.json';
  let screenshotPath = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') seed = Number.parseInt(argv[++i] ?? '', 10);
    else if (a === '--duration') duration = Number.parseFloat(argv[++i] ?? '');
    else if (a === '--out') out = argv[++i] ?? '';
    else if (a === '--screenshot') screenshotPath = argv[++i] ?? null;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!Number.isInteger(seed)) throw new Error('Invalid --seed');
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid --duration');
  if (!out) throw new Error('Missing --out');
  return { seed, duration, out, screenshotPath };
}

function findBrowserExecutable() {
  if (process.env.BENCH_BROWSER && existsSync(process.env.BENCH_BROWSER)) {
    return process.env.BENCH_BROWSER;
  }

  if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env.LOCALAPPDATA || '';
    const candidates = [
      join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
  } else if (process.platform === 'darwin') {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
  } else {
    const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'];
    for (const name of names) {
      const r = spawnSync('which', [name], { encoding: 'utf8' });
      if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
    }
  }
  return null;
}

/** Measures total RSS (MB) of the spawned browser process + children when OS allows; returns null otherwise. */
function sampleBrowserTreeRssMb(rootPid) {
  if (!rootPid) return null;
  try {
    if (process.platform === 'win32') {
      const ps = `
        $root = ${rootPid};
        $procs = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, WorkingSetSize;
        $ids = New-Object System.Collections.Generic.HashSet[int];
        [void]$ids.Add($root);
        $changed = $true;
        while ($changed) {
          $changed = $false;
          foreach ($p in $procs) {
            if ($ids.Contains([int]$p.ParentProcessId) -and -not $ids.Contains([int]$p.ProcessId)) {
              [void]$ids.Add([int]$p.ProcessId);
              $changed = $true;
            }
          }
        }
        $sum = ($procs | Where-Object { $ids.Contains([int]$_.ProcessId) } | Measure-Object -Property WorkingSetSize -Sum).Sum;
        if ($sum) { [Math]::Round($sum / 1MB, 1) } else { 0 }
      `;
      const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], {
        encoding: 'utf8',
        timeout: 2500,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const val = Number.parseFloat(out);
      return Number.isFinite(val) && val > 0 ? val : null;
    } else {
      const out = execFileSync('ps', ['-eo', 'pid=,ppid=,rss='], { encoding: 'utf8', timeout: 1500 });
      const rows = out
        .trim()
        .split('\n')
        .map((l) => l.trim().split(/\s+/).map(Number))
        .filter((r) => r.length === 3 && r.every(Number.isFinite));
      const ids = new Set([rootPid]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const [pid, ppid] of rows) {
          if (ids.has(ppid) && !ids.has(pid)) {
            ids.add(pid);
            changed = true;
          }
        }
      }
      let totalKb = 0;
      for (const [pid, , rss] of rows) {
        if (ids.has(pid)) totalKb += rss;
      }
      return totalKb > 0 ? Math.round((totalKb / 1024) * 10) / 10 : null;
    }
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(join(webDir, 'index.html'))) {
    throw new Error('dist/web/index.html not found. Run "npm run build" before benchmark.');
  }

  const browserBin = findBrowserExecutable();
  if (!browserBin) {
    throw new Error('No Chromium/Chrome/Edge browser found. Set BENCH_BROWSER env variable to a Chromium binary.');
  }

  const profileDir = mkdtempSync(join(tmpdir(), 'ddl-bench-'));
  let firstFrameElapsedMs = null;
  let peakMemMb = null;
  let browserProc = null;
  let memTimer = null;
  let warmupMemTimer = null;

  let resolveResult;
  let rejectResult;
  const resultPromise = new Promise((res, rej) => {
    resolveResult = res;
    rejectResult = rej;
  });

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/__bench_first_frame' && req.method === 'POST') {
      if (firstFrameElapsedMs === null) {
        firstFrameElapsedMs = Math.round(performance.now() - processStartMs);
        // Sample RSS cleanly inside the 3s warmup window (after first frame, well before measurement starts)
        warmupMemTimer = setTimeout(() => {
          const rss = sampleBrowserTreeRssMb(browserProc?.pid);
          if (rss !== null && (peakMemMb === null || rss > peakMemMb)) {
            peakMemMb = rss;
          }
        }, 800);
      }
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === '/__bench_screenshot' && req.method === 'POST' && args.screenshotPath) {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        try {
          const dataUrl = Buffer.concat(chunks).toString('utf8');
          const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
          const shotAbs = resolve(root, args.screenshotPath);
          mkdirSync(dirname(shotAbs), { recursive: true });
          writeFileSync(shotAbs, Buffer.from(base64, 'base64'));
          res.writeHead(204);
          res.end();
        } catch {
          res.writeHead(500);
          res.end();
        }
      });
      return;
    }

    if (url.pathname === '/__bench_result' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => {
        body += c;
      });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
          resolveResult(payload);
        } catch (err) {
          res.writeHead(400);
          res.end();
          rejectResult(err);
        }
      });
      return;
    }

    let reqPath = decodeURIComponent(url.pathname);
    if (reqPath === '/') reqPath = '/index.html';
    const safePath = resolve(webDir, `.${reqPath}`);
    if (!safePath.startsWith(webDir) || !existsSync(safePath) || statSync(safePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[extname(safePath).toLowerCase()] ?? 'application/octet-stream' });
    res.end(readFileSync(safePath));
  });

  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 4173;
  const benchUrl =
    `http://127.0.0.1:${port}/?bench=1&seed=${args.seed}&duration=${args.duration}` +
    (args.screenshotPath ? '&screenshot=1' : '');

  const browserArgs = [
    `--user-data-dir=${profileDir}`,
    '--window-size=1280,720',
    '--window-position=40,40',
    '--disable-frame-rate-limit',
    '--disable-gpu-vsync',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    `--app=${benchUrl}`,
  ];

  browserProc = spawn(browserBin, browserArgs, { stdio: 'ignore' });
  browserProc.on('error', (err) => rejectResult(err));

  if (process.platform !== 'win32') {
    memTimer = setInterval(() => {
      const rss = sampleBrowserTreeRssMb(browserProc?.pid);
      if (rss !== null && (peakMemMb === null || rss > peakMemMb)) {
        peakMemMb = rss;
      }
    }, 5000);
  }

  const timeoutMs = (args.duration + 35) * 1000;
  const timeoutTimer = setTimeout(() => {
    rejectResult(new Error(`Benchmark timed out after ${timeoutMs / 1000}s`));
  }, timeoutMs);

  try {
    const clientMetrics = await resultPromise;
    clearTimeout(timeoutTimer);
    if (warmupMemTimer) clearTimeout(warmupMemTimer);
    if (memTimer) clearInterval(memTimer);
    const finalRss = sampleBrowserTreeRssMb(browserProc?.pid);
    if (finalRss !== null && (peakMemMb === null || finalRss > peakMemMb)) {
      peakMemMb = finalRss;
    }

    const report = {
      contract_version: '1.3',
      avg_fps: clientMetrics.avg_fps,
      p1_low_fps: clientMetrics.p1_low_fps,
      frame_ms_p95: clientMetrics.frame_ms_p95,
      frames: clientMetrics.frames,
      load_ms: firstFrameElapsedMs ?? clientMetrics.load_ms ?? 0,
      peak_mem_mb: peakMemMb,
      vsync_off: true,
      renderer: clientMetrics.renderer || 'Three.js 0.174.0 (WebGL2)',
      os: `${osType()} ${release()} (${arch()})`,
    };

    const outAbs = resolve(root, args.out);
    mkdirSync(dirname(outAbs), { recursive: true });
    writeFileSync(outAbs, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    clearTimeout(timeoutTimer);
    if (warmupMemTimer) clearTimeout(warmupMemTimer);
    if (memTimer) clearInterval(memTimer);
    try {
      if (browserProc && !browserProc.killed) {
        if (process.platform === 'win32') {
          spawnSync('taskkill', ['/PID', String(browserProc.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          browserProc.kill('SIGTERM');
        }
      }
    } catch {
      // ignore cleanup errors
    }
    server.close();
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // ignore temp dir cleanup errors
    }
  }
}

main().catch((err) => {
  process.stderr.write(`Benchmark error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
