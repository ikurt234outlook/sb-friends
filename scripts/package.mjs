import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { zipSync } from "fflate";
const files = {};
async function collect(dir, prefix = "") {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const name = prefix + item.name;
    if (item.isDirectory()) await collect(join(dir, item.name), name + "/");
    else files[name] = new Uint8Array(await readFile(join(dir, item.name)));
  }
}
await collect("dist");
const { version } = JSON.parse(await readFile("package.json", "utf8"));
await mkdir("packages", { recursive: true });
const path = `packages/sb-friends-${version}-chrome-edge.zip`;
await writeFile(path, zipSync(files, { level: 6 }));
console.log(path);
