import { build as viteBuild } from "vite";
import { build } from "esbuild";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import sharp from "sharp";
await viteBuild();
await build({
  entryPoints: ["src/background/main.ts"],
  outfile: "dist/background.js",
  bundle: true,
  format: "esm",
  target: "chrome120",
  minify: true,
});
await build({
  entryPoints: ["src/content/main.ts"],
  outfile: "dist/content.js",
  bundle: true,
  format: "iife",
  target: "chrome120",
  minify: true,
});
const pkg = JSON.parse(await readFile("package.json", "utf8"));
await mkdir("dist/icons", { recursive: true });
for (const size of [16, 32, 48, 128])
  await sharp("public/icon.svg")
    .resize(size, size)
    .png()
    .toFile(`dist/icons/${size}.png`);
await writeFile(
  "dist/manifest.json",
  JSON.stringify(
    {
      manifest_version: 3,
      name: "饼友 · 烧饼社区",
      version: pkg.version,
      minimum_chrome_version: "120",
      description: pkg.description,
      permissions: ["storage", "sidePanel"],
      host_permissions: ["https://linux.sb/*"],
      background: { service_worker: "background.js", type: "module" },
      side_panel: { default_path: "index.html" },
      options_page: "index.html#settings",
      action: { default_title: "打开饼友" },
      icons: {
        16: "icons/16.png",
        32: "icons/32.png",
        48: "icons/48.png",
        128: "icons/128.png",
      },
      content_scripts: [
        {
          matches: ["https://linux.sb/*"],
          js: ["content.js"],
          run_at: "document_idle",
        },
      ],
      content_security_policy: {
        extension_pages: "script-src 'self'; object-src 'none'",
      },
    },
    null,
    2,
  ),
);
await copyFile("LICENSE", "dist/LICENSE.txt");
await copyFile("THIRD_PARTY_NOTICES.md", "dist/THIRD_PARTY_NOTICES.txt");
await copyFile("docs/隐私说明.md", "dist/PRIVACY.md");
await mkdir("dist/licenses", { recursive: true });
for (const dependency of [
  "react",
  "react-dom",
  "jotai",
  "lucide-react",
  "scheduler",
]) {
  await copyFile(
    `node_modules/${dependency}/LICENSE`,
    `dist/licenses/${dependency}.txt`,
  );
}
const content = await readFile("dist/content.js", "utf8");
if (/^\s*(import|export)\s/m.test(content))
  throw new Error("Content script is not self-contained");
console.log(`Built 饼友 ${pkg.version} -> dist/`);
