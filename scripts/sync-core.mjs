// مزامنة نسخة الخادم من منطق الرصد التنظيمي المشترك مع نسخة الواجهة
// المصدر الوحيد للحقيقة: public/js/regintel-core.js
import { copyFileSync, readFileSync } from "node:fs";

const SRC = "public/js/regintel-core.js";
const DST = "functions/shared/regintel-core.mjs";

copyFileSync(SRC, DST);
console.log(`✓ نُسخ ${SRC} → ${DST} (${readFileSync(DST).length} بايت)`);
