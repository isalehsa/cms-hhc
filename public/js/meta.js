// القوائم المرجعية والتعدادات — متوافقة مع بيانات النظام السابق (قيم إنجليزية بعناوين عربية)
export const DEPARTMENTS = [
  "الالتزام",
  "الشؤون القانونية",
  "الموارد البشرية",
  "المالية",
  "تقنية المعلومات",
  "أمن المعلومات",
  "إدارة المخاطر",
  "العمليات",
  "المشتريات والعقود",
  "التدقيق الداخلي",
  "الأمن والسلامة",
  "خدمة العملاء",
  "الإدارة العليا",
];

export const RISK_LEVELS = ["عالي", "متوسط", "منخفض"];
export const APPLICABILITY = ["تنطبق", "لا تنطبق"];

// ---------- الأدوار ----------
export const ROLES = {
  ADMIN: "مدير النظام",
  COMPLIANCE_MANAGER: "مدير الالتزام",
  SPECIALIST: "أخصائي الالتزام",
  DEPT_OWNER: "مالك الإدارة",
  AUDITOR: "مراجع",
  EXECUTIVE: "الإدارة التنفيذية",
};
// الأدوار المخوّلة بالتحرير الكامل للمحتوى
export const EDITOR_ROLES = ["ADMIN", "COMPLIANCE_MANAGER", "SPECIALIST"];
// المخوّلون بالاعتماد وإدارة المستخدمين
export const APPROVER_ROLES = ["ADMIN", "COMPLIANCE_MANAGER"];

// ---------- مكتبة الالتزام ----------
export const REQ_TYPES = {
  REGULATION: "لائحة / نظام",
  POLICY: "سياسة",
  CIRCULAR: "تعميم",
  GUIDELINE: "دليل",
  CONTRACT: "عقد",
  STANDARD: "معيار",
};

export const REQ_CATEGORIES = {
  GOVERNANCE: "حوكمة",
  LICENSING: "تراخيص",
  PRIVACY: "خصوصية",
  QUALITY: "جودة",
  HR: "موارد بشرية",
  PROCUREMENT: "مشتريات",
  FINANCE: "مالية",
  CYBER: "أمن سيبراني",
  MEDICAL: "طبي / سريري",
  SAFETY: "أمن وسلامة",
  OTHER: "أخرى",
};

export const CRITICALITY = {
  CRITICAL: "حرجة",
  HIGH: "عالية",
  MEDIUM: "متوسطة",
  LOW: "منخفضة",
};

export const REQ_STATUS = {
  ACTIVE: "نشط",
  UPDATED: "محدث",
  UNDER_REVIEW: "تحت المراجعة",
  CANCELLED: "ملغي",
};

// ---------- سجل المخاطر ----------
export const RISK_STATUS = {
  OPEN: "مفتوح",
  IN_TREATMENT: "قيد المعالجة",
  TREATED: "عولج",
  ACCEPTED: "مقبول",
  CLOSED: "مغلق",
};

// تقييم الضابط الرقابي وفق دليل السياسات والإجراءات (مقياس 1-5)
// ممتاز(5) جيد(4) مقبول(3) ضعيف(2) غير مرضٍ(1) — الأعلى يعني ضابطاً أقوى يخفّض الخطر المتبقي
export const CONTROL_EFFECTIVENESS = ["ممتاز", "جيد", "مقبول", "ضعيف", "غير مرضٍ"];
// وزن الضابط لأغراض حساب المخاطر المتبقية آلياً
export const CONTROL_WEIGHT = { "ممتاز": 5, "جيد": 4, "مقبول": 3, "ضعيف": 2, "غير مرضٍ": 1 };

// مصدر إنشاء الخطر عند التوليد الآلي
export const RISK_SOURCES = {
  AUTO_REGULATION: "أُنشئ آلياً من التحليل الذكي وفق الغرامات والعقوبات المذكورة في النظام",
  AUTO_LIBRARY: "أُنشئ آلياً عند إضافة المتطلب إلى مكتبة الالتزام",
};

// تقييم 5×5: الدرجة = الاحتمالية × الأثر — نطاقات المستوى وفق دليل السياسات والإجراءات:
// حرج (16-25)، عالٍ (10-15)، متوسط (4-9)، منخفض (1-3)
export function riskLevel(likelihood, impact) {
  const score = (Number(likelihood) || 0) * (Number(impact) || 0);
  if (score >= 16) return { key: "CRITICAL", label: "حرج", score };
  if (score >= 10) return { key: "HIGH", label: "عالٍ", score };
  if (score >= 4) return { key: "MEDIUM", label: "متوسط", score };
  return { key: "LOW", label: "منخفض", score };
}

