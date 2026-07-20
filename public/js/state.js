// مخزن مركزي: يحمّل مجموعات النظام مرة واحدة ويوفر أدوات بحث مشتركة للوحدات
import { listCol } from "./db.js";

export const store = {
  user: null,
  requirements: [],
  risks: [],
  monitoring: [],
  planItems: [],
  assessments: [],
  findings: [],
  correspondence: [],
  disclosures: [],
  trainings: [],
  maturity: [],
  directory: [],
  departments: [],
  authorities: [],
  users: [],
  notifications: [],
  regulations: [],
  loaded: false,
};

export async function loadAll(force = false) {
  if (store.loaded && !force) return store;
  const [requirements, risks, monitoring, planItems, assessments, findings, correspondence, disclosures, trainings, maturity, directory, departments, authorities, users, notifications] =
    await Promise.all([
      listCol("requirements", "code").catch(() => []),
      listCol("risks", "code").catch(() => []),
      listCol("monitoring", "code").catch(() => []),
      listCol("planItems").catch(() => []),
      listCol("assessments").catch(() => []),
      listCol("findings", "code").catch(() => []),
      listCol("correspondence", "code").catch(() => []),
      listCol("disclosures", "code").catch(() => []),
      listCol("trainings", "code").catch(() => []),
      listCol("maturity", "code").catch(() => []),
      listCol("directory").catch(() => []),
      listCol("departments", "name").catch(() => []),
      listCol("authorities", "name").catch(() => []),
      listCol("users").catch(() => []),
      listCol("notifications").catch(() => []),
    ]);
  Object.assign(store, {
    requirements, risks, monitoring, planItems, assessments, findings, correspondence, disclosures, trainings, maturity, directory,
    departments, authorities, users, notifications, loaded: true,
  });
  return store;
}

// إعادة تحميل مجموعة واحدة بعد التعديل
export async function reload(...cols) {
  const orderFields = { requirements: "code", risks: "code", monitoring: "code", findings: "code", correspondence: "code", disclosures: "code", trainings: "code", maturity: "code", departments: "name", authorities: "name" };
  await Promise.all(
    cols.map(async (c) => {
      store[c] = await listCol(c, orderFields[c] || null).catch(() => []);
    })
  );
}

export const deptName = (id) => store.departments.find((d) => d.id === id)?.name || (id || "—");
export const authName = (id) => store.authorities.find((a) => a.id === id)?.name || (id || "—");
export const userName = (id) => store.users.find((u) => u.id === id)?.name || "—";
export const reqLabel = (id) => {
  const r = store.requirements.find((x) => x.id === id);
  return r ? `${r.code} — ${r.title}` : id || "—";
};
export const riskLabel = (id) => {
  const r = store.risks.find((x) => x.id === id);
  return r ? `${r.code} — ${r.title}` : id || "—";
};
export const monLabel = (id) => {
  const m = store.monitoring.find((x) => x.id === id);
  return m ? `${m.code} — ${m.name}` : id || "—";
};

export const reqOptions = () => store.requirements.map((r) => ({ id: r.id, name: `${r.code} — ${r.title}` }));
export const riskOptions = () => store.risks.map((r) => ({ id: r.id, name: `${r.code} — ${r.title}` }));
export const monOptions = () => store.monitoring.map((m) => ({ id: m.id, name: `${m.code} — ${m.name}` }));
// خيارات الإدارات: تستبعد المعطّلة، وتُرتَّب حسب القطاع ثم الاسم لتجميع كل قطاع معاً
export const deptOptions = () =>
  store.departments
    .filter((d) => d.active !== false)
    .slice()
    .sort((a, b) => (a.sector || "").localeCompare(b.sector || "", "ar") || (a.name || "").localeCompare(b.name || "", "ar"))
    .map((d) => ({ id: d.id, name: d.sector && d.type !== "SECTOR" ? `${d.sector} › ${d.name}` : d.name }));
export const authOptions = () => store.authorities.map((a) => ({ id: a.id, name: a.name }));
// التجمعات الصحية = الإدارات من نوع CLUSTER
export const clusterOptions = () =>
  store.departments.filter((d) => d.type === "CLUSTER" && d.active !== false).map((d) => ({ id: d.id, name: d.name }));
export const userOptions = () => store.users.filter((u) => u.active !== false).map((u) => ({ id: u.id, name: u.name || u.email }));
