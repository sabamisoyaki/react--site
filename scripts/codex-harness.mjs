import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const ROOT_ENV_FILE = ".env.local";
const REQUIRED_DB_KEYS = ["DATABASE_URL"];

function parseEnvFile(filePath) {
  const env = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      const end = value.indexOf(quote, 1);
      value = end !== -1 ? value.slice(1, end) : value.slice(1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }

    env[match[1]] = value;
  }
  return env;
}

function logStep(label) {
  console.log(`\n[codex] ${label}`);
}

function runNode(args, options = {}) {
  const printable = ["node", ...args].join(" ");
  console.log(`[codex] > ${printable}`);
  execFileSync(process.execPath, args, {
    stdio: "inherit",
    windowsHide: true,
    env: options.env ?? process.env,
    cwd: options.cwd ?? process.cwd(),
  });
}

// Execute the installed JavaScript CLI directly. npm/npx shims cannot be
// launched with execFileSync on Windows without a shell.
function runCli(packageName, binName, args, options = {}) {
  const packagePath = require.resolve(`${packageName}/package.json`);
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin[binName];
  runNode([resolve(dirname(packagePath), bin), ...args], options);
}

function assertNodeVersion() {
  const [major] = process.versions.node.split(".").map(Number);
  if (major !== 24) {
    throw new Error(
      `Node.js 24.x is required by package.json, found ${process.versions.node}`,
    );
  }
}

function loadDotEnvLocal() {
  if (!existsSync(ROOT_ENV_FILE)) {
    throw new Error(
      `.env.local is required for DB validation but was not found at ${ROOT_ENV_FILE}`,
    );
  }
  return parseEnvFile(ROOT_ENV_FILE);
}

function createEnvWithDotEnvLocal() {
  const localEnv = loadDotEnvLocal();
  return { ...process.env, ...localEnv };
}

function ensureDbConfig(localEnv) {
  const missing = REQUIRED_DB_KEYS.filter((key) => !localEnv[key]);
  if (missing.length > 0) {
    throw new Error(
      `.env.local is missing required DB settings: ${missing.join(", ")}`,
    );
  }
}

function hasSshTunnelConfig(localEnv) {
  return Boolean(localEnv.DB_SSH_USER && localEnv.DB_SSH_PORT);
}

function runQuick() {
  logStep("quick: node version");
  assertNodeVersion();
  console.log(`[codex] Node ${process.versions.node}`);

  logStep("quick: prisma generate");
  runCli("prisma", "prisma", ["generate"], {
    env: existsSync(ROOT_ENV_FILE) ? createEnvWithDotEnvLocal() : process.env,
  });

  logStep("quick: next typegen");
  runCli("next", "next", ["typegen"]);

  logStep("quick: lint");
  runCli("@biomejs/biome", "biome", ["check", "."]);

  logStep("quick: tests");
  runNode(["--test", "tests/**/*.test.mjs"]);

  logStep("quick: typecheck");
  runCli("typescript", "tsc", [
    "-p",
    "tsconfig.typecheck.json",
    "--noEmit",
    "--pretty",
    "false",
  ]);
}

function runSchema() {
  const env = existsSync(ROOT_ENV_FILE)
    ? createEnvWithDotEnvLocal()
    : process.env;

  logStep("schema: prisma validate");
  runCli("prisma", "prisma", ["validate"], { env });

  logStep("schema: prisma-augment check");
  runNode(["--import", "tsx", "scripts/prisma-augment.ts", "--check"], {
    env,
  });
}

function runDb() {
  logStep("db: env check");
  const localEnv = loadDotEnvLocal();
  ensureDbConfig(localEnv);
  console.log("[codex] DATABASE_URL is present");

  if (hasSshTunnelConfig(localEnv)) {
    logStep("db: start tunnel");
    runNode(["scripts/start-tunnel.mjs"]);
  } else {
    logStep("db: start tunnel");
    console.log(
      "[codex] DB_SSH_USER/DB_SSH_PORT not set, using direct DB connection",
    );
  }

  logStep("db: prisma migrate status");
  runCli("prisma", "prisma", ["migrate", "status"], {
    env: { ...process.env, ...localEnv },
  });
}

function runFull() {
  runQuick();
  runSchema();
  runDb();

  logStep("full: build");
  runCli("next", "next", ["build"]);
}

const mode = process.argv[2];
const runners = {
  quick: runQuick,
  schema: runSchema,
  db: runDb,
  full: runFull,
};

if (!mode || !(mode in runners)) {
  // biome-ignore lint/security/noSecrets: Static CLI usage text, not a credential.
  console.error("Usage: node scripts/codex-harness.mjs <quick|schema|db|full>");
  process.exit(1);
}

try {
  runners[mode]();
  console.log(`\n[codex] ${mode} completed`);
} catch (error) {
  console.error(`\n[codex] ${mode} failed`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
