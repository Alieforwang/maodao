import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function packageRoot(file) {
  let dir = path.dirname(file);
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "node_modules"))) return dir;
    dir = path.dirname(dir);
  }
  return path.dirname(file);
}

const file = path.resolve(process.argv[2] || "dist/main/main.js");
const source = fs.readFileSync(file, "utf8");
const syntax = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
if (syntax.status !== 0) {
  console.error(syntax.stderr || syntax.stdout);
  process.exit(1);
}

const named = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)];
const failures = [];
for (const [, rawNames, specifier] of named) {
  if (specifier.startsWith("node:") || specifier === "electron") continue;
  const bindings = rawNames.split(",").map((part) => part.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
  if (bindings.length === 0) continue;
  const code = `import { ${bindings.join(", ")} } from ${JSON.stringify(specifier)};`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: packageRoot(file),
    encoding: "utf8",
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (output.includes("Named export") && output.includes("not found")) {
    failures.push(`${specifier}: ${output.trim().split("\n")[0]}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`esm imports ok: ${file}`);
