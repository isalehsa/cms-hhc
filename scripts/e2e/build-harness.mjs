// يبني نسخة اختبار محلية من التطبيق: نفس شيفرة الواجهة تماماً، مع استبدال
// روابط حزمة Firebase على شبكة gstatic بحزم محلية مبنية من نفس الإصدار (11.6.1).
// يُستخدم فقط لتشغيل اختبار المسار الكامل في بيئة بلا وصول إلى شبكة CDN.
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const SRC = "public";
const OUT = process.env.E2E_OUT || "/tmp/e2e-public";
const VENDOR_PKG = process.env.E2E_VENDOR || process.cwd(); // حزم التطوير في node_modules الجذر
const CDN = "https://www.gstatic.com/firebasejs/11.6.1/";

rmSync(OUT, { recursive: true, force: true });
cpSync(SRC, OUT, { recursive: true });
mkdirSync(join(OUT, "vendor"), { recursive: true });
// نقاط الدخول داخل المستودع ليجد esbuild حزم node_modules الجذر
const TMP_ENTRY = mkdtempSync(".e2e-entry-");

// النواة (@firebase/app) تُبنى مرة واحدة، وتُشير إليها حزمتا firestore و auth
// بدل أن تحمل كل منهما نسخةً خاصة — وإلا انفصل سجل المكوّنات وتعطّلت الخدمات.
const MODULES = [
  { file: "firebase-app.js", pkg: "@firebase/app", external: [] },
  { file: "firebase-firestore.js", pkg: "firebase/firestore", external: ["@firebase/app"] },
  { file: "firebase-auth.js", pkg: "firebase/auth", external: ["@firebase/app"] },
  { file: "firebase-storage.js", pkg: "firebase/storage", external: ["@firebase/app"] },
];
for (const { file, pkg, external } of MODULES) {
  const entry = join(TMP_ENTRY, `entry-${file}`);
  writeFileSync(entry, `export * from "${pkg}";\n`);
  const outfile = join(OUT, "vendor", file);
  execFileSync(
    join(VENDOR_PKG, "node_modules/.bin/esbuild"),
    [entry, "--bundle", "--format=esm", "--platform=browser", `--outfile=${outfile}`,
      ...external.map((e) => `--external:${e}`)],
    { stdio: "pipe", cwd: VENDOR_PKG }
  );
  if (external.length) {
    writeFileSync(outfile, readFileSync(outfile, "utf8").replaceAll('"@firebase/app"', '"/vendor/firebase-app.js"'));
  }
}

function walk(dir) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(js|html)$/.test(e)) {
      const before = readFileSync(full, "utf8");
      const after = before.replaceAll(CDN, "/vendor/");
      if (after !== before) writeFileSync(full, after);
    }
  }
}
walk(OUT);

// إسقاط سكربتات CDN والخطوط الخارجية (غير لازمة لمسار الاختبار وتفشل بلا شبكة)
const idx = join(OUT, "index.html");
writeFileSync(
  idx,
  readFileSync(idx, "utf8")
    .replace(/<script defer src="https:\/\/cdn\.jsdelivr\.net[^>]*><\/script>\s*/g, "")
    .replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/g, "")
);

rmSync(TMP_ENTRY, { recursive: true, force: true });
console.log(`✓ بُنيت نسخة الاختبار في ${OUT} (حزم Firebase محلية)`);
