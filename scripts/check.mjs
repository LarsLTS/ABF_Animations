import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const manifest = JSON.parse(await readFile("module.json", "utf8"));
if (manifest.id !== "abf-animations") throw Error("Unexpected module ID");
async function check(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await check(path);
    else if (path.endsWith(".js")) {
      const result = spawnSync(process.execPath, ["--check", path], {
        encoding: "utf8",
      });
      if (result.status) throw Error(result.stderr);
    }
  }
}
for (const entry of manifest.esmodules) await readFile(entry);
await check("src");
console.log("Manifest entry points and JavaScript syntax verified.");
