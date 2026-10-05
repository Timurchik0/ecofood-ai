import { isAdmin } from "@/lib/admin";
import { listLeads } from "@/lib/leads";
import { statusLabel } from "@/lib/config";

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Выгрузка всех заявок в CSV (только админ — внутри контакты). */
export async function GET() {
  if (!(await isAdmin())) return new Response("unauthorized", { status: 401 });
  const leads = await listLeads({ includeDemo: true }, 1000);
  const head = [
    "Дата", "Компания", "Регион", "Вид деятельности", "Типы отходов", "Объём (ответ)", "Объём, кг/мес",
    "Частота вывоза", "Текущий способ", "Расходы (ответ)", "Расходы, сом/мес", "Передача переработчику",
    "Важно при выборе", "Контакт", "Балл", "Статус", "CRM", "AI: следующий шаг", "Источник",
  ];
  const rows = leads.map((l) => [
    l.createdAt.toISOString(), l.company, l.region, l.activityOther ?? l.activity, l.wasteTypes.join("; "),
    l.volumeRaw, l.volumeKg, l.frequency, l.handling, l.costRaw, l.costSom, l.handover, l.priority,
    l.contactRaw, l.score, l.temperature, statusLabel(l.status), l.aiNextStep, l.source,
  ]);
  const csv = "﻿" + [head, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="ecofood-leads.csv"',
    },
  });
}
