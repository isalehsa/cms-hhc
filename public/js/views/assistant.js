// المساعد الذكي — ثلاث أدوات مبنية على مسار Claude API القائم:
// 1) ربط الالتزامات (اقتراح تصنيف المتطلب وإدارته والتزاماته المرتبطة)
// 2) اقتراح المخاطر لالتزام/متطلب مع الاحتمالية والأثر والضوابط
// 3) تلخيص وثيقة تنظيمية واستخراج التزاماتها وغراماتها
import { store, reload, reqOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, sel, area, val, spinnerHtml, levelBadge, chip, emptyMsg,
} from "../ui.js";
import { REQ_CATEGORIES, CRITICALITY, riskLevel } from "../meta.js";
import { aiEnabled, suggestClassification, suggestRisks, summarizeDocument } from "../ai-assist.js";
import { canEdit } from "../auth.js";

const state = { tab: "map" };
const TABS = { map: "🔗 ربط الالتزامات", risk: "⚠ اقتراح المخاطر", sum: "📄 تلخيص وثيقة" };

export function renderAssistant(el, nav, refresh) {
  const editable = canEdit(store.user);
  el.innerHTML = `
    <div class="page-head"><h1>🤖 المساعد الذكي</h1></div>
    ${!aiEnabled() ? '<section class="card"><p class="muted">المساعد الذكي يتطلب مفتاح Claude API. أضِفه من زر الإعدادات ⚙ في القائمة الجانبية. بدونه تبقى بقية النظام تعمل بالكامل.</p></section>' : ""}
    <div class="subtabs">
      ${Object.entries(TABS).map(([k, l]) => `<button class="subtab ${state.tab === k ? "active" : ""}" data-tab="${k}">${l}</button>`).join("")}
    </div>
    <section class="card" id="ai-panel"></section>`;

  el.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { state.tab = b.dataset.tab; renderAssistant(el, nav, refresh); }));
  const panel = $("#ai-panel", el);
  const rerender = () => renderAssistant(el, nav, refresh);
  if (state.tab === "map") renderMap(panel, editable, rerender);
  else if (state.tab === "risk") renderRisk(panel, editable, rerender);
  else renderSummary(panel, editable);
}

const busy = (panel) => { panel.querySelector("#ai-run").disabled = true; };
const runBtn = (label) => `<button id="ai-run">${label}</button>`;

// ---------- 1) ربط الالتزامات ----------
function renderMap(panel, editable, done) {
  panel.innerHTML = `
    <p class="muted">اختر متطلباً ليقترح المساعد تصنيفه وأهميته وإدارته المالكة والتزاماته المرتبطة.</p>
    ${sel("map-req", reqOptions(), "", { empty: "— اختر متطلباً —" })}
    <div class="row" style="margin-top:10px">${runBtn("🤖 اقترح التصنيف والربط")}</div>
    <div id="ai-out" style="margin-top:12px"></div>`;
  $("#ai-run", panel).onclick = async () => {
    const reqId = val("map-req", panel);
    const req = store.requirements.find((r) => r.id === reqId);
    if (!req) return toast("اختر متطلباً", true);
    const out = $("#ai-out", panel);
    out.innerHTML = spinnerHtml("جاري التحليل بالذكاء الاصطناعي…");
    busy(panel);
    try {
      const deptNames = store.departments.filter((d) => d.active !== false).map((d) => d.name);
      const r = await suggestClassification(`${req.title}\n${req.summary || ""}`, deptNames, (m) => (out.innerHTML = spinnerHtml(m)));
      const deptMatch = store.departments.find((d) => d.name === r.ownerDepartment) || store.departments.find((d) => (r.ownerDepartment || "").includes(d.name) || d.name.includes(r.ownerDepartment || ""));
      out.innerHTML = `
        <div class="detail-grid">
          <div><span class="muted">التصنيف المقترح</span><br/>${esc(REQ_CATEGORIES[r.category] || r.category)}</div>
          <div><span class="muted">الأهمية المقترحة</span><br/>${esc(CRITICALITY[r.criticality] || r.criticality)}</div>
          <div><span class="muted">الإدارة المالكة</span><br/>${esc(r.ownerDepartment)}${deptMatch ? "" : ' <span class="muted">(غير مطابقة لإدارة مسجّلة)</span>'}</div>
        </div>
        <p class="pre-line"><strong>المبرر:</strong> ${esc(r.rationale)}</p>
        <h3>الالتزامات المرتبطة المقترحة</h3>
        ${(r.relatedObligations || []).length ? `<ul>${r.relatedObligations.map((o) => `<li><strong>${esc(o.title)}</strong> — <span class="muted">${esc(o.why)}</span></li>`).join("")}</ul>` : emptyMsg("لا اقتراحات")}
        ${editable ? `<div class="row" style="margin-top:10px"><button id="map-apply">✔ تطبيق التصنيف على المتطلب</button></div>` : ""}`;
      $("#map-apply", out)?.addEventListener("click", async () => {
        await db.updateRow("requirements", req.id, { category: r.category, criticality: r.criticality, ownerDeptId: deptMatch?.id ?? req.ownerDeptId });
        await db.audit("UPDATE", "Requirement", req.code, `تطبيق تصنيف مقترح من المساعد الذكي على ${req.code}`);
        await reload("requirements");
        toast("طُبّق التصنيف المقترح");
        done();
      });
    } catch (err) {
      out.innerHTML = `<p class="lvl lvl-critical"><span class="dot"></span>${esc(err.message)}</p>`;
    }
  };
}

