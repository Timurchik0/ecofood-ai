// Варианты ответов — зеркало реальной Google-формы (11 вопросов).
// Пороги и веса скоринга здесь НЕ хранятся: они лежат в базе (таблица settings)
// и меняются на странице /admin без правки кода. См. scoring.ts.

export const APP_NAME = "EcoFood AI";

export const OTHER = "Другое";

export const REGIONS = [
  "г. Бишкек",
  "г. Ош",
  "Чуйская область",
  "Ошская область",
  "Джалал-Абадская область",
  "Иссык-Кульская область",
  "Нарынская область",
  "Таласская область",
  "Баткенская область",
] as const;

export const ACTIVITIES = [
  "Хлебобулочное и мучное производство",
  "Переработка фруктов и овощей",
  "Молочное производство",
  "Кондитерское производство",
  "Мясное производство",
  "Рестораны / кафе / столовые / кейтеринг",
  "Пищевая торговля / супермаркеты",
] as const;

export const WASTE_TYPES = [
  "Органические остатки сырья",
  "Остатки/брак готовой продукции",
  "Просроченная продукция",
  "Остатки готовой пищи",
] as const;

export const FREQUENCIES = [
  "Ежедневно",
  "2–3 раза в неделю",
  "1 раз в неделю",
  "Несколько раз в месяц",
  "По мере накопления",
] as const;

export const HANDLING = [
  "Вывозятся вместе с коммунальными отходами",
  "Передаются специализированной организации",
  "Передаются другим лицам/организациям",
  "Перерабатываются/используются самим предприятием",
] as const;

export const HANDOVER = ["Да", "Зависит от условий", "Нет"] as const;

export const PRIORITIES = [
  "Цена",
  "Регулярность вывоза",
  "Документы",
  "Экологический эффект",
  "Удобство и скорость вывоза",
] as const;

// Статусы воронки CRM
export const STATUSES = [
  { id: "new", label: "Новая" },
  { id: "contacted", label: "Контакт" },
  { id: "interview", label: "Интервью" },
  { id: "pilot", label: "Пилот" },
  { id: "closed", label: "Закрыта" },
  { id: "rejected", label: "Отказ" },
] as const;

export type StatusId = (typeof STATUSES)[number]["id"];

export const statusLabel = (id: string) =>
  STATUSES.find((s) => s.id === id)?.label ?? id;

export const isStatusId = (v: string): v is StatusId =>
  STATUSES.some((s) => s.id === v);

const norm = (s: string) =>
  s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

/** Приводит свободный ответ к одному из известных вариантов (или к «Другое»). */
export function matchOption(
  value: string | null | undefined,
  options: readonly string[],
): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const nv = norm(v);
  const exact = options.find((o) => norm(o) === nv);
  if (exact) return exact;
  const inc = options.find((o) => nv.includes(norm(o)) || norm(o).includes(nv));
  return inc ?? OTHER;
}

/** Мультивыбор («Органические остатки сырья, Просроченная продукция, ...»). */
export function matchMulti(
  value: string | null | undefined,
  options: readonly string[],
): string[] {
  const v = (value ?? "").trim();
  if (!v) return [];
  let rest = norm(v);
  const found: string[] = [];
  for (const o of options) {
    const no = norm(o);
    if (rest.includes(no)) {
      found.push(o);
      rest = rest.replace(no, " ");
    }
  }
  const leftover = rest.replace(/[,;/\s]+/g, " ").trim();
  if (leftover) found.push(OTHER);
  return found;
}
