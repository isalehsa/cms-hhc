// تهيئة تطبيق الويب التقدمي (PWA): تسجيل عامل الخدمة، الإشعارات، ومطالبة التثبيت
let swReg = null;
let installEvent = null;

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js")
      .then((reg) => { swReg = reg; })
      .catch((e) => console.warn("SW registration failed", e));
  });
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvent = e; });
}

export const canInstall = () => Boolean(installEvent);
export async function promptInstall() {
  if (!installEvent) return false;
  installEvent.prompt();
  const { outcome } = await installEvent.userChoice;
  installEvent = null;
  return outcome === "accepted";
}

// ---------- الإشعارات ----------
export const notificationsSupported = () => "Notification" in window;
export const notificationsState = () => (notificationsSupported() ? Notification.permission : "unsupported");

export async function ensureNotificationPermission() {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission === "default") {
    try { return await Notification.requestPermission(); } catch { return Notification.permission; }
  }
  return Notification.permission;
}

// إشعار نظام محلي (يمرّ عبر عامل الخدمة ليعمل النقر) — بديل عملي عن Web Push بلا خادم
export async function showLocalNotification(title, body, url = "./") {
  if (notificationsState() !== "granted") return false;
  const reg = swReg || (("serviceWorker" in navigator) ? await navigator.serviceWorker.ready.catch(() => null) : null);
  const opts = { body, icon: "icon.svg", badge: "icon.svg", dir: "rtl", lang: "ar", tag: "cms-reminder", data: { url } };
  try {
    if (reg) await reg.showNotification(title, opts);
    else new Notification(title, opts);
    return true;
  } catch {
    return false;
  }
}
