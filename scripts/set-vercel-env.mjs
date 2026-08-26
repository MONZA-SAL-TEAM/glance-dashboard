import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function parseEnv(file) {
  const text = fs.readFileSync(file, "utf8");
  const out = {};
  let key = null;
  let buf = "";

  for (const line of text.split(/\r?\n/)) {
    if (key) {
      buf += `\n${line}`;
      if (line.trim().endsWith('"')) {
        out[key] = buf.replace(/^"|"$/g, "");
        key = null;
        buf = "";
      }
      continue;
    }

    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const k = m[1];
    let v = m[2];
    if (v.startsWith('"') && !v.endsWith('"')) {
      key = k;
      buf = v;
      continue;
    }
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[k] = v;
  }

  return out;
}

function addEnv(name, environments, value, sensitive) {
  const args = [
    "vercel",
    "env",
    "add",
    name,
    environments,
    sensitive ? "--sensitive" : "--no-sensitive",
    "--yes",
    "--force",
  ];
  console.log(`Adding ${name} (${environments})...`);
  const result = spawnSync("npx", args, {
    input: value,
    encoding: "utf8",
    shell: true,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`Failed to add ${name} for ${environments}`);
  }
}

const env = parseEnv(path.join(process.cwd(), ".env.local"));
const vars = {
  GA_PROPERTIES: env.GA_PROPERTIES,
  GOOGLE_CLIENT_EMAIL: env.GOOGLE_CLIENT_EMAIL,
  GOOGLE_PRIVATE_KEY: env.GOOGLE_PRIVATE_KEY,
};

for (const [name, value] of Object.entries(vars)) {
  if (!value) throw new Error(`Missing ${name}`);
  addEnv(name, "production,preview", value, true);
  addEnv(name, "development", value, false);
}

console.log("All env vars set");
