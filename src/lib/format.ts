export const num = (n: number | null | undefined, digits = 0) =>
  n == null || Number.isNaN(n)
    ? "—"
    : n.toLocaleString("ru-RU", { maximumFractionDigits: digits });

/** Килограммы → «1 200 кг» или «3,2 т» */
export function kgText(kg: number | null | undefined): string {
  if (kg == null) return "—";
  return kg >= 10_000 ? `${num(kg / 1000, 1)} т` : `${num(kg)} кг`;
}

export const somText = (v: number | null | undefined) => (v == null ? "—" : `${num(v)} сом`);

export function dateText(d: Date | null | undefined, withTime = false): string {
  if (!d) return "—";
  return d.toLocaleString("ru-RU", {
    timeZone: "Asia/Bishkek",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function relativeDay(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  return `${days} дн. назад`;
}

/** Склонение: plural(5, ["заявка", "заявки", "заявок"]) */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/** Последние n дней (по Бишкеку) в виде YYYY-MM-DD, от старых к новым. */
export function lastDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(Date.now() - i * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Asia/Bishkek" }));
  }
  return out;
}
