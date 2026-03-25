import fs from "node:fs";

const files = fs
  .readdirSync("dist")
  .filter((name) => /^index-[^/]+\.d\.ts$/.test(name));
if (files.length !== 1) {
  throw new Error(
    `Expected exactly one index-*.d.ts in dist/, found: ${files.join(", ") || "(none)"}`,
  );
}
fs.renameSync(`dist/${files[0]}`, "dist/index.d.ts");
