// scripts/prisma-augment.ts
// 宣言的 @@partialIndex / @@partialUnique と /// @raw.sql を解析し、
// 生成SQLを「過去生成分との差分のみ」最新 migration.sql に追記（または置換）する。
// - 検証: `--check` は未生成 SQL があれば exit 1。`DRY_RUN=1` は表示のみ。
// - 履歴重複排除: 過去の GENERATED_(EXTENSIONS|AUGMENT) ブロックから既出SQLを収集
// - 同一 migration 内の DROP/ADD 衝突を自動回避
//
// biome-ignore-all lint/suspicious/noConsole: cli script
// biome-ignore-all lint/security/noSecrets: There is no confidential data.

import crypto from "node:crypto";
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import type { DMMF } from "@prisma/generator-helper";
import { getDMMF } from "@prisma/internals";

const CHECK = process.argv.includes("--check");
const DRY_RUN = CHECK || process.env.DRY_RUN === "1";
const DEBUG = process.env.DEBUG_AUGMENT === "1";

const SCHEMA = path.resolve("prisma/schema.prisma");
const MIGRATIONS_DIR = path.resolve("prisma/migrations");

const DEFAULT_SCHEMA = resolveDefaultSchema();
const ORDER = ["partialIndex", "partialUnique", "raw"] as const; // DROP はあとで dropStmts として allNews に足されるため不記載

const EXT_MARK = "GENERATED_EXTENSIONS";
const REST_MARK = "GENERATED_AUGMENT";
const GENERATED_BLOCK_RES = [
  {
    kind: "extensions" as const,
    re: /-- GENERATED_EXTENSIONS_BEGIN [a-f0-9]{12}\b([\s\S]*?)-- GENERATED_EXTENSIONS_END [a-f0-9]{12}\b/gm,
  },
  {
    kind: "augment" as const,
    re: /-- GENERATED_AUGMENT_BEGIN [a-f0-9]{12}\b([\s\S]*?)-- GENERATED_AUGMENT_END [a-f0-9]{12}\b/gm,
  },
] as const;

const CREATE_INDEX_RE =
  /^\s*CREATE\s+(UNIQUE\s+)?INDEX\s+(IF\s+NOT\s+EXISTS\s+)?("?([\w]+)"?)/i;
const DROP_INDEX_RE = /^\s*DROP\s+INDEX\s+(IF\s+EXISTS\s+)?("?([\w]+)"?)/i;

type ExtractedKind = (typeof ORDER)[number]; // "partialIndex" | "partialUnique" | "raw"
type BlockKind = ExtractedKind | "drop";

type GeneratedBlockKind = "extensions" | "augment";

interface HistoricalStmtContext {
  stmt: string;
  migrationDir: string;
  blockKind: GeneratedBlockKind;
}

interface PartialIndexOptions {
  name?: string;
  where?: string;
  schema?: string;
  unique?: boolean;
}

interface SqlBlock {
  kind: BlockKind;
  stmt: string;
  hash: string;
}

interface ExtractedBlock {
  kind: ExtractedKind;
  sql: string;
}

interface ModelInfo {
  name: string;
  table: string;
  fields: Record<string, string>;
}

type ModelMap = Record<string, ModelInfo>;

// ========== 共通ユーティリティ ==========

// DATABASE_URL の searchParams(schema) を優先し、無ければ public。
// Prisma のデフォルト schema と Postgres の慣習に合わせている。
// （複数 schema を使うプロジェクトで書き換える可能性あり）
function resolveDefaultSchema(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (DEBUG) console.log("[DEBUG] DATABASE_URL not set → schema=public");
    return "public";
  }

  try {
    const u = new URL(url);
    const schema = u.searchParams.get("schema");
    if (schema && schema.trim().length > 0) {
      if (DEBUG)
        console.log(`[DEBUG] schema found in DATABASE_URL → ${schema}`);
      return schema;
    }
    if (DEBUG)
      console.log("[DEBUG] no ?schema= param in DATABASE_URL → schema=public");
    return "public";
  } catch {
    if (DEBUG)
      console.log(
        "[DEBUG] DATABASE_URL is not a valid URL → fallback schema=public",
      );
    return "public";
  }
}

