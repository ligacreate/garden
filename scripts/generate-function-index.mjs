/**
 * Generates docs/FUNCTION_INDEX.md — index of function-like declarations
 * with signatures (parameter lists) and line numbers.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const skip = new Set(["node_modules", "dist", "assets", ".git"]);
const exts = new Set([".js", ".jsx"]);

/** @param {string} text @param {number} openParenIndex index of '(' */
function balancedParamList(text, openParenIndex) {
  let depth = 0;
  for (let i = openParenIndex; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return text.slice(openParenIndex, i + 1);
    }
  }
  return null;
}

function lineNumber(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

/**
 * @returns {{ line: number, signature: string }[]}
 */
function scanDeclarations(text) {
  /** @type {{ line: number, start: number, signature: string }[]} */
  const found = [];

  /**
   * @param {RegExp} re
   * @param {(m: RegExpExecArray, openParenIndex: number) => string} buildSig
   */
  function run(re, buildSig) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const full = m[0];
      const openParenIndex = m.index + full.length - 1;
      if (text[openParenIndex] !== "(") continue;
      const params = balancedParamList(text, openParenIndex);
      if (!params) continue;
      const signature = buildSig(m, openParenIndex, params);
      const line = lineNumber(text, m.index);
      found.push({ line, start: m.index, signature });
    }
  }

  // Order: more specific patterns first (export default …). \s* allows indentation.
  run(
    /(?:^|[\r\n])\s*export\s+default\s+(async\s+)?function\s+(\w+)\s*\(/g,
    (m, _open, params) => {
      const as = m[1] ? "async " : "";
      return `export default ${as}function ${m[2]}${params}`;
    }
  );

  run(
    /(?:^|[\r\n])\s*export\s+(async\s+)?function\s+(\w+)\s*\(/g,
    (m, _open, params) => {
      const as = m[1] ? "async " : "";
      return `export ${as}function ${m[2]}${params}`;
    }
  );

  run(
    /(?:^|[\r\n])\s*(async\s+)?function\s+(\w+)\s*\(/g,
    (m, _open, params) => {
      const as = m[1] ? "async " : "";
      return `${as}function ${m[2]}${params}`;
    }
  );

  run(
    /(?:^|[\r\n])\s*(?:export\s+)?const\s+(\w+)\s*=\s*(async\s*)?\(/g,
    (m, _open, params) => {
      const as = m[2] ? "async " : "";
      const ex = m[0].trimStart().startsWith("export") ? "export const " : "const ";
      return `${ex}${m[1]} = ${as}${params} =>`;
    }
  );

  found.sort((a, b) => a.start - b.start || a.line - b.line);

  // Deduplicate overlapping matches (keep first)
  const deduped = [];
  let lastEnd = -1;
  for (const item of found) {
    if (item.start < lastEnd) continue;
    deduped.push(item);
    lastEnd = item.start + item.signature.length;
  }

  return deduped;
}

function walk(dir, visit) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (skip.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, visit);
    else if (exts.has(path.extname(e.name))) visit(full);
  }
}

/** @type {Record<string, { line: number, signature: string }[]>} */
const results = {};

walk(root, (fp) => {
  const rel = path.relative(root, fp).split(path.sep).join("/");
  if (rel === "scripts/generate-function-index.mjs") return;
  const text = fs.readFileSync(fp, "utf8");
  const list = scanDeclarations(text);
  if (list.length) results[rel] = list;
});

const files = Object.keys(results).sort();
const totalFns = files.reduce((a, f) => a + results[f].length, 0);

const out = [];
out.push("# Индекс функций (garden)");
out.push("");
out.push("Автоматически сгенерировано скриптом `scripts/generate-function-index.mjs`.");
out.push("");
out.push(
  "Для каждого объявления указаны **номер строки** и **полная сигнатура** (список параметров). Учитываются: `function …`, `export function …`, `export default function …`, `const Имя = (` / `async (`."
);
out.push("");
out.push(
  "Ограничения: вложенные объявления на одной строке с другими конструкциями могут не попасть; для стрелочных функций показано `const name = (…) =>` без тела."
);
out.push("");
out.push(`**Файлов:** ${files.length} · **Объявлений:** ${totalFns}`);
out.push("");

for (const file of files) {
  out.push(`## \`${file}\``);
  out.push("");
  out.push("| # | Строка | Сигнатура |");
  out.push("|---|--------|-----------|");
  results[file].forEach((item, i) => {
    const sig = item.signature.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
    out.push(`| ${i + 1} | ${item.line} | \`${sig}\` |`);
  });
  out.push("");
}

const docsDir = path.join(root, "docs");
fs.mkdirSync(docsDir, { recursive: true });
const outPath = path.join(docsDir, "FUNCTION_INDEX.md");
fs.writeFileSync(outPath, out.join("\n"), "utf8");
console.log(`Wrote ${outPath} (${files.length} files, ${totalFns} declarations)`);
