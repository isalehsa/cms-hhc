// طبقة البيانات على Firestore — بديل مخزن JSON المحلي وواجهة REST
// البنية: regulations/{regId} (بيانات النظام ونصه) + regulations/{regId}/articles/{artId}
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig, configReady } from "./firebase-config.js";

export const app = configReady ? initializeApp(firebaseConfig) : null;
const db = app ? getFirestore(app) : null;

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const now = () => new Date().toISOString();

const regsCol = () => collection(db, "regulations");
const regRef = (id) => doc(db, "regulations", id);
const artsCol = (regId) => collection(db, "regulations", regId, "articles");
const artRef = (regId, artId) => doc(db, "regulations", regId, "articles", artId);

// حد Firestore هو 500 عملية لكل دفعة — نكتب على دفعات آمنة
const BATCH_LIMIT = 450;

async function commitInChunks(ops) {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch);
    await batch.commit();
  }
}

// ---------- الأنظمة واللوائح ----------

// قائمة مختصرة (بدون النص الكامل والمواد) لعرض القائمة الرئيسية
export async function listRegulations() {
  const snap = await getDocs(query(regsCol(), orderBy("created_at")));
  return snap.docs.map((d) => {
    const { text, ...meta } = d.data();
    return { ...meta, id: d.id, articles_count: meta.articles_count || 0 };
  });
}

export async function getRegulation(id) {
  const snap = await getDoc(regRef(id));
  if (!snap.exists()) return null;
  const artsSnap = await getDocs(query(artsCol(id), orderBy("seq")));
  return {
    ...snap.data(),
    id: snap.id,
    articles: artsSnap.docs.map((d) => ({ ...d.data(), id: d.id })),
  };
}

// جميع الأنظمة بموادها — للمكتبة والتصدير واقتراحات الربط
export async function allRegulations() {
  const snap = await getDocs(query(regsCol(), orderBy("created_at")));
  return Promise.all(
    snap.docs.map(async (d) => {
      const artsSnap = await getDocs(query(artsCol(d.id), orderBy("seq")));
      return {
        ...d.data(),
        id: d.id,
        articles: artsSnap.docs.map((a) => ({ ...a.data(), id: a.id })),
      };
    })
  );
}

export async function createRegulation(fields) {
  const reg = {
    name: fields.name,
    description: fields.description || "",
    text: fields.text,
    status: "pending", // pending | processing | ready | failed
    analysis_method: null, // ai | heuristic
    analysis_error: null,
    articles_count: 0,
    created_at: now(),
    updated_at: now(),
  };
  const id = newId("reg");
  await setDoc(regRef(id), reg);
  return { ...reg, id, articles: [] };
}

export async function updateRegulation(id, patch) {
  await updateDoc(regRef(id), { ...patch, updated_at: now() });
}

export async function deleteRegulation(id) {
  const artsSnap = await getDocs(artsCol(id));
  const ops = artsSnap.docs.map((d) => (b) => b.delete(d.ref));
  ops.push((b) => b.delete(regRef(id)));
  await commitInChunks(ops);
  // إزالة روابط المواد التي كانت تشير إلى النظام المحذوف
  await removeLinksWhere((l) => l.regulation_id === id);
}

// ---------- المواد والبنود ----------

export async function addArticle(regId, fields) {
  const regSnap = await getDoc(regRef(regId));
  if (!regSnap.exists()) throw new Error("النظام غير موجود");
  const artsSnap = await getDocs(artsCol(regId));
  const maxSeq = artsSnap.docs.reduce((m, d) => Math.max(m, d.data().seq || 0), 0);
  const article = {
    seq: maxSeq + 1,
    number: fields.number || "",
    title: fields.title || "",
    text: fields.text || "",
    applicability: fields.applicability || "تنطبق",
    risk_level: fields.risk_level || "متوسط",
    owning_department: fields.owning_department || "الالتزام",
    rationale: fields.rationale || "",
    needs_review: fields.needs_review ?? false,
    links: [],
    edited_by: fields.edited_by || null,
    updated_at: now(),
  };
  const id = newId("art");
  await setDoc(artRef(regId, id), article);
  await updateDoc(regRef(regId), {
    articles_count: artsSnap.size + 1,
    updated_at: now(),
  });
  return { ...article, id };
}

export async function updateArticle(regId, articleId, patch, editor) {
  const allowed = [
    "number",
    "title",
    "text",
    "applicability",
    "risk_level",
    "owning_department",
    "rationale",
    "needs_review",
  ];
  const clean = {};
  for (const key of allowed) {
    if (key in patch) clean[key] = patch[key];
  }
  clean.updated_at = now();
  if (editor) clean.edited_by = editor;
  await updateDoc(artRef(regId, articleId), clean);
  await updateDoc(regRef(regId), { updated_at: clean.updated_at });
}