// مقاييس الاحتمالية والأثر (1-5) كما وردت في دليل السياسات — تُعرض كتلميح عند الإدخال
export const LIKELIHOOD_SCALE = {
  5: "شبه مؤكد — متوقع خلال شهرين",
  4: "على الأغلب — خلال 2 إلى 6 أشهر",
  3: "محتمل — خلال 6 أشهر إلى سنة",
  2: "نادر — خلال سنة إلى 3 سنوات",
  1: "مستبعد — كل 3 سنوات فأكثر",
};
export const IMPACT_SCALE = {
  5: "عالي جداً — تأثير خطير وعقوبات كبيرة وإيقاف الترخيص",
  4: "عالي — تأثير رئيسي وعقوبات مالية أو إنذارات",
  3: "متوسط — تأثير متوسط وعقوبات متوسطة",
  2: "قليل — تأثير منخفض وأضرار طفيفة",
  1: "ضئيل — تأثير غير مؤثر",
};

// ---------- البلاغات (سجل البلاغات) ----------
export const CASE_SOURCES = {
  PLATFORM: "منصة الإبلاغ",
  EMAIL: "البريد الإلكتروني",
  PHONE: "الهاتف",
  IN_PERSON: "بلاغ شخصي",
  REGULATOR: "جهة رقابية",
  ANONYMOUS: "بلاغ مجهول",
  OTHER: "أخرى",
};

export const CASE_STATUS = {
  RECEIVED: "وارد — قيد التقييم المبدئي",
  INVESTIGATING: "جاري التحقيق",
  CLOSED: "مغلق",
};

// ---------- الزيارات الميدانية ----------
export const VISIT_STATUS = {
  PLANNED: "مخططة",
  CONDUCTED: "منفذة — تحت المتابعة",
  CLOSED: "مغلقة",
};

// حالة تنفيذ الإجراء التصحيحي لملاحظة الزيارة (نعم / لا / جاري التنفيذ)
export const OBS_IMPL_STATUS = {
  DONE: "نعم — نُفّذ",
  IN_PROGRESS: "جاري التنفيذ",
  NOT_DONE: "لا — لم يُنفّذ",
};

// ---------- برنامج المراقبة ----------
export const MON_TYPES = {
  DESK: "مكتبي",
  FIELD: "ميداني",
  DOCUMENT: "مستندي",
  INTERVIEW: "مقابلات",
  SAMPLE: "عينة",
};

export const MON_FREQ = {
  MONTHLY: "شهري",
  QUARTERLY: "ربع سنوي",
  SEMIANNUAL: "نصف سنوي",
  ANNUAL: "سنوي",
};

export const MON_STATUS = {
  PLANNED: "مخطط",
  IN_PROGRESS: "قيد التنفيذ",
  COMPLETED: "مكتمل",
  CLOSED: "مغلق",
};

export const MON_RESULT = {
  COMPLIANT: "ملتزم",
  PARTIAL: "ملتزم جزئياً",
  NON_COMPLIANT: "غير ملتزم",
};

export const NC_LEVELS = {
  LOW: "منخفض",
  MEDIUM: "متوسط",
  HIGH: "عالٍ",
  CRITICAL: "حرج",
};

// ---------- الخطة السنوية ----------
export const PLAN_STATUS = {
  NOT_STARTED: "لم تبدأ",
  IN_PROGRESS: "قيد التنفيذ",
  COMPLETED: "مكتملة",
  DELAYED: "متأخرة",
};

export const PLAN_SOURCES = {
  REQUIREMENT: "متطلب تنظيمي",
  RISK: "خطر",
  MONITORING: "نتيجة مراقبة",
  ASSESSMENT: "فحص ذاتي",
  MANUAL: "يدوي",
};

// ---------- الفحص الذاتي ----------
export const SA_STATUS = {
  DRAFT: "مسودة",
  SENT: "مرسل للإدارة",
  SUBMITTED: "بانتظار المراجعة",
  REVIEWED: "تمت المراجعة",
};

export const SA_ANSWERS = {
  COMPLIANT: "ملتزم",
  PARTIAL: "ملتزم جزئياً",
  NON_COMPLIANT: "غير ملتزم",
  NA: "لا ينطبق",
};

// ---------- الملاحظات وخطط التصحيح ----------
export const FND_SEVERITY = {
  LOW: "منخفضة",
  MEDIUM: "متوسطة",
  HIGH: "عالية",
  CRITICAL: "حرجة",
};

export const FND_STATUS = {
  OPEN: "مفتوحة",
  IN_PROGRESS: "قيد المعالجة",
  CLOSED: "مغلقة",
};

export const ACTION_STATUS = {
  OPEN: "مفتوحة",
  IN_PROGRESS: "قيد التنفيذ",
  COMPLETED: "مكتملة",
};

export const FND_SOURCES = {
  MONITORING: "برنامج المراقبة",
  ASSESSMENT: "الفحص الذاتي",
  FIELD_VISIT: "زيارة ميدانية",
  CASE: "بلاغ",
  MANUAL: "يدوي",
};

// ---------- ألوان الحالات (لوحة حالات معتمدة — تُرافق دوماً بنص، لا لون وحده) ----------
export const STATUS_COLORS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
  neutral: "#8a8578",
};

// تحويل مستوى (LOW..CRITICAL) إلى دور لوني
export const LEVEL_COLOR_ROLE = {
  LOW: "good",
  MEDIUM: "warning",
  HIGH: "serious",
  CRITICAL: "critical",
};
