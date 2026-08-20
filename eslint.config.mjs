// إعداد ESLint (Flat config) — فحص أخطاء لغوية شائعة في وحدات الواجهة والدوال
// لا يفرض نمطاً تنسيقياً، بل يمنع الأخطاء الصامتة (متغيّرات غير معرّفة، وعود مهملة…)
import js from "@eslint/js";

const BROWSER_GLOBALS = {
  window: "readonly", document: "readonly", location: "readonly", navigator: "readonly",
  fetch: "readonly", console: "readonly", localStorage: "readonly", sessionStorage: "readonly",
  setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly", clearInterval: "readonly",
  URL: "readonly", URLSearchParams: "readonly", Blob: "readonly", File: "readonly", FileReader: "readonly",
  TextDecoder: "readonly", TextEncoder: "readonly", crypto: "readonly", Notification: "readonly",
  Element: "readonly", Response: "readonly", Request: "readonly", Headers: "readonly",
  AbortController: "readonly", getComputedStyle: "readonly", innerWidth: "readonly", innerHeight: "readonly",
  addEventListener: "readonly", removeEventListener: "readonly", requestAnimationFrame: "readonly",
  Image: "readonly", alert: "readonly", confirm: "readonly", prompt: "readonly", print: "readonly", atob: "readonly", btoa: "readonly",
  self: "readonly", caches: "readonly", clients: "readonly", ExcelJS: "readonly", mammoth: "readonly",
  Tesseract: "readonly", pdfjsLib: "readonly", PptxGenJS: "readonly", html2canvas: "readonly", jspdf: "readonly", performance: "readonly", structuredClone: "readonly",
};

const NODE_GLOBALS = {
  require: "readonly", module: "writable", exports: "writable", process: "readonly",
  __dirname: "readonly", __filename: "readonly", console: "readonly", Buffer: "readonly",
  fetch: "readonly", setTimeout: "readonly", clearTimeout: "readonly", URL: "readonly",
  TextDecoder: "readonly", TextEncoder: "readonly", AbortController: "readonly",
  Response: "readonly", Request: "readonly", Headers: "readonly", ReadableStream: "readonly",
};

export default [
  { ignores: ["node_modules/**", "functions/node_modules/**", "functions/shared/**"] },
  {
    files: ["public/js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: BROWSER_GLOBALS,
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      // ملاحظات أسلوبية في شيفرة قائمة سابقة — تنبيه لا خطأ حتى لا يُجبر تعديل
      // ملفات خارج نطاق التغيير الحالي
      "no-useless-escape": "warn",
      "no-control-regex": "warn",
      "no-useless-assignment": "warn",
      "preserve-caught-error": "warn",
    },
  },
  {
    files: ["public/service-worker.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "script", globals: BROWSER_GLOBALS },
    rules: { ...js.configs.recommended.rules, "no-unused-vars": "warn" },
  },
  {
    files: ["functions/**/*.js"],
    ignores: ["functions/shared/**"],
    languageOptions: { ecmaVersion: 2023, sourceType: "commonjs", globals: NODE_GLOBALS },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn", { args: "none" }],
      "no-useless-escape": "warn",
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    // سكربتات الاختبار تُنفَّذ في Node، لكن دوال page.evaluate تُقيَّم داخل المتصفح
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...NODE_GLOBALS, window: "readonly" } },
    rules: { ...js.configs.recommended.rules, "no-unused-vars": ["warn", { args: "none" }] },
  },
];
