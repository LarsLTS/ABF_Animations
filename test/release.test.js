import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve('scripts/package.mjs');
const { version } = JSON.parse(await readFile('module.json', 'utf8'));
const differentVersion = `${Number(version.split('.')[0]) + 1}.0.0`;
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'abf-release-test-'));
  for (const path of ['module.json', 'package.json', 'README.md', 'src']) {
    await cp(path, join(directory, path), { recursive: true });
  }
  return directory;
}

test('release ZIP contains only installable module files and a matching manifest', async () => {
  const directory = await fixture();
  try {
    const result = spawnSync(process.execPath, [script, `v${version}`], {
      cwd: directory,
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
    const archive = join(directory, 'dist/abf-animations.zip');
    const listing = spawnSync('unzip', ['-Z1', archive], { encoding: 'utf8' });
    assert.equal(listing.status, 0, listing.stderr);
    const entries = listing.stdout.trim().split('\n');
    assert.ok(entries.includes('module.json'));
    assert.ok(entries.includes('src/main.js'));
    assert.ok(
      entries.every(
        path => path === 'module.json' || path === 'README.md' || path.startsWith('src/')
      )
    );
    const asset = JSON.parse(await readFile(join(directory, 'dist/module.json'), 'utf8'));
    const embedded = spawnSync('unzip', ['-p', archive, 'module.json'], {
      encoding: 'utf8'
    });
    assert.equal(embedded.status, 0, embedded.stderr);
    assert.deepEqual(JSON.parse(embedded.stdout), asset);
    assert.equal(asset.version, version);
    assert.equal(
      asset.manifest,
      'https://github.com/LarsLTS/ABF_Animations/releases/latest/download/module.json'
    );
    assert.equal(
      asset.download,
      `https://github.com/LarsLTS/ABF_Animations/releases/download/v${version}/abf-animations.zip`
    );
    for (const entry of asset.esmodules) assert.ok(entries.includes(entry));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('packaging rejects invalid tags and mismatched versions before generating assets', async () => {
  const directory = await fixture();
  try {
    for (const tag of ['main', `v${differentVersion}`]) {
      const result = spawnSync(process.execPath, [script, tag], {
        cwd: directory,
        encoding: 'utf8'
      });
      assert.notEqual(result.status, 0);
    }
    const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    pkg.version = differentVersion;
    await writeFile(join(directory, 'package.json'), JSON.stringify(pkg));
    const result = spawnSync(process.execPath, [script, `v${version}`], {
      cwd: directory,
      encoding: 'utf8'
    });
    assert.notEqual(result.status, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
