// Приём заявки: «сырые» ответы (названия вопросов Google-формы → значения) →
// разбор свободного текста → скоринг → запись в базу.
// Колонки сопоставляются по ключевым словам в названии вопроса, поэтому мелкие
// правки формулировок в форме ничего не ломают.

import { createHash } from "node:crypto";
import {
  ACTIVITIES,
  FREQUENCIES,
  HANDLING,
  HANDOVER,
  OTHER,
  PRIORITIES,
  REGIONS,
  WASTE_TYPES,
  matchMulti,
  matchOption,
} from "./config";
import { parseAmount, parseContact, parseInterest } from "./parse";
import type { Interest } from "./parse";
import { scoreLead } from "./scoring";
import type { ScoringConfig } from "./scoring";
import { getConfig, insertLead } from "./leads";
import type { Flag, Lead, NewLead } from "./leads";

export type RawAnswers = Record<string, string | string[] | number | null | undefined>;

type Field =
  | "contact"
  | "interest"
  | "handover"
  | "priority"
  | "cost"
  | "frequency"
  | "handling"
  | "wasteTypes"
  | "volume"
  | "region"
  | "activity"
  | "company"
  | "timestamp";

// Порядок важен: более специфичные правила — выше.
const RULES: [Field, RegExp][] = [
  ["timestamp", /отметка времени|timestamp/i],
  // контакт: новое отдельное поле «оставьте контакт и имя контактного лица» и старый объединённый вопрос
  ["contact", /контактного лица|оставьте,?\s+(пожалуйста,?\s+)?контакт/i],
  // готовность к интервью/пилоту (Да / Возможно / Нет)
  ["interest", /интервью|пилот|готовы ли вы/i],
  ["handover", /рассмотрели бы|переработчик\S* .*сократить|передач\S* пищевых отходов специализ/i],
  ["priority", /наиболее важно|при выборе переработчика/i],
  ["cost", /тратит|сумм\S* в сом|расход/i],
  ["frequency", /как часто|частот/i],
  ["handling", /как сейчас|вывоз\/передач/i],
  ["wasteTypes", /какие пищевые отходы|преимущественно образу/i],
  ["volume", /объ[её]м/i],
  ["region", /регион/i],
  ["activity", /вид деятельности/i],
  ["company", /название/i],
];

const CANONICAL = new Set<string>([
  "contact", "interest", "handover", "priority", "cost", "frequency", "handling",
  "wasteTypes", "volume", "region", "activity", "company", "timestamp",
]);

export type Mapped = Partial<Record<Field, string>>;

export function mapAnswers(raw: RawAnswers): Mapped {
  const out: Mapped = {};
  for (const [key, val] of Object.entries(raw)) {
    const text = Array.isArray(val) ? val.join(", ") : val == null ? "" : String(val);
    let field: Field | undefined;
    if (CANONICAL.has(key)) field = key as Field;
    else field = RULES.find(([, re]) => re.test(key))?.[0];
    if (!field) continue;
    // если несколько столбцов попали в одно поле: контакты склеиваем (в таблице может быть старый и новый столбец),
    // у остальных полей берём первый непустой
    const value = text.trim();
    if (!value) continue;
    if (!out[field]) out[field] = value;
    else if (field === "contact" && !out[field]!.includes(value)) out[field] = `${out[field]}; ${value}`;
  }
  return out;
}

