// Preserve the live bind mounts and old hashed assets without restarting services.
import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
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
  copyInPlace(resolve(source, 'dist'), resolve(live, 'dist'));
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
