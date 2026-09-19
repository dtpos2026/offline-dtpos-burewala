#!/usr/bin/env node
// ============================================================
// RELEASE PACKAGER
//
// Produces the ZIP a client is sent. It is a SOURCE package, not an
// installer, and that is deliberate: `electron-builder --win nsis` has to run
// on Windows to produce the EXE, so building it anywhere else either fails or
// produces something that has never been near the target platform.
//
// What the ZIP contains is everything needed to run, on the Windows machine:
//
//     npm install
//     npm run dist
//
// and get `DT POS Enterprise Setup <version>.exe`.
//
// What it leaves out is everything that would make the ZIP enormous and stale
// the moment it is unpacked: node_modules (reinstalled from the lockfile),
// git history, build output, and the editor and OS droppings that accumulate
// in a working tree.
// ============================================================
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = pkg.version;
const outDir = resolve(root, 'release');
const zipPath = resolve(outDir, `DT-POS-Enterprise-v${version}-source.zip`);

// Paths never worth shipping. node_modules is the big one: it is hundreds of
// megabytes, it is platform-specific, and `npm install` rebuilds it correctly
// for the machine that will actually run it.
const EXCLUDE = [
  'node_modules/*', '*/node_modules/*',
  '.git/*', '*/.git/*',
  'dist/*', 'superadmin/dist/*',
  'release/*',
  '*.tsbuildinfo',
  '.DS_Store', '*/.DS_Store',
  'Thumbs.db',
  '.env', '.env.*',
  '*.log',
];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const args = ['-r', '-q', zipPath, '.', '-x', ...EXCLUDE];
try {
  execFileSync('zip', args, { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] });
} catch (e) {
  console.error('\nPackaging failed. The `zip` command is required.\n');
  process.exit(1);
}

if (!existsSync(zipPath)) {
  console.error('\nPackaging produced no file.\n');
  process.exit(1);
}

const mb = (statSync(zipPath).size / 1_000_000).toFixed(1);
console.log(`\nDT POS Enterprise v${version}`);
console.log(`  ${zipPath}`);
console.log(`  ${mb} MB\n`);
console.log('On the Windows machine:');
console.log('  npm install');
console.log('  npm run dist      ->  dist/DT POS Enterprise Setup ' + version + '.exe\n');