// ---------- 2) اقتراح المخاطر ----------
function renderRisk(panel, editable, done) {
  panel.innerHTML = `
    <p class="muted">اختر متطلباً أو الصق نص التزام، ليقترح المساعد مخاطره وضوابطها.</p>
    ${sel("risk-req", reqOptions(), "", { empty: "— أو اكتب النص أدناه —" })}
    ${area("risk-text", "", "أو الصق نص الالتزام هنا…", 3)}
    <div class="row" style="margin-top:10px">${runBtn("🤖 اقترح المخاطر")}</div>
    <div id="ai-out" style="margin-top:12px"></div>`;
  $("#ai-run", panel).onclick = async () => {
    const reqId = val("risk-req", panel);
    const req = store.requirements.find((r) => r.id === reqId);
    const text = req ? `${req.title}\n${req.summary || ""}` : val("risk-text", panel);
    if (!text) return toast("اختر متطلباً أو اكتب نصاً", true);
    const out = $("#ai-out", panel);
    out.innerHTML = spinnerHtml("جاري اقتراح المخاطر…");
    busy(panel);
    try {
      const r = await suggestRisks(text, (m) => (out.innerHTML = spinnerHtml(m)));
      const risks = r.risks || [];
      out.innerHTML = risks.length ? risks.map((rk, i) => {
        const lvl = riskLevel(rk.likelihood, rk.impact);
        return `<div class="card" style="margin:8px 0">
          <div class="row" style="justify-content:space-between"><strong>${esc(rk.title)}</strong>${levelBadge(lvl.key, `${lvl.label} (${lvl.score})`)}</div>
          <p class="pre-line">${esc(rk.description)}</p>
          <p class="muted">السبب: ${esc(rk.cause)} · الاحتمالية ${rk.likelihood} × الأثر ${rk.impact}</p>
          <p>${(rk.controls || []).map((c) => chip(`${c.name} (${c.type})`)).join(" ")}</p>
          ${rk.kri ? `<p class="muted">مؤشر الخطر: ${esc(rk.kri)}</p>` : ""}
          ${editable ? `<button class="secondary small" data-mkrisk="${i}">＋ إنشاء هذا الخطر</button>` : ""}
        </div>`;
      }).join("") : emptyMsg("لم تُقترح مخاطر");
      out.querySelectorAll("[data-mkrisk]").forEach((b) => b.addEventListener("click", async () => {
        const rk = risks[Number(b.dataset.mkrisk)];
        try {
          const code = await db.nextCode("RSK");
          await db.setRow("risks", code, {
            code, title: rk.title, description: rk.description || "", cause: rk.cause || "", penalty: "", fineAmount: null,
            requirementId: req?.id || null, regulationId: null, sourceArticleId: null, sourceKey: null, source: "AI_SUGGESTED",
            likelihood: rk.likelihood, impact: rk.impact, residualLikelihood: rk.likelihood, residualImpact: rk.impact,
            controls: (rk.controls || []).map((c) => ({ description: c.name, type: c.type, effectiveness: "" })),
            ownerDeptId: req?.ownerDeptId || null, treatmentOwnerId: null, treatmentPlan: "", kri: rk.kri || "", dueDate: null,
            status: "OPEN", createdAt: db.now(), updatedAt: db.now(),
          });
          await db.audit("CREATE", "Risk", code, `إنشاء خطر من اقتراح المساعد الذكي: ${rk.title}`);
          await reload("risks");
          toast(`أُنشئ الخطر ${code}`);
          b.disabled = true;
          done();
        } catch (err) { toast(err.message, true); }
      }));
    } catch (err) {
      out.innerHTML = `<p class="lvl lvl-critical"><span class="dot"></span>${esc(err.message)}</p>`;
    }
  };
}

// ---------- 3) تلخيص وثيقة ----------
function renderSummary(panel) {
  const docs = store.regulations || [];
  panel.innerHTML = `
    <p class="muted">اختر وثيقة محلَّلة أو الصق نصاً، ليُلخّصه المساعد ويستخرج التزاماته وغراماته.</p>
    ${docs.length ? sel("sum-doc", docs.map((d) => ({ id: d.id, name: d.name })), "", { empty: "— أو الصق نصاً أدناه —" }) : ""}
    ${area("sum-text", "", "الصق نص الوثيقة هنا…", 5)}
    <div class="row" style="margin-top:10px">${runBtn("🤖 لخّص الوثيقة")}</div>
    <div id="ai-out" style="margin-top:12px"></div>`;
  $("#ai-run", panel).onclick = async () => {
    const out = $("#ai-out", panel);
    let text = val("sum-text", panel);
    const docId = val("sum-doc", panel);
    out.innerHTML = spinnerHtml("جاري التلخيص…");
    busy(panel);
    try {
      if (!text && docId) {
        const doc = await db.getRow("regulations", docId).catch(() => null);
        text = doc?.text || "";
      }
      if (!text) { out.innerHTML = emptyMsg("اختر وثيقة أو الصق نصاً"); return; }
      const r = await summarizeDocument(text, (m) => (out.innerHTML = spinnerHtml(m)));
      const listBlock = (title, arr) => `<h3>${title}</h3>${(arr || []).length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : '<p class="muted">لا يوجد</p>'}`;
      out.innerHTML = `
        <h3>الملخّص التنفيذي</h3>
        <p class="pre-line">${esc(r.summary)}</p>
        ${listBlock("أبرز الالتزامات", r.keyObligations)}
        ${listBlock("الغرامات والعقوبات", r.penalties)}
        ${listBlock("توصيات الامتثال", r.recommendations)}`;
    } catch (err) {
      out.innerHTML = `<p class="lvl lvl-critical"><span class="dot"></span>${esc(err.message)}</p>`;
    }
  };
}
