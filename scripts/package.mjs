import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const manifest = JSON.parse(await readFile('module.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const tag = process.argv[2] ?? `v${manifest.version}`;
if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw Error('Expected a release tag such as v0.1.0');
if (tag !== `v${manifest.version}` || manifest.version !== pkg.version) {
  throw Error('Release tag, module.json and package.json versions must match');
}
const base = 'https://github.com/LarsLTS/ABF_Animations/releases';
manifest.manifest = `${base}/latest/download/module.json`;
manifest.download = `${base}/download/${tag}/abf-animations.zip`;
const output = resolve('dist');
await mkdir(output, { recursive: true });
const staging = await mkdtemp(join(tmpdir(), 'abf-animations-release-'));
try {
  await cp('src', join(staging, 'src'), { recursive: true });
  await cp('README.md', join(staging, 'README.md'));
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(join(staging, 'module.json'), json);
  for (const entry of manifest.esmodules) await readFile(join(staging, entry));
  await writeFile(join(output, 'module.json'), json);
  // zip updates existing archives, so remove the generated ZIP before packaging.
  await rm(join(output, 'abf-animations.zip'), { force: true });
  const result = spawnSync(
    'zip',
    ['-q', '-r', join(output, 'abf-animations.zip'), 'module.json', 'README.md', 'src'],
    {
      cwd: staging,
      encoding: 'utf8'
    }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(result.stderr || 'ZIP packaging failed');
  console.log(`Packaged ${tag}: dist/module.json and dist/abf-animations.zip`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
