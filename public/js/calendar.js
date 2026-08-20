// مزامنة التقويم للاجتماعات — توليد ملفات iCalendar (.ics) وروابط Google Calendar
// يعمل محلياً في المتصفح بلا خادم: كل اجتماع (أو كل الاجتماعات) يمكن إضافته لتقويم المستخدم.
import { deptName } from "./state.js";

const RRULE = {
  WEEKLY: "FREQ=WEEKLY",
  BIWEEKLY: "FREQ=WEEKLY;INTERVAL=2",
  MONTHLY: "FREQ=MONTHLY",
};

// تنسيق التاريخ لـ iCalendar بتوقيت UTC: YYYYMMDDTHHMMSSZ
function icsStamp(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

// نهاية الاجتماع = البداية + المدة (دقائق، افتراضياً 60)
function endStamp(startIso, durationMin) {
  const end = new Date(new Date(startIso).getTime() + (Number(durationMin) || 60) * 60000);
  return icsStamp(end.toISOString());
}

// تهريب النص وفق RFC 5545 (الفواصل والفواصل المنقوطة وأسطر جديدة)
function esc(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function meetingSummary(m) {
  return m.title || "اجتماع";
}
function meetingDescription(m) {
  const parts = [];
  if (m.agenda) parts.push(`جدول الأعمال:\n${m.agenda}`);
  if (m.attendees) parts.push(`الحضور: ${m.attendees}`);
  if (m.departmentId) parts.push(`الإدارة: ${deptName(m.departmentId)}`);
  return parts.join("\n\n");
}

// كتلة VEVENT واحدة لاجتماع
function vevent(m) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${m.id || m.code || icsStamp(m.startAt)}@cms-hhc`,
    `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    `DTSTART:${icsStamp(m.startAt)}`,
    `DTEND:${endStamp(m.startAt, m.durationMin)}`,
    `SUMMARY:${esc(meetingSummary(m))}`,
  ];
  const desc = meetingDescription(m);
  if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
  if (m.location) lines.push(`LOCATION:${esc(m.location)}`);
  if (m.recurrence && RRULE[m.recurrence]) lines.push(`RRULE:${RRULE[m.recurrence]}`);
  lines.push(`STATUS:${m.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED"}`);
  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

// ملف iCalendar كامل لاجتماع واحد أو مجموعة اجتماعات
export function buildICS(meetings) {
  const list = Array.isArray(meetings) ? meetings : [meetings];
  const body = list.filter((m) => m.startAt).map(vevent).join("\r\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CMS-HHC//Compliance//AR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", body, "END:VCALENDAR"].join("\r\n");
}

// رابط إضافة الاجتماع مباشرةً إلى Google Calendar
export function googleCalUrl(m) {
  const dates = `${icsStamp(m.startAt)}/${endStamp(m.startAt, m.durationMin)}`;
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: meetingSummary(m),
    dates,
    details: meetingDescription(m),
    location: m.location || "",
  });
  let url = `https://calendar.google.com/calendar/render?${p.toString()}`;
  if (m.recurrence && RRULE[m.recurrence]) url += `&recur=${encodeURIComponent("RRULE:" + RRULE[m.recurrence])}`;
  return url;
}

// تنزيل ملف .ics في المتصفح
export function downloadICS(filename, content) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
