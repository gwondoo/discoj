// Preserve the live bind mounts and old hashed assets without restarting services.
import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, chmodSync, mkdtempSync, renameSync, rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

function copyInPlace(source, target) {
  mkdirSync(target, {recursive: true});
  for (const entry of readdirSync(source, {withFileTypes: true})) {
    const from = resolve(source, entry.name), to = resolve(target, entry.name);
    if (entry.isDirectory()) copyInPlace(from, to);
    else if (entry.isFile()) writeFileSync(to, readFileSync(from));
  }
}

export function syncLive(source, live, reload) {
  mkdirSync(live, {recursive: true});
  const dist = resolve(live, 'dist');
  mkdirSync(dist, {recursive: true});
  // Replace child directory entries so Docker Desktop refreshes renamed host paths.
  // Merge previous hashed assets to keep already-open clients working.
  for (const entry of readdirSync(resolve(source, 'dist'), {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    const target = resolve(dist, entry.name);
    const staged = mkdtempSync(resolve(dist, '.deploy-'));
    chmodSync(staged, 0o755);
    if (existsSync(target)) copyInPlace(target, staged);
    copyInPlace(resolve(source, 'dist', entry.name), staged);
    const previousDir = staged + '-previous';
    if (existsSync(target)) renameSync(target, previousDir);
    try { renameSync(staged, target); }
    catch (error) {
      if (existsSync(previousDir)) renameSync(previousDir, target);
      throw error;
    }
    if (existsSync(previousDir)) rmSync(previousDir, {recursive: true, force: true});
  }
  // Publish the entry point only after every dependency is present.
  for (const entry of readdirSync(resolve(source, 'dist'), {withFileTypes: true})) {
    if (entry.isFile()) writeFileSync(resolve(dist, entry.name), readFileSync(resolve(source, 'dist', entry.name)));
  }
  const target = resolve(live, 'nginx.conf');
  const next = readFileSync(resolve(source, 'nginx.conf'));
  const previous = existsSync(target) ? readFileSync(target) : null;
  if (previous?.equals(next)) return;
  // Write in place: replacing the inode would leave the file bind mount stale.
  writeFileSync(target, next);
  // No prior config means a new deployment; the first server start loads it.
  if (!previous) return;
  try { reload(); }
  catch (error) {
    if (previous) writeFileSync(target, previous);
    throw error;
  }
}

function docker(args) {
  const result = spawnSync('docker', args, {encoding: 'utf8'});
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || 'Docker command failed');
  return result.stdout.trim();
}
export function reloadLiveNginx() {
  // A fresh deployment has no server yet; its first start reads the synced file.
  const names = docker(['ps', '--format', '{{.Names}}']).split('\n');
  if (!names.includes('discoj-activity')) return;
  docker(['exec', 'discoj-activity', 'nginx', '-t']);
  docker(['exec', 'discoj-activity', 'nginx', '-s', 'reload']);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncLive(fileURLToPath(new URL('../', import.meta.url)),
    fileURLToPath(new URL('../../activity-test/', import.meta.url)), reloadLiveNginx);
}