export async function deleteArticle(regId, articleId) {
  await deleteDoc(artRef(regId, articleId));
  const artsSnap = await getDocs(artsCol(regId));
  await updateDoc(regRef(regId), { articles_count: artsSnap.size, updated_at: now() });
  await removeLinksWhere((l) => l.article_id === articleId);
}

// استبدال جميع مواد النظام (بعد التحليل أو إعادته)
export async function replaceArticles(regId, articles) {
  const oldSnap = await getDocs(artsCol(regId));
  const ops = oldSnap.docs.map((d) => (b) => b.delete(d.ref));
  articles.forEach((a, i) => {
    const { id: _drop, ...fields } = a;
    const id = newId("art");
    ops.push((b) =>
      b.set(artRef(regId, id), {
        seq: i + 1,
        links: [],
        edited_by: null,
        updated_at: now(),
        ...fields,
      })
    );
  });
  ops.push((b) =>
    b.update(regRef(regId), { articles_count: articles.length, updated_at: now() })
  );
  await commitInChunks(ops);
  // إعادة التحليل تستبدل معرفات المواد — نزيل الروابط اليتيمة من بقية الأنظمة
  await removeLinksWhere((l) => l.regulation_id === regId, regId);
}

// ---------- الربط بين مواد الأنظمة (رابط ثنائي الاتجاه) ----------

export async function linkArticles(srcRegId, srcArtId, dstRegId, dstArtId, editor) {
  const [srcSnap, dstSnap] = await Promise.all([
    getDoc(artRef(srcRegId, srcArtId)),
    getDoc(artRef(dstRegId, dstArtId)),
  ]);
  if (!srcSnap.exists() || !dstSnap.exists()) {
    throw new Error("المادة المصدر أو الهدف غير موجودة");
  }
  const src = srcSnap.data();
  const dst = dstSnap.data();
  const srcLinks = src.links || [];
  const dstLinks = dst.links || [];
  const stamp = now();
  const batch = writeBatch(db);
  if (!srcLinks.some((l) => l.article_id === dstArtId)) {
    srcLinks.push({
      regulation_id: dstRegId,
      article_id: dstArtId,
      number: dst.number,
      created_by: editor,
      created_at: stamp,
    });
    batch.update(srcSnap.ref, { links: srcLinks });
  }
  if (!dstLinks.some((l) => l.article_id === srcArtId)) {
    dstLinks.push({
      regulation_id: srcRegId,
      article_id: srcArtId,
      number: src.number,
      created_by: editor,
      created_at: stamp,
    });
    batch.update(dstSnap.ref, { links: dstLinks });
  }
  await batch.commit();
  return { ...src, id: srcArtId, links: srcLinks };
}

export async function unlinkArticles(srcRegId, srcArtId, dstArtId) {
  const srcSnap = await getDoc(artRef(srcRegId, srcArtId));
  if (!srcSnap.exists()) throw new Error("المادة غير موجودة");
  const src = srcSnap.data();
  const link = (src.links || []).find((l) => l.article_id === dstArtId);
  const newLinks = (src.links || []).filter((l) => l.article_id !== dstArtId);
  await updateDoc(srcSnap.ref, { links: newLinks });
  // إزالة الرابط العكسي
  if (link) {
    const dstSnap = await getDoc(artRef(link.regulation_id, dstArtId));
    if (dstSnap.exists()) {
      const dstLinks = (dstSnap.data().links || []).filter(
        (l) => l.article_id !== srcArtId
      );
      await updateDoc(dstSnap.ref, { links: dstLinks });
    }
  }
  return { ...src, id: srcArtId, links: newLinks };
}

// تنظيف الروابط اليتيمة: يمسح مواد جميع الأنظمة ويزيل الروابط المطابقة للشرط
async function removeLinksWhere(match, skipRegId = null) {
  const regsSnap = await getDocs(regsCol());
  const ops = [];
  for (const regDoc of regsSnap.docs) {
    if (regDoc.id === skipRegId) continue;
    const artsSnap = await getDocs(artsCol(regDoc.id));
    for (const artDoc of artsSnap.docs) {
      const links = artDoc.data().links || [];
      if (!links.length) continue;
      const kept = links.filter((l) => !match(l));
      if (kept.length !== links.length) {
        ops.push((b) => b.update(artDoc.ref, { links: kept }));
      }
    }
  }
  if (ops.length) await commitInChunks(ops);
}