/** «04.10.2026 14:23:11» (ru), «10/4/2026 2:23:11 PM» (en) или ISO → Date. Время в таблице — Бишкек (UTC+6). */
export function parseTimestamp(s: string | undefined | null): Date | null {
  const v = (s ?? "").trim();
  if (!v) return null;
  const ru = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(v);
  if (ru) {
    const [, d, m, y, hh = "0", mi = "0", ss = "0"] = ru;
    return new Date(Date.UTC(+y, +m - 1, +d, +hh - 6, +mi, +ss));
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i.exec(v);
  if (us) {
    let hh = +(us[4] ?? 0);
    if (us[7]?.toUpperCase() === "PM" && hh < 12) hh += 12;
    if (us[7]?.toUpperCase() === "AM" && hh === 12) hh = 0;
    return new Date(Date.UTC(+us[3], +us[1] - 1, +us[2], hh - 6, +(us[5] ?? 0), +(us[6] ?? 0)));
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t);
}

export function stableId(prefix: string, ...parts: (string | undefined)[]): string {
  const h = createHash("sha1").update(parts.map((p) => (p ?? "").trim().toLowerCase()).join("|")).digest("hex");
  return `${prefix}:${h.slice(0, 24)}`;
}

const cut = (s: string | undefined, n = 400) => {
  const v = (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  return v || null;
};

const LEADING_INTEREST = /^(скорее да|да|возможно|нет)[\s,.:;—-]*/i;

/**
 * Готовность к интервью/пилоту и контакт. Бывает так, что в столбце «контакт» написано «Да 0555…»
 * (старая объединённая форма) — тогда «Да» идёт в готовность, а номер — в контакт.
 */
export function readInterestAndContact(m: Mapped): { interest: Interest | null; contactText: string } {
  const interestRaw = m.interest?.trim() ?? "";
  const contactRaw = m.contact?.trim() ?? "";
  const interest = parseInterest(interestRaw || contactRaw);
  const contactText = [contactRaw, /\d{6}|@/.test(interestRaw) ? interestRaw : ""]
    .map((s) => s.replace(LEADING_INTEREST, "").trim())
    .filter(Boolean)
    .join("; ");
  return { interest, contactText };
}

export type IngestInput = {
  answers: RawAnswers;
  source: "google_form" | "app_form" | "csv" | "demo";
  externalId?: string | null;
  isDemo?: boolean;
  createdAt?: Date | null;
  status?: string;
  config?: ScoringConfig;
};

export type IngestResult =
  | { ok: true; lead: Lead }
  | { ok: false; duplicate: true }
  | { ok: false; duplicate?: false; error: string };

export async function ingest(input: IngestInput): Promise<IngestResult> {
  const m = mapAnswers(input.answers);
  const company = cut(m.company, 200);
  if (!company) return { ok: false, error: "Не указано название предприятия" };

  const cfg = input.config ?? (await getConfig());

  const volume = parseAmount(m.volume, "kg");
  const cost = parseAmount(m.cost, "som");
  const { interest, contactText } = readInterestAndContact(m);
  const contact = parseContact(contactText);

  const regionMatched = matchOption(m.region, REGIONS);
  const activity = matchOption(m.activity, ACTIVITIES);
  const handover = matchOption(m.handover, HANDOVER);
  const frequency = matchOption(m.frequency, FREQUENCIES);
  const handling = matchOption(m.handling, HANDLING);
  const priority = matchOption(m.priority, PRIORITIES);
  const wasteTypes = matchMulti(m.wasteTypes, WASTE_TYPES);

  const flags: Flag[] = [];
  const hasVol = Boolean(m.volume?.trim());
  const hasCost = Boolean(m.cost?.trim());
  if (!hasVol) flags.push({ code: "volume_missing", text: "объём не указан", review: true });
  else if (volume.value == null) flags.push({ code: "volume_unparsed", text: `объём не распознан: «${cut(m.volume, 60)}»`, review: true });
  else if (volume.suspicious) flags.push({ code: "volume_suspicious", text: volume.notes.at(-1) ?? "объём подозрителен", review: true });
  if (!hasCost) flags.push({ code: "cost_missing", text: "расходы не указаны", review: false });
  else if (cost.value == null) flags.push({ code: "cost_unparsed", text: `расходы не распознаны: «${cut(m.cost, 60)}»`, review: true });
  else if (cost.suspicious) flags.push({ code: "cost_suspicious", text: cost.notes.at(-1) ?? "сумма подозрительна", review: true });
  if (!contactText || (!contact.valid && !contact.unclear)) {
    flags.push({ code: "no_contact", text: "нет контакта — связаться нельзя, нужен другой канал", review: false });
  } else if (contact.unclear) {
    flags.push({ code: "contact_unclear", text: "контакт не распознан — проверьте вручную", review: true });
  }
  for (const n of [...volume.notes, ...cost.notes]) {
    if (/диапазон|пересчитано|несколько чисел/.test(n)) flags.push({ code: "note", text: n, review: false });
  }

  const score = scoreLead(
    {
      volumeKg: volume.value,
      costSom: cost.value,
      frequency,
      handling,
      handover,
      hasContact: contact.valid,
      interest,
    },
    cfg,
  );

  const lead: NewLead = {
    source: input.source,
    externalId: input.externalId ?? null,
    isDemo: input.isDemo ?? false,
    createdAt: input.createdAt ?? parseTimestamp(m.timestamp),
    company,
    region: regionMatched === OTHER ? cut(m.region) : regionMatched,
    activity,
    activityOther: activity === OTHER ? cut(m.activity) : null,
    wasteTypes,
    volumeRaw: cut(m.volume, 120),
    volumeKg: volume.value,
    frequency,
    handling,
    costRaw: cut(m.cost, 120),
    costSom: cost.value,
    handover,
    priority,
    contactRaw: cut(contactText, 200),
    contactPhone: contact.phone,
    contactEmail: contact.email,
    contactOk: contact.valid,
    interest,
    score,
    flags,
    status: input.status ?? "new",
    answers: Object.fromEntries(
      Object.entries(input.answers).map(([k, v]) => [k.slice(0, 200), Array.isArray(v) ? v.join(", ") : v]),
    ),
  };

  const saved = await insertLead(lead);
  return saved ? { ok: true, lead: saved } : { ok: false, duplicate: true };
}