function makeBundle(
  mark: string,
  hash: string,
  body: string,
  label: string,
): string {
  return (
    `\n-- ${mark}_BEGIN ${hash}\n` +
    `-- 以下は schema.prisma の注釈から自動生成されています (${label})\n` +
    body +
    `\n-- ${mark}_END ${hash}\n`
  );
}

function readSchema(): string {
  return fs.readFileSync(SCHEMA, "utf8");
}

function safeIdent(name?: string | null): string {
  const out = String(name || "")
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .toLowerCase()
    .replace(/^_+/, "")
    .slice(0, 63);

  if (!out) {
    throw new Error(
      `Index name "${name}" is invalid: results in empty identifier`,
    );
  }
  return out;
}

function splitTopLevel(ss: string | null | undefined): string[] {
  const s = ss ?? "";
  const out: string[] = [];
  let cur = "";
  let q: string | null = null;
  for (let i = 0; i < (s || "").length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === q && s[i - 1] !== "\\") q = null;
      cur += ch;
    } else {
      if (ch === '"' || ch === "'") {
        q = ch;
        cur += ch;
      } else if (ch === ",") {
        out.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseOptions(s: string | null | undefined): PartialIndexOptions {
  const txt = s ?? "";
  const opts: Record<string, unknown> = {};

  for (const part of splitTopLevel(txt)) {
    const m = part.match(/^\s*(\w+)\s*[:=]\s*(.+)\s*$/);
    if (!m) continue;

    const key = m[1];
    let val = m[2].trim();

    const q = val.match(/^(['"])(.*)\1$/);
    if (q) val = q[2];

    if (val === "true") opts[key] = true;
    else if (val === "false") opts[key] = false;
    else opts[key] = val;
  }
  return opts as PartialIndexOptions;
}

function normalizeTerminator(sql: string): string {
  const t = String(sql || "").trim();
  if (/DO\s+\$\$[\s\S]*\$\$\s*;?\s*$/i.test(t))
    return t.replace(/\s*;?\s*$/, ";");
  return t.replace(/;?\s*$/, ";");
}

function normalizeForDedup(sql: string): string {
  return String(sql || "")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .replace(/\s*;\s*$/, ";")
    .trim();
}

// DO $$ ... $$; を 1 ステートメントとして扱う簡易パーサ。
// セミコロン区切りの通常 SQL と混在するため独自処理している。
// （多段 $$tag$$ など複雑な PL/pgSQL は扱わない前提）
function splitStatements(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inDollar = false;
  let i = 0;
  const s = String(text || "");
  while (i < s.length) {
    if (!inDollar) {
      const head = s.slice(i).match(/^DO\s+\$\$/i);
      if (head) {
        buf += head[0];
        i += head[0].length;
        inDollar = true;
        continue;
      }
      const ch = s[i];
      if (ch === ";") {
        out.push(`${buf};`.trim());
        buf = "";
        i++;
        continue;
      }
      buf += ch;
      i++;
    } else {
      const tail = s.slice(i).match(/^\$\$\s*;/);
      if (tail) {
        buf += tail[0];
        out.push(buf.trim());
        buf = "";
        i += tail[0].length;
        inDollar = false;
        continue;
      }
      buf += s[i];
      i++;
    }
  }
  if (buf.trim()) out.push(buf.trim().replace(/;?$/, ";"));
  return out;
}

// 各 migration.sql の中から「GENERATED_EXTENSIONS / GENERATED_AUGMENT」の
// ブロック部分だけを抽出し、そこに含まれる SQL を callback に渡す。
// 手書きの SQL（スキーマ変更）は対象外。
function forEachHistoricalStatement(
  callback: (ctx: HistoricalStmtContext) => void,
): void {
  if (!fs.existsSync(MIGRATIONS_DIR)) return;

  const dirs = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort(); // 時系列順

  for (const dirName of dirs) {
    const migrationPath = path.join(MIGRATIONS_DIR, dirName, "migration.sql");
    if (!fs.existsSync(migrationPath)) continue;

    const txt = fs.readFileSync(migrationPath, "utf8");

    for (const { kind, re } of GENERATED_BLOCK_RES) {
      // RegExp は lastIndex を持つので毎回クローンして使う
      const regex = new RegExp(re.source, re.flags);
      let m: RegExpExecArray | null = regex.exec(txt);
      while (m !== null) {
        const body = m[1] ?? "";
        const stmts = splitStatements(body).filter(Boolean);

        for (const raw of stmts) {
          const stmt = normalizeTerminator(raw).trim();
          if (!stmt) continue;

          callback({
            stmt,
            migrationDir: dirName,
            blockKind: kind,
          });
        }
        m = regex.exec(txt);
      }
    }
  }
}

// ========== Prisma schema → 物理名マップ ==========
async function buildModelMap(schemaText: string): Promise<ModelMap> {
  // Prisma の DMMF を取得
  const dmmf: DMMF.Document = await getDMMF({ datamodel: schemaText });

  const models: ModelMap = {};

  for (const m of dmmf.datamodel.models) {
    // @@map があれば dbName に入る。なければモデル名＝テーブル名
    const table = m.dbName ?? m.name;

    const fields: Record<string, string> = {};

    for (const f of m.fields) {
      // @map があれば dbName に入る（Prisma 4 系〜）
      // なければフィールド名そのまま
      const col = f.dbName ?? f.name;
      fields[f.name] = col;
    }

    models[m.name] = {
      name: m.name,
      table,
      fields,
    };
  }

  return models;
}

function loadHistoricalKeys(): Set<string> {
  const keys = new Set<string>();

  forEachHistoricalStatement(({ stmt }) => {
    keys.add(hashForStatement(stmt));
  });

  return keys;
}

// 過去に生成された CREATE INDEX のうち、
// まだ DROP されていない “生きている” インデックスだけのハッシュ集合。
// → 新しい schema に無ければ DROP を生成するために使う。
function loadHistoricalActiveCreateHashes(): Set<string> {
  // 「現在時点で生きている CREATE INDEX / UNIQUE INDEX」のハッシュ集合
  const activeByIndex = new Map<string, string>();

  forEachHistoricalStatement(({ stmt }) => {
    const stripped = stmt.replace(/--.*$/gm, "").trim();
    if (!stripped) return;

    // CREATE INDEX / CREATE UNIQUE INDEX
    if (/^\s*CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(stripped)) {
      const h = hashForStatement(stmt);
      const mm = stripped.match(CREATE_INDEX_RE);
      if (!mm) return;
      const indexName = mm[3] || `"${mm[4]}"`;
      activeByIndex.set(indexName, h);
      return;
    }

    // DROP INDEX IF EXISTS indexName
    const dropMatch = stripped.match(DROP_INDEX_RE);
    if (dropMatch) {
      const indexName = dropMatch[2] || `"${dropMatch[3]}"`;
      activeByIndex.delete(indexName);
    }
  });

  const activeHashes = new Set<string>();
  for (const h of activeByIndex.values()) {
    activeHashes.add(h);
  }
  return activeHashes;
}

function loadHistoricalCreates(): Map<
  string,
  { stmt: string; indexName: string }
> {
  const creates = new Map<string, { stmt: string; indexName: string }>();

  forEachHistoricalStatement(({ stmt, migrationDir }) => {
    const stripped = stmt.replace(/--.*$/gm, "").trim();
    if (!stripped) return;

    if (!/^\s*CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(stripped)) return;

    const h = hashForStatement(stmt);
    const mm = stripped.match(CREATE_INDEX_RE);
    if (!mm) return;

    const indexName = mm[3] || `"${mm[4]}"`;
    creates.set(h, { stmt, indexName });

    if (DEBUG) {
      console.log("[DEBUG] hist CREATE:", {
        hash: h,
        indexName,
        stmt,
        migration: migrationDir,
      });
    }
  });

  if (DEBUG) {
    console.log("[DEBUG] loadHistoricalCreates: total =", creates.size);
  }

  return creates;
}

function loadHistoricalRawStatements(): Map<string, string> {
  // GENERATED_* ブロックのうち -- kind: raw のものだけを @raw.sql 由来として拾う
  const raws = new Map<string, string>();

  forEachHistoricalStatement(({ stmt }) => {
    const stripped = stmt.replace(/--.*$/gm, "").trim();
    if (!stripped) return;

    const kindMatch = stmt.match(/^\s*--\s*kind:\s*(\w+)/i);
    const kind = kindMatch ? kindMatch[1].toLowerCase() : null;
    if (kind !== "raw") return;

    const h = hashForStatement(stmt);
    if (!raws.has(h)) {
      raws.set(h, stmt);
    }
  });

  if (DEBUG) {
    console.log(
      "[DEBUG] loadHistoricalRawStatements(kind=raw): total =",
      raws.size,
    );
  }

  return raws;
}

// ========== 追加のヘルパ ==========
function pickLatestMigrationDir(): string {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(
      "prisma/migrations がありません。先に `npx prisma migrate dev --create-only` を実行してください。",
    );
  }
  const dirs = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  if (!dirs.length)
    throw new Error(
      "マイグレーションが存在しません。先に --create-only で作ってください。",
    );

  const stamp = (s: string) => {
    const m = s.match(/^(\d+)_/);
    return m ? Number(m[1]) : NaN;
  };
  let latest: string | null = null,
    best = -1;
  for (const d of dirs) {
    const st = stamp(d);
    if (!Number.isNaN(st) && st > best) {
      best = st;
      latest = d;
    }
  }
  if (!latest) {
    const sorted = dirs
      .map((d) => {
        const p = path.join(MIGRATIONS_DIR, d, "migration.sql");
        const stat = fs.existsSync(p)
          ? fs.statSync(p)
          : fs.statSync(path.join(MIGRATIONS_DIR, d));
        return { d, t: stat.mtimeMs };
      })
      .sort((a, b) => a.t - b.t);
    latest = sorted[sorted.length - 1].d;
  }
  return path.join(MIGRATIONS_DIR, latest);
}

function writeFileAtomic(filePath: string, content: string): void {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, filePath);
}

// EXTENSIONS ブロックは migration.sql の先頭に必ず置く。
// すでに存在すれば置き換え、無ければ prepend。
// （CREATE EXTENSION は migration の最初に来るべき）
function writeBlockAtTop(
  filePath: string,
  block: string,
  dryRun: boolean,
): string {
  const txt = fs.readFileSync(filePath, "utf8");
  const beginReTop = new RegExp(
    `^-- ${EXT_MARK}_BEGIN [a-f0-9]{12}[\\s\\S]*?-- ${EXT_MARK}_END [a-f0-9]{12}\\s*\\n?`,
    "m",
  );

  let next: string;
  if (beginReTop.test(txt)) {
    next = txt.replace(beginReTop, `${block}\n`);
  } else {
    next = `${block}\n${txt}`;
  }

  if (dryRun) {
    console.log("[DRY-RUN] would write EXTENSIONS block at file head:");
    console.log(`  ${filePath}`);
    console.log(block.trimEnd());
    return txt;
  } else {
    writeFileAtomic(filePath, next);
    return next;
  }
}

function isCreateExtension(stmt: string): boolean {
  return /^\s*CREATE\s+EXTENSION\b/i.test(stmt);
}

// SQL の内容ベースでハッシュ化し、変更検知と履歴デデュープに使う。
// 12桁で十分な一意性がある（sha256 の先頭）ので軽量にしている。
function hashForBundle(body: string): string {
  return crypto
    .createHash("sha256")
    .update(normalizeForDedup(body))
    .digest("hex")
    .slice(0, 12);
}

function hashForStatement(sql: string): string {
  return crypto
    .createHash("sha256")
    .update(normalizeForDedup(sql)) // コメント除去・空白正規化・末尾;統一
    .digest("hex")
    .slice(0, 12); // 好みで桁数変更可（12桁で十分衝突耐性あり）
}

// ========== 同一 migration 内の DROP/ADD 衝突回避 ==========
// この migration.sql 内に既にある `ALTER TABLE ... DROP COLUMN ...` と
// これから追加しようとしている `ALTER TABLE ... ADD COLUMN ...` が
// 同じ (table, column) の組み合わせだった場合、その ADD をスキップする。

function filterConflictsWithFile(
  stmts: SqlBlock[],
  migrationSql: string,
): SqlBlock[] {
  const drops = new Set<string>();
  const dropRe = /ALTER\s+TABLE\s+"?([\w.]+)"?\s+DROP\s+COLUMN\s+"?([\w]+)"?/gi;
  let m: RegExpExecArray | null;
  while (true) {
    m = dropRe.exec(migrationSql);
    if (m === null) break;
    drops.add(`${m[1]}::${m[2]}`.toLowerCase());
  }

  return stmts.filter((x) => {
    const add = x.stmt.match(
      /ALTER\s+TABLE\s+"?([\w.]+)"?\s+ADD\s+COLUMN\s+"?([\w]+)"/i,
    );
    if (add) {
      const key = `${add[1]}::${add[2]}`.toLowerCase();
      if (drops.has(key)) {
        console.warn(
          `WARN: Skipped ADD COLUMN that conflicts with DROP COLUMN in this migration: ${key}`,
        );
        return false;
      }
    }
    return true;
  });
}

// ========== 抽出: @@partialIndex / @@partialUnique / @raw.sql ==========
function extractDeclarativePartialIndexes(
  schemaText: string,
  modelMap: ModelMap,
): ExtractedBlock[] {
  const lines = schemaText.split(/\r?\n/);
  const blocks: ExtractedBlock[] = [];
  let currentModel: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const mStart = line.match(/^\s*model\s+(\w+)\s*\{/);
    if (mStart) {
      currentModel = mStart[1];
      continue;
    }
    if (/^\s*\}/.test(line)) {
      currentModel = null;
      continue;
    }

    const m = line.match(
      /^\s*\/\/\/\s*@@partialIndex\s*\(\s*\[([^\]]+)\]\s*(?:,([^)]*))?\)/,
    );
    if (!m || !currentModel) continue;

    const fieldList = m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const optionsRaw = (m[2] || "").trim();

    const info = modelMap[currentModel] || { table: currentModel, fields: {} };
    const table = info.table || currentModel;

    const cols = fieldList.map((f) => info.fields?.[f] || f);

    const opts = parseOptions(optionsRaw); // name / where / unique / schema
    const name = safeIdent(opts.name || `${table}_${cols.join("_")}_idx`);
    const schema = opts.schema || DEFAULT_SCHEMA;

    const hasDeleted = Object.values(info.fields || {}).includes("deleted_at");
    const where =
      opts.where !== undefined
        ? String(opts.where)
        : hasDeleted
          ? "deleted_at IS NULL"
          : null;

    const colList = cols.map((c) => `"${c}"`).join(",");
    const sql = `CREATE INDEX ${name}
  ON "${schema}"."${table}"(${colList})${where ? `\n  WHERE ${where}` : ""};`;

    blocks.push({ kind: "partialIndex", sql });
  }
  return blocks;
}

