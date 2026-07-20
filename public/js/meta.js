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

// ---------- الهيكل التنظيمي (الإدارات والقطاعات) ----------
export const DEPT_TYPES = {
  SECTOR: "قطاع",
  DEPARTMENT: "إدارة",
  OFFICE: "جهة إشرافية / رقابية",
  CLUSTER: "إدارة التزام تجمع صحي",
};

// الهيكل التنظيمي لشركة الصحة القابضة — القطاعات وإداراتها (حسب الهيكل المعتمد)
export const ORG_SECTORS = [
  {
    name: "الجهات الإشرافية والرقابية",
    type: "OFFICE",
    depts: ["أمانة المجلس", "مكتب الرئيس التنفيذي", "الحوكمة والالتزام", "الالتزام", "الحوكمة", "الجودة", "الأمن السيبراني", "إدارة المخاطر", "المراجعة الداخلية", "الشؤون القانونية", "تطوير الأعمال"],
  },
  {
    name: "التواصل المؤسسي",
    depts: ["التواصل المؤسسي والتخطيط", "العلاقات العامة والإعلام", "التسويق الرقمي", "تسويق الفعاليات"],
  },
  {
    name: "الموارد المؤسسية",
    depts: ["المشتريات", "المرافق ودعم البنية التحتية", "الاستجابة السريعة", "إدارة العقود"],
  },
  {
    name: "رأس المال البشري",
    depts: ["الاستراتيجية والتحول (الموارد البشرية)", "استقطاب المواهب", "التطوير التنظيمي", "التعليم والتطوير", "عمليات الموارد البشرية"],
  },
  {
    name: "الخدمات المشتركة",
    depts: ["الصحة الرقمية", "سلاسل الإمداد", "النقل الطبي", "المختبرات"],
  },
  {
    name: "نموذج الرعاية والخدمات الصحية",
    depts: ["مركز التميز", "تقديم الرعاية الصحية", "نظام الوقاية", "نظام الولادة الآمنة", "نظام الأمراض المزمنة", "نظام الرعاية الاختيارية", "نظام الرعاية العاجلة", "نظام الرعاية التلطيفية"],
  },
  {
    name: "دورة الإيرادات",
    depts: ["التخطيط وقياس أداء الإيرادات", "خدمات الإيرادات", "التمويل والاستثمار", "حساب التكاليف"],
  },
  {
    name: "المالية",
    depts: ["التخطيط والتحليل المالي", "الحسابات والعمليات", "الخزينة", "التحول المالي", "إدارة الأصول"],
  },
  {
    name: "الاستراتيجية والتحول",
    depts: ["التخطيط الاستراتيجي", "إدارة الأداء", "إدارة التحول", "مكتب إدارة المشاريع", "مكتب البيانات", "شؤون القطاعات", "الثقافة وإدارة التغيير"],
  },
];

// التجمعات الصحية العشرين — تُنشأ لكل تجمع إدارة التزام
export const HEALTH_CLUSTERS = [
  "تجمع الرياض الصحي الأول", "تجمع الرياض الصحي الثاني", "تجمع الرياض الصحي الثالث",
  "تجمع جدة الصحي الأول", "تجمع جدة الصحي الثاني", "تجمع مكة المكرمة الصحي",
  "تجمع المدينة المنورة الصحي", "تجمع الطائف الصحي", "تجمع القصيم الصحي",
  "تجمع الأحساء الصحي", "تجمع الشرقية الصحي", "تجمع عسير الصحي",
  "تجمع جازان الصحي", "تجمع نجران الصحي", "تجمع الباحة الصحي",
  "تجمع تبوك الصحي", "تجمع حائل الصحي", "تجمع الجوف الصحي",
  "تجمع الحدود الشمالية الصحي", "تجمع بيشة الصحي",
];

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

export const CONTROL_EFFECTIVENESS = ["فعّال", "فعّال جزئيًا", "غير فعّال"];
export const CONTROL_TYPES = ["وقائي", "كشفي", "تصحيحي", "توجيهي"];

// مصدر إنشاء الخطر عند التوليد الآلي
export const RISK_SOURCES = {
  AUTO_REGULATION: "أُنشئ آلياً من التحليل الذكي وفق الغرامات والعقوبات المذكورة في النظام",
  AUTO_LIBRARY: "أُنشئ آلياً عند إضافة المتطلب إلى مكتبة الالتزام",
};

// تقييم 5×5: الدرجة = الاحتمالية × الأثر
export function riskLevel(likelihood, impact) {
  const score = (Number(likelihood) || 0) * (Number(impact) || 0);
  if (score >= 15) return { key: "CRITICAL", label: "حرج", score };
  if (score >= 10) return { key: "HIGH", label: "عالٍ", score };
  if (score >= 5) return { key: "MEDIUM", label: "متوسط", score };
  return { key: "LOW", label: "منخفض", score };
}

// ---------- موسوعة الوثائق ----------
export const DOC_CATEGORIES = {
  LAW: "نظام",
  REGULATION: "لائحة",
  POLICY: "سياسة",
  CIRCULAR: "تعميم",
  GUIDELINE: "دليل استرشادي",
  STANDARD: "معيار",
  DECISION: "قرار",
  OTHER: "أخرى",
};

