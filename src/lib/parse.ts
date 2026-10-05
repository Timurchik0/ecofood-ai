// Разбор свободного текста из анкеты: объём (кг), расходы (сом), контакт.
// Люди пишут «500», «1,5 тонны», «около 20 тыс.», «300-500 кг», «50 кг в день» —
// парсер приводит это к числу «в месяц». Если число не распознано, возвращает null,
// и заявка помечается «проверить вручную» (а AI пробует разобрать текст сам).

export type Amount = {
  value: number | null;
  /** Что именно мы сделали с текстом (диапазон, пересчёт периода и т.п.) */
  notes: string[];
  /** Число есть, но похоже на ошибку единиц (например, «2» в поле «кг») */
  suspicious: boolean;
};

type Kind = "kg" | "som";

type Token = { value: number; start: number; end: number; mult: number | null };

const TOKEN = /(\d{1,3}(?:[  ]\d{3})+|\d+)(?:([.,])(\d+))?/g;
const UNIT = /^\s*(кг|килограмм\S*|kg|тонн\S*|тн|тыс\S*|млн\S*|сом\S*|литр\S*|руб\S*|т|к|с|л|г|гр)(?![а-яёa-z])/i;

function unitMult(unit: string, kind: Kind): number | null {
  const u = unit.toLowerCase();
  if (u.startsWith("млн")) return 1_000_000;
  if (u.startsWith("тыс") || u === "к") return 1000;
  if (kind === "kg") {
    if (u.startsWith("тонн") || u === "тн" || u === "т") return 1000;
    if (u === "г" || u === "гр") return 0.001;
    if (u === "кг" || u.startsWith("килограмм") || u === "kg" || u === "л" || u.startsWith("литр")) return 1;
    return null;
  }
  if (u === "т") return 1000; // «20 т» в графе «сом» — скорее всего «тыс.»
  if (u.startsWith("сом") || u === "с") return 1;
  return null;
}

function numberOf(m: RegExpExecArray): number {
  const intStr = m[1].replace(/[  ]/g, "");
  if (m[2]) {
    const thousands =
      m[3].length === 3 && intStr.length <= 3 && intStr !== "0" && !m[1].includes(" ");
    return Number(thousands ? intStr + m[3] : `${intStr}.${m[3]}`);
  }
  return Number(intStr);
}

export function parseAmount(raw: string | null | undefined, kind: Kind): Amount {
  const s = (raw ?? "").replace(/ё/g, "е").trim();
  const empty: Amount = { value: null, notes: [], suspicious: false };
  if (!s) return empty;

  const tokens: Token[] = [];
  for (const m of s.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    tokens.push({ value: numberOf(m as RegExpExecArray), start, end: start + m[0].length, mult: null });
  }
  if (tokens.length === 0) return empty;

  tokens.forEach((t, i) => {
    const rest = s.slice(t.end, tokens[i + 1]?.start ?? s.length);
    const u = UNIT.exec(rest);
    t.mult = u ? unitMult(u[1], kind) : null;
  });

  // Диапазон: «300-500», «от 100 до 200 кг» → берём середину
  const notes: string[] = [];
  const group = [tokens[0]];
  for (let i = 1; i < tokens.length; i++) {
    const gap = s.slice(tokens[i - 1].end, tokens[i].start);
    if (/^\s*(?:[-–—~]|до|to)\s*(?:до)?\s*$/i.test(gap)) group.push(tokens[i]);
    else break;
  }
  const groupMult = [...group].reverse().find((t) => t.mult != null)?.mult ?? null;
  const vals = group.map((t) => t.value * (t.mult ?? groupMult ?? 1));
  let value = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (group.length > 1) notes.push(`диапазон ${vals.map((v) => Math.round(v)).join("–")} → взята середина`);
  else if (tokens.length > 1) notes.push("в ответе несколько чисел — взято первое");

  // Период: «50 кг в день» → ×30
  const lower = s.toLowerCase();
  if (/в\s*(день|сутки)|\/\s*(день|сутк)|ежедневн/.test(lower) && !/мес/.test(lower)) {
    value *= 30;
    notes.push("пересчитано из «в день» ×30");
  } else if (/в\s*недел|\/\s*недел|еженедельн/.test(lower) && !/мес/.test(lower)) {
    value *= 4;
    notes.push("пересчитано из «в неделю» ×4");
  } else if (/в\s*год|\/\s*год|ежегодн/.test(lower)) {
    value /= 12;
    notes.push("пересчитано из «в год» ÷12");
  }

  const hasUnit = group.some((t) => t.mult != null);
  let suspicious = false;
  if (kind === "kg" && !hasUnit && value <= 10) {
    suspicious = true;
    notes.push("очень малое число без единиц — возможно, указаны тонны");
  }
  if (kind === "som" && !hasUnit && value < 100) {
    suspicious = true;
    notes.push("очень малое число — возможно, указаны тысячи сом");
  }
  if (kind === "som" && /\$|usd|долл|руб|₽|€|евро/.test(lower)) {
    suspicious = true;
    notes.push("указана не сомовая сумма — проверьте валюту");
  }

  return { value: Math.round(value), notes, suspicious };
}

export type Interest = "yes" | "maybe" | "no";

/** «Да», «Да 0555…», «Возможно», «Нет» → yes / maybe / no. Остальное — null. */
export function parseInterest(raw: string | null | undefined): Interest | null {
  const s = (raw ?? "").toLowerCase().replace(/ё/g, "е").trim();
  if (!s) return null;
  if (/^(скорее да|возможно|может быть|наверное|пока не знаю|зависит)/.test(s)) return "maybe";
  if (/^(да|yes|готов)/.test(s)) return "yes";
  if (/^(нет|не |no)/.test(s)) return "no";
  return null;
}

export type Contact = {
  phone: string | null;
  email: string | null;
  telegram: string | null;
  /** Есть распознаваемый способ связаться */
  valid: boolean;
  /** Что-то написано, но связаться по этому нельзя (и это не «нет») */
  unclear: boolean;
};

const NEGATIVE = /^(нет|не|no|-|—|–|\.+|н\/а|не готов\w*)(\s|$|[.,!])/i;

function normPhone(digits: string): string {
  if (digits.length === 12 && digits.startsWith("996")) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return `+996${digits.slice(1)}`;
  if (digits.length === 9) return `+996${digits}`;
  return digits.length >= 10 ? `+${digits}` : digits;
}

export function parseContact(raw: string | null | undefined): Contact {
  const s = (raw ?? "").trim();
  const none: Contact = { phone: null, email: null, telegram: null, valid: false, unclear: false };
  if (!s) return none;

  const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(s)?.[0] ?? null;
  const withoutEmail = email ? s.replace(email, " ") : s;
  const phoneMatch = /\+?\d[\d\s().-]{5,}\d/.exec(withoutEmail)?.[0];
  const digits = phoneMatch ? phoneMatch.replace(/\D/g, "") : "";
  const phone = digits.length >= 7 ? normPhone(digits) : null;
  const telegram = /(?:^|[\s(])@([A-Za-z0-9_]{4,})/.exec(withoutEmail)?.[1];
  const tg = telegram ? `@${telegram}` : null;

  const valid = Boolean(phone || email || tg);
  return {
    phone,
    email,
    telegram: tg,
    valid,
    unclear: !valid && !NEGATIVE.test(s),
  };
}
