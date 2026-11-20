import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const stagingDir = resolve(root, 'tmp/release-v1.0.0/dao-den-long-v1.0.0');
const zipOut = resolve(root, 'tmp/dao-den-long-v1.0.0-web.zip');

if (!existsSync(resolve(root, 'dist/web/index.html')) || !existsSync(resolve(root, 'dist/headless/headless/cli.js'))) {
  process.stderr.write('Build outputs missing. Run "npm run build" first.\n');
  process.exit(1);
}

rmSync(resolve(root, 'tmp/release-v1.0.0'), { recursive: true, force: true });
rmSync(zipOut, { force: true });
mkdirSync(stagingDir, { recursive: true });

const copyTargets = [
  'dist',
  'scripts/run.mjs',
  'scripts/bench.mjs',
  'game.contract.json',
  'package.json',
  'README.md',
  'LICENSE',
  'CREDITS.md',
  'CHANGELOG.md',
];

for (const rel of copyTargets) {
  const src = resolve(root, rel);
  if (!existsSync(src)) continue;
  const dst = join(stagingDir, rel);
  cpSync(src, dst, { recursive: true });
}

if (process.platform === 'win32') {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `$ProgressPreference = 'SilentlyContinue'; Compress-Archive -Path "${stagingDir}\\*" -DestinationPath "${zipOut}" -Force`,
    ],
    { stdio: 'inherit' },
  );
} else {
  execFileSync('zip', ['-r', zipOut, '.'], { cwd: stagingDir, stdio: 'inherit' });
}

console.log(`Packaged Release v1.0.0 bundle -> ${zipOut}`);
