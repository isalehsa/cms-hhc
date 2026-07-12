// مخزن بيانات بسيط على ملف JSON — بدون اعتماديات خارجية
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.CHCC_DATA_DIR || path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return { regulations: [] };
  }
}

let db = load();

function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function listRegulations() {
  return db.regulations.map(({ articles, text, ...meta }) => ({
    ...meta,
    articles_count: articles.length,
  }));
}

export function getRegulation(id) {
  return db.regulations.find((r) => r.id === id) || null;
}

export function createRegulation(fields) {
  const reg = {
    id: newId("reg"),
    name: fields.name,
    description: fields.description || "",
    text: fields.text,
    status: "pending", // pending | processing | ready | failed
    analysis_method: null, // ai | heuristic
    analysis_error: null,
    articles: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  db.regulations.push(reg);
  persist();
  return reg;
}

export function updateRegulation(id, patch) {
  const reg = getRegulation(id);
  if (!reg) return null;
  Object.assign(reg, patch, { updated_at: new Date().toISOString() });
  persist();
  return reg;
}

export function deleteRegulation(id) {
  const before = db.regulations.length;
  db.regulations = db.regulations.filter((r) => r.id !== id);
  persist();
  return db.regulations.length < before;
}

export function addArticle(regId, fields) {
  const reg = getRegulation(regId);
  if (!reg) return null;
  const article = {
    id: newId("art"),
    number: fields.number || "",
    title: fields.title || "",
    text: fields.text || "",
    applicability: fields.applicability || "تنطبق",
    risk_level: fields.risk_level || "متوسط",
    owning_department: fields.owning_department || "الالتزام",
    rationale: fields.rationale || "",
    needs_review: fields.needs_review ?? false,
    edited_by: fields.edited_by || null,
    updated_at: new Date().toISOString(),
  };
  reg.articles.push(article);
  reg.updated_at = new Date().toISOString();
  persist();
  return article;
}

export function updateArticle(regId, articleId, patch, editor) {
  const reg = getRegulation(regId);
  if (!reg) return null;
  const article = reg.articles.find((a) => a.id === articleId);
  if (!article) return null;
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
  for (const key of allowed) {
    if (key in patch) article[key] = patch[key];
  }
  article.edited_by = editor || article.edited_by;
  article.updated_at = new Date().toISOString();
  reg.updated_at = article.updated_at;
  persist();
  return article;
}

export function deleteArticle(regId, articleId) {
  const reg = getRegulation(regId);
  if (!reg) return false;
  const before = reg.articles.length;
  reg.articles = reg.articles.filter((a) => a.id !== articleId);
  if (reg.articles.length === before) return false;
  reg.updated_at = new Date().toISOString();
  persist();
  return true;
}

export function replaceArticles(regId, articles) {
  const reg = getRegulation(regId);
  if (!reg) return null;
  reg.articles = articles;
  reg.updated_at = new Date().toISOString();
  persist();
  return reg;
}