export const DOC_SECTORS = [
  "الصحة",
  "المالية",
  "الموارد البشرية",
  "التقنية والاتصالات",
  "الأمن السيبراني",
  "التجارة",
  "البيئة",
  "الطاقة",
  "النقل",
  "البلديات والإسكان",
  "عام / متعدد القطاعات",
];

// فئة الوثيقة → نوع المتطلب المنعكس منها
export const DOC_TO_REQ_TYPE = {
  LAW: "REGULATION", REGULATION: "REGULATION", POLICY: "POLICY", CIRCULAR: "CIRCULAR",
  GUIDELINE: "GUIDELINE", STANDARD: "STANDARD", DECISION: "REGULATION", OTHER: "REGULATION",
};

// ---------- سجل الإفصاحات ----------
export const DISCLOSURE_TYPES = {
  CONFLICT: "تعارض مصالح",
  GIFTS: "هدايا وضيافة",
  OUTSIDE: "أعمال ومصالح خارجية",
  FINANCIAL: "إفصاح مالي",
  RELATED_PARTY: "أطراف ذات علاقة",
  WHISTLEBLOW: "بلاغ مخالفة",
  OTHER: "أخرى",
};

export const DISCLOSURE_STATUS = {
  PENDING: "بانتظار المراجعة",
  UNDER_REVIEW: "قيد المراجعة",
  APPROVED: "معتمد / لا تعارض",
  MITIGATED: "معالَج بإجراء",
  REJECTED: "مرفوض",
};

// ---------- سجل المراسلات ----------
export const COR_DIRECTION = {
  INCOMING: "واردة",
  OUTGOING: "صادرة",
};

export const COR_PRIORITY = {
  NORMAL: "عادية",
  URGENT: "عاجلة",
  CONFIDENTIAL: "سرية",
};

export const COR_STATUS = {
  OPEN: "قيد المعالجة",
  REPLIED: "تم الرد",
  CLOSED: "مغلقة",
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

// نوع مبادرة الخطة — لجعل الخطة السنوية شاملة لكل أعمال الالتزام
export const PLAN_TYPES = {
  POLICY: "تحديث سياسات وإجراءات",
  OPERATION: "عمليات وأنشطة إدارية",
  AWARENESS: "توعية وتدريب",
  MONITORING: "مراقبة وفحص",
  ASSESSMENT: "فحص ذاتي",
  RISK_TREATMENT: "معالجة مخاطر",
  SYSTEM: "تطوير أنظمة وأتمتة",
  REPORTING: "رفع تقارير",
  REGULATORY: "متابعة تنظيمية وإفصاحات",
  OTHER: "أخرى",
};

// المحاور الرئيسية لخطة الالتزام — تُنظَّم الخطة السنوية في تبويبات بحسبها
export const PLAN_AXES = {
  FOLLOWUP: { label: "المتابعة", icon: "📌", desc: "متابعة تنفيذ الالتزامات والمبادرات والتقارير الدورية" },
  VERIFICATION: { label: "التحقق", icon: "✔", desc: "الفحص الذاتي والتحقق من مدى الالتزام بالمتطلبات" },
  GUIDANCE: { label: "الإرشاد", icon: "🧭", desc: "السياسات والأدلة والاستشارات ومتابعة المستجدات التنظيمية" },
  CONTROL: { label: "الرقابة", icon: "🛡", desc: "المراقبة الرقابية ومعالجة المخاطر والضوابط" },
  TRAINING: { label: "التدريب والتوعية", icon: "🎓", desc: "برامج التدريب وحملات التوعية ونشر ثقافة الالتزام" },
  IMPROVEMENT: { label: "التطوير المستمر", icon: "🚀", desc: "تطوير الأنظمة والأتمتة وتحسين كفاءة برنامج الالتزام" },
};

// إسناد افتراضي لنوع المبادرة إلى محورها (يُستخدم للمبادرات القديمة أو غير المصنّفة)
export const PLAN_TYPE_AXIS = {
  OPERATION: "FOLLOWUP", REPORTING: "FOLLOWUP",
  ASSESSMENT: "VERIFICATION",
  POLICY: "GUIDANCE", REGULATORY: "GUIDANCE",
  MONITORING: "CONTROL", RISK_TREATMENT: "CONTROL",
  AWARENESS: "TRAINING",
  SYSTEM: "IMPROVEMENT",
  OTHER: "FOLLOWUP",
};

// ---------- التدريب والتوعية ----------
export const TRAINING_TYPES = {
  WORKSHOP: "ورشة عمل",
  LECTURE: "محاضرة",
  COURSE: "دورة تدريبية",
  MANDATORY: "تدريب إلزامي",
  BULLETIN: "نشرة توعوية",
  CAMPAIGN: "حملة توعية",
  QUIZ: "اختبار توعية",
  ONBOARDING: "تعريف الموظفين الجدد",
};

export const TRAINING_STATUS = {
  PLANNED: "مخطط",
  IN_PROGRESS: "قيد التنفيذ",
  COMPLETED: "منفذ",
  CANCELLED: "ملغى",
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
