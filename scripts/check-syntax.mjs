// فحص صياغة كل وحدات الواجهة (ES modules) بلا أدوات خارجية
// يُصرِّح كل ملف عبر node --check على نسخة بامتداد .mjs ليُعامل كوحدة ES
import { readdirSync, statSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const ROOTS = ["public/js", "scripts"];
const files = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.m?js$/.test(entry)) files.push(full);
  }
}
for (const r of ROOTS) walk(r);
files.push("public/service-worker.js");

const tmp = mkdtempSync(join(tmpdir(), "cms-syntax-"));
let failed = 0;
for (const f of files) {
  // عامل الخدمة نص عالمي لا وحدة ES — يُفحص كسكربت عادي
  const asModule = !f.endsWith("service-worker.js");
  const target = join(tmp, `${basename(f, ".js")}-${files.indexOf(f)}${asModule ? ".mjs" : ".cjs"}`);
  copyFileSync(f, target);
  try {
    execFileSync(process.execPath, ["--check", target], { stdio: "pipe" });
  } catch (e) {
    failed++;
    console.error(`✗ ${relative(process.cwd(), f)}\n${e.stderr?.toString() || e.message}`);
  }
}
rmSync(tmp, { recursive: true, force: true });

if (failed) {
  console.error(`\nفشل فحص الصياغة في ${failed} ملف من ${files.length}`);
  process.exit(1);
}
console.log(`✓ فُحصت صياغة ${files.length} ملفاً في الواجهة بلا أخطاء`);
