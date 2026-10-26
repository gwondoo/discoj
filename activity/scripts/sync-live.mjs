// Keep the pre-rename live bind mount current without restarting its tunnel.
import {existsSync, cpSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
// Resolve from scripts/ to the repository root.
const live = fileURLToPath(new URL('../../activity-test/', import.meta.url));
if (existsSync(live)) {
  cpSync(fileURLToPath(new URL('../dist/', import.meta.url)), live + 'dist', {recursive: true});
}