function extractDeclarativePartialUniques(
  schemaText: string,
  modelMap: ModelMap,
): ExtractedBlock[] {
  const lines = schemaText.split(/\r?\n/);
  const blocks: ExtractedBlock[] = [];
  let currentModel: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const mStart = line.match(/^\s*model\s+(\w+)\s*\{/);
    if (mStart) {
      currentModel = mStart[1];
      continue;
    }
    if (/^\s*\}/.test(line)) {
      currentModel = null;
      continue;
    }

    const m = line.match(
      /^\s*\/\/\/\s*@@partialUnique\s*\(\s*\[([^\]]+)\]\s*(?:,([^)]*))?\)/,
    );
    if (!m || !currentModel) continue;

    const fieldList = m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const optionsRaw = (m[2] || "").trim();

    const info = modelMap[currentModel] || { table: currentModel, fields: {} };
    const table = info.table || currentModel;

    const cols = fieldList.map((f) => info.fields?.[f] || f);
    const opts = parseOptions(optionsRaw);
    const name = safeIdent(
      opts.name || `${table}_${cols.join("_")}_unique_active`,
    );
    const schema = opts.schema || DEFAULT_SCHEMA;

    const hasDeleted = Object.values(info.fields || {}).includes("deleted_at");
    const where =
      opts.where !== undefined
        ? String(opts.where)
        : hasDeleted
          ? "deleted_at IS NULL"
          : null;

    const colList = cols.map((c) => `"${c}"`).join(",");
    const sql = `CREATE UNIQUE INDEX ${name}
  ON "${schema}"."${table}"(${colList})${where ? `\n  WHERE ${where}` : ""};`;

    blocks.push({ kind: "partialUnique", sql });
  }
  return blocks;
}

