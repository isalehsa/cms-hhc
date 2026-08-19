// عامل الخدمة — دعم العمل دون اتصال (تخزين هيكل التطبيق) والإشعارات الفورية
// الإصدار مرتبط بإصدار التطبيق؛ يُحدَّث اسم الكاش لإجبار إعادة التخزين بعد كل نشر.
const CACHE = "cms-cache-v2.9";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-maskable.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cachePut(req, res) {
  if (res && res.ok && res.type === "basic") caches.open(CACHE).then((c) => c.put(req, res));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // طلبات خارجية (Firebase/الخطوط): الشبكة كالمعتاد

  // التنقل بين الصفحات: الشبكة أولاً، ثم هيكل التطبيق المخزّن عند انقطاع الاتصال
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => { cachePut(req, res.clone()); return res; })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // الموارد الثابتة (js/css/أيقونات) بالمطابقة التامة للرابط (يحترم إصدار الكاش ?v=)
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => { cachePut(req, res.clone()); return res; }).catch(() => cached);
      return cached || network;
    })
  );
});

// ---------- الإشعارات الفورية (Web Push) ----------
// عند توفّر خادم إرسال لاحقاً، ترسل حمولة JSON: { title, body, url }
self.addEventListener("push", (e) => {
  let data = { title: "نظام إدارة الالتزام", body: "لديك تحديث جديد", url: "./" };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch { if (e.data) data.body = e.data.text(); }
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: "./icon.svg",
    badge: "./icon.svg",
    dir: "rtl",
    lang: "ar",
    data: { url: data.url || "./" },
    tag: data.tag || "cms-reminder",
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = e.notification.data?.url || "./";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) if ("focus" in w) return w.focus();
      return self.clients.openWindow(target);
    })
  );
});
