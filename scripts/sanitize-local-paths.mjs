import {
  cp,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  symlink,
  unlink,
  writeFile
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const trunk = join(root, '.trunk');
const homeDirectory = homedir();
let cleaned = 0;

async function sanitizeDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await sanitizeDirectory(path);
    else if (entry.isFile()) {
      const original = await readFile(path);
      if (original.includes(0)) continue;
      const text = original.toString('utf8');
      const sanitized = text.replaceAll(homeDirectory, '${HOME}');
      if (sanitized !== text) {
        await writeFile(path, sanitized);
        cleaned++;
      }
    }
  }
}

// Detach generated wrappers and logs before editing: their symlinks lead to a
// shared cache outside the repository. Preserve that cache and executable modes.
for (const name of ['tools', 'logs']) {
  const path = join(trunk, name);
  const stat = await lstat(path).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (!stat) continue;
  if (stat.isSymbolicLink()) {
    const staging = await mkdtemp(join(trunk, 'tmp-sanitize-'));
    try {
      const copy = join(staging, name);
      await cp(path, copy, { recursive: true, dereference: true });
      await sanitizeDirectory(copy);
      await unlink(path);
      await rename(copy, path);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  } else if (stat.isDirectory()) await sanitizeDirectory(path);
}

// Keep other cache links functional without storing an absolute home path.
async function relativizeLinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const target = await readlink(path);
      if (!target.startsWith(`${homeDirectory}/`)) continue;
      await unlink(path);
      await symlink(relative(dirname(path), target), path);
      cleaned++;
    } else if (entry.isDirectory()) await relativizeLinks(path);
  }
}
await relativizeLinks(trunk);
console.log(`Sanitized ${cleaned} local Trunk files and links.`);