function extractRawSqlBlocks(schemaText: string): ExtractedBlock[] {
  const lines = schemaText.split(/\r?\n/);
  const blocks: ExtractedBlock[] = [];
  const headRe = /^\s*\/\/\/\s*@raw\.sql\s*(.*)$/;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(headRe);
    if (!m) continue;

    let sql = m[1] || "";
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j];
      const mm = next.match(/^\s*\/\/\/\s(.*)$/);
      if (!mm) break;
      if (mm[1].trim().startsWith("@")) break;
      sql += `\n${mm[1]}`;
      j++;
    }
    const s = normalizeTerminator(sql);
    if (s.trim().length) blocks.push({ kind: "raw", sql: s });
    i = j - 1;
  }
  return blocks;
}

// ========== メイン ==========
async function main(): Promise<void> {
  const schema = readSchema();
  const modelMap = await buildModelMap(schema);

  // 1) 抽出
  const blocks = [
    ...extractDeclarativePartialIndexes(schema, modelMap),
    ...extractDeclarativePartialUniques(schema, modelMap),
    ...extractRawSqlBlocks(schema),
  ];

  // 2) kind順に展開
  const expanded: SqlBlock[] = [];
  for (const k of ORDER) {
    for (const b of blocks.filter((x) => x.kind === k)) {
      const stmts = splitStatements(b.sql);
      for (const st of stmts) {
        if (!st) continue;
        const stmt = normalizeTerminator(st).trim();
        expanded.push({ kind: k, stmt, hash: hashForStatement(stmt) });
      }
    }
  }
  // Even without current annotations, history may require DROP INDEX statements.
  if (expanded.length === 0 && !fs.existsSync(MIGRATIONS_DIR)) return;

  // 3) 最新 migration.sql 読み込み & 同一ファイル内衝突回避
  const latestDir = pickLatestMigrationDir();
  const migrationPath = path.join(latestDir, "migration.sql");
  const migrationSqlNow = fs.readFileSync(migrationPath, "utf8");
  const expandedNoConflicts = filterConflictsWithFile(
    expanded,
    migrationSqlNow,
  );

  // 4) 同一ラン内デデュープ（ハッシュ方式）
  const seenThisRun = new Set<string>();
  const dedupedThisRun: SqlBlock[] = [];
  for (const x of expandedNoConflicts) {
    if (seenThisRun.has(x.hash)) continue;
    seenThisRun.add(x.hash);
    // ハッシュを持たせておくと後段も楽
    dedupedThisRun.push(x);
  }

  if (DEBUG) {
    console.log("[DEBUG] dedupedThisRun count =", dedupedThisRun.length);
    for (const x of dedupedThisRun) {
      console.log("[DEBUG] deduped stmt:", {
        kind: x.kind,
        hash: x.hash,
        stmt: x.stmt,
      });
    }
  }

  // 5) 履歴ハッシュを収集
  const histKeys = loadHistoricalKeys();
  const histActiveCreateHashes = loadHistoricalActiveCreateHashes();

  if (DEBUG) {
    console.log("[DEBUG] histKeys count =", histKeys.size);
  }

  // 5.1) これまで GENERATED_* ブロックで生成した CREATE INDEX 群を取得
  const histCreates = loadHistoricalCreates();

  // 5.2) 今回 schema から生成された CREATE INDEX 群のハッシュ集合
  const currentCreateHashes = new Set(
    dedupedThisRun
      .filter((x) => /^\s*CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(x.stmt))
      .map((x) => x.hash),
  );

  if (DEBUG) {
    console.log(
      "[DEBUG] currentCreateHashes count =",
      currentCreateHashes.size,
    );
    console.log(
      "[DEBUG] currentCreateHashes =",
      Array.from(currentCreateHashes),
    );
  }

  // 5.2.1) 今回 schema から生成された raw (@raw.sql) 群のハッシュ集合
  const currentRawHashes = new Set(
    dedupedThisRun.filter((x) => x.kind === "raw").map((x) => x.hash),
  );

  // 5.2.2) 過去の「@raw.sql 由来っぽい SQL」を取得
  const histRawStmts = loadHistoricalRawStatements();

  // 5.2.3) 過去にはあったが、今回 schema からは出てこない raw SQL を警告
  // 過去に生成した raw.sql が schema から消えていても自動 DROP はしない。
  // （raw SQL は idempotency が保証できないため。手動対応を想定）
  const vanishedRaw: { hash: string; stmt: string }[] = [];
  for (const [h, stmt] of histRawStmts) {
    if (!currentRawHashes.has(h)) {
      vanishedRaw.push({ hash: h, stmt });
    }
  }

  if (vanishedRaw.length > 0) {
    const header = DRY_RUN
      ? "[DRY-RUN] WARN: Some previously generated @raw.sql statements are no longer emitted from schema.prisma."
      : "WARN: Some previously generated @raw.sql statements are no longer emitted from schema.prisma.";
    console.warn(header);
    for (const { stmt } of vanishedRaw.slice(0, 10)) {
      // 長すぎる場合は少しだけ切って出す（お好みで）
      const oneLine = stmt.replace(/\s+/g, " ").slice(0, 200);
      console.warn(`  - ${oneLine}${oneLine.length === 200 ? " ..." : ""}`);
    }
    if (vanishedRaw.length > 10) {
      console.warn(`  (and ${vanishedRaw.length - 10} more ...)`);
    }
    console.warn(
      "  自動DROPは行われないので、必要であれば手動で逆操作のSQLを追加してください。",
    );
  }

  // 5.3) 「以前はあったが、今回 schema からは出てこない CREATE INDEX」→ DROP を作る
  const dropStmts: SqlBlock[] = [];
  for (const [h, rec] of histCreates) {
    // 「今の履歴上、まだ生きているインデックス」だけ DROP 対象にする
    if (!histActiveCreateHashes.has(h)) continue;
    // まだ schema に存在するものは DROP 対象ではない
    if (currentCreateHashes.has(h)) continue;

    const dropSql = `DROP INDEX IF EXISTS ${rec.indexName};`;
    const dropHash = hashForStatement(dropSql);

    // 同一ラン内だけ重複排除すれば十分（履歴の DROP は無視する）
    if (seenThisRun.has(dropHash)) continue;

    dropStmts.push({
      kind: "drop",
      stmt: dropSql,
      hash: dropHash,
    });
    seenThisRun.add(dropHash);

    if (DEBUG) {
      console.log("[DEBUG] generated DROP:", {
        hash: dropHash,
        stmt: dropSql,
        fromHash: h,
        indexName: rec.indexName,
      });
    }
  }
  if (DEBUG) {
    console.log("[DEBUG] dropStmts count =", dropStmts.length);
  }

  // 5.4) 「今回 CREATE すべき新規」 + 「今回 DROP すべき分」をまとめる
  const news = dedupedThisRun.filter((x) => {
    const isCreateIndex = /^\s*CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(x.stmt);
    if (isCreateIndex) {
      // CREATE INDEX / UNIQUE INDEX は「まだ生きているもの」とだけ比較
      return !histActiveCreateHashes.has(x.hash);
    }
    // それ以外（RAW, EXTENSION など）は従来どおり全履歴と比較
    return !histKeys.has(x.hash);
  });
  const allNews = [...dropStmts, ...news];

  if (DEBUG) {
    console.log("[DEBUG] news count =", news.length);
    console.log("[DEBUG] allNews count =", allNews.length);
  }

  // 6) EXT と REST に分割
  // EXT: CREATE EXTENSION など migration の最初に置きたいもの
  // REST: インデックスや raw SQL などその他の生成物
  // この2ブロックに分けることで、migration.sql の見通しをよくする
  const newsExt = allNews.filter((x) => isCreateExtension(x.stmt));
  const newsRest = allNews.filter((x) => !isCreateExtension(x.stmt));

  if (DEBUG) {
    console.log("[DEBUG] newsExt count =", newsExt.length);
    console.log("[DEBUG] newsRest count =", newsRest.length);
  }

  const bundleBodyExt = newsExt
    .map((x) => `-- kind: ${x.kind}\n${x.stmt}`)
    .join("\n\n");
  const bundleBodyRest = newsRest
    .map((x) => `-- kind: ${x.kind}\n${x.stmt}`)
    .join("\n\n");

  if (!bundleBodyExt && !bundleBodyRest) {
    const msg =
      "No new SQL statements to emit (after EXT/REST split). Skipped.";
    if (DRY_RUN) console.log(`[DRY-RUN] ${msg}`);
    else console.log(msg);
    return;
  }

  if (CHECK) {
    console.error(
      "prisma-augment: ungenerated SQL remains. Create and verify a new, unapplied migration before running augment without --check.",
    );
    process.exitCode = 1;
  }

  // 7) バンドル生成
  let extHash: string | undefined;
  let restHash: string | undefined;

  let extBundle = "";
  if (bundleBodyExt) {
    extHash = hashForBundle(bundleBodyExt);
    extBundle = makeBundle(EXT_MARK, extHash, bundleBodyExt, "extensions");
  }

  let restBundle = "";
  if (bundleBodyRest) {
    restHash = hashForBundle(bundleBodyRest);
    restBundle = makeBundle(
      REST_MARK,
      restHash,
      bundleBodyRest,
      "partialIndex/partialUnique/raw/drop",
    );
  }

  // 8) 書き込み：EXTは先頭、RESTは末尾（既存なら置換）
  let migrationSql = migrationSqlNow;

  if (extBundle) {
    migrationSql = writeBlockAtTop(migrationPath, extBundle, DRY_RUN);
    if (!DRY_RUN) migrationSql = fs.readFileSync(migrationPath, "utf8");
  }

  if (restBundle) {
    const restRe = new RegExp(
      `-- ${REST_MARK}_BEGIN [a-f0-9]{12}[\\s\\S]*?-- ${REST_MARK}_END [a-f0-9]{12}\\s*`,
      "m",
    );
    const willReplace = restRe.test(migrationSql);
    const nextSql = willReplace
      ? migrationSql.replace(restRe, restBundle)
      : migrationSql + restBundle;

    if (DRY_RUN) {
      console.log(
        "[DRY-RUN] prisma-augment would " +
          (willReplace ? "replace" : "append") +
          " REST block in:",
      );
      console.log(`  ${migrationPath}`);
      console.log("EXT Hash:", extHash);
      console.log("REST Hash:", restHash);
      console.log("--- EXT bundle begin ---");
      if (extBundle) console.log(extBundle.trimEnd());
      console.log("--- EXT bundle end ---");
      console.log("--- REST bundle begin ---");
      console.log(restBundle.trimEnd());
      console.log("--- REST bundle end ---");
      console.log("(no file written)");
      return;
    }

    writeFileAtomic(migrationPath, nextSql);
    console.log(
      `prisma-augment: wrote EXT at head (${extHash || "none"}), and ${
        willReplace ? "updated REST" : "appended REST"
      } (${restHash || "none"}) to ${migrationPath}`,
    );
  } else {
    if (DRY_RUN)
      console.log(
        "[DRY-RUN] prisma-augment would write only EXT block at head (REST none).",
      );
    else
      console.log(
        `prisma-augment: wrote only EXT block at head (${extHash}) to ${migrationPath}`,
      );
  }
}

main().catch((e) => {
  console.error(
    `prisma-augment: ERROR:\n${e && (e as Error).stack ? (e as Error).stack : String(e)}`,
  );
  process.exit(1);
});
