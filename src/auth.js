// مصادقة مبسّطة بأدوار: مدير الالتزام (تعديل كامل) ومستعرض (قراءة فقط)
// المستخدمون الافتراضيون للتجربة — في الإنتاج تُستبدل بربط مع نظام الهوية المؤسسي
import crypto from "crypto";

const USERS = [
  {
    username: "compliance",
    // كلمة المرور الافتراضية: Chcc@2026 (تُغيّر عبر متغير البيئة CHCC_MANAGER_PASSWORD)
    password: process.env.CHCC_MANAGER_PASSWORD || "Chcc@2026",
    role: "compliance_manager",
    display_name: "مدير الالتزام",
  },
  {
    username: "viewer",
    password: process.env.CHCC_VIEWER_PASSWORD || "Viewer@2026",
    role: "viewer",
    display_name: "مستعرض",
  },
];

const sessions = new Map(); // token -> user

export function login(username, password) {
  const user = USERS.find((u) => u.username === username && u.password === password);
  if (!user) return null;
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, {
    username: user.username,
    role: user.role,
    display_name: user.display_name,
  });
  return { token, ...sessions.get(token) };
}

export function logout(token) {
  sessions.delete(token);
}

export function authenticate(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  req.user = token ? sessions.get(token) || null : null;
  next();
}

export function requireManager(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "يلزم تسجيل الدخول" });
  }
  if (req.user.role !== "compliance_manager") {
    return res.status(403).json({ error: "هذه العملية متاحة لمدير الالتزام فقط" });
  }
  next();
}
