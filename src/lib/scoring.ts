// Прозрачная rule-based модель квалификации лида (0–100 баллов).
// Все пороги и веса — в ScoringConfig. Конфиг хранится в базе (таблица settings),
// правится на странице /admin, а балл пересчитывается из сохранённых ответов,
// поэтому исходные данные заявок при смене порогов не меняются.

export type Criterion =
  | "volume"
  | "handover"
  | "frequency"
  | "pilot"
  | "cost"
  | "handling";

export type Temperature = "HOT" | "WARM" | "COLD";

export type ScoringConfig = {
  weights: Record<Criterion, number>;
  /** Нижняя граница HOT и WARM (по шкале 0–100) */
  hot: number;
  warm: number;
  /** Границы объёма, кг/мес: до [0] — очень малый, [0]–[1] — малый, [1]–[2] — средний, от [2] — крупный */
  volumeBands: [number, number, number];
  /** Границы расходов, сом/мес: до [0] — низкие, [0]–[1] — средние, [1]–[2] — высокие, от [2] — очень высокие */
  costBands: [number, number, number];
  /** Если предприятие ответило «Нет» на передачу отходов — лид автоматически COLD */
  refusalCold: boolean;
};

export const DEFAULT_SCORING: ScoringConfig = {
  weights: { volume: 30, handover: 25, frequency: 15, pilot: 15, cost: 10, handling: 5 },
  hot: 75,
  warm: 50,
  volumeBands: [100, 500, 2000],
  costBands: [2000, 5000, 10000],
  refusalCold: true,
};

export const CRITERIA_LABELS: Record<Criterion, string> = {
  volume: "Объём отходов",
  handover: "Готовность передавать",
  frequency: "Регулярность вывоза",
  pilot: "Интервью / пилот",
  cost: "Расходы на вывоз",
  handling: "Текущий способ",
};

// Доли от максимального веса критерия по градациям ответа.
// (Сам вес и границы градаций — настраиваемые, эти доли — экспертные константы модели.)
const VOLUME_SHARES = [0.17, 0.4, 0.73, 1];
const VOLUME_LABELS = ["очень малый", "малый", "средний", "крупный"];
const COST_SHARES = [0.2, 0.5, 0.8, 1];
const COST_LABELS = ["низкие", "средние", "высокие", "очень высокие"];

export type LeadScoreInput = {
  volumeKg: number | null;
  costSom: number | null;
  frequency: string | null;
  handling: string | null;
  handover: string | null;
  hasContact: boolean;
  /** Готовность к интервью/пилоту (вопрос анкеты). Если вопроса в анкете нет — null, тогда смотрим на контакт. */
  interest?: "yes" | "maybe" | "no" | null;
};

export type CriterionResult = {
  key: Criterion;
  label: string;
  points: number;
  max: number;
  reason: string;
};

export type ScoreResult = {
  score: number;
  /** Балл до применения правила отказа */
  rawScore: number;
  temperature: Temperature;
  breakdown: CriterionResult[];
  capped: boolean;
};

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");

function bandIndex(value: number, bands: [number, number, number]): number {
  if (value < bands[0]) return 0;
  if (value < bands[1]) return 1;
  if (value < bands[2]) return 2;
  return 3;
}

function bandRange(i: number, bands: [number, number, number], unit: string): string {
  if (i === 0) return `до ${fmt(bands[0])} ${unit}`;
  if (i === 3) return `от ${fmt(bands[2])} ${unit}`;
  return `${fmt(bands[i - 1])}–${fmt(bands[i])} ${unit}`;
}

function frequencyShare(v: string | null): { share: number; label: string } {
  const n = norm(v);
  if (!n) return { share: 0, label: "не указано" };
  if (n.includes("ежедневно")) return { share: 1, label: "ежедневно" };
  if (/2\s*[–-]\s*3/.test(n)) return { share: 0.8, label: "2–3 раза в неделю" };
  if (n.includes("в недел")) return { share: 0.53, label: "раз в неделю" };
  if (n.includes("в месяц")) return { share: 0.33, label: "несколько раз в месяц" };
  if (n.includes("по мере")) return { share: 0.2, label: "по мере накопления" };
  return { share: 0.2, label: "другое" };
}

function handlingShare(v: string | null): { share: number; label: string } {
  const n = norm(v);
  if (!n) return { share: 0, label: "не указано" };
  if (n.includes("коммунальн")) return { share: 1, label: "вместе с коммунальными отходами (нет текущего решения)" };
  if (n.includes("другим лицам") || n.includes("другим")) return { share: 0.6, label: "передаются другим лицам" };
  if (n.includes("специализирован")) return { share: 0.4, label: "уже есть спецорганизация" };
  if (n.includes("перерабатыва")) return { share: 0, label: "перерабатывают сами" };
  return { share: 0.4, label: "другое" };
}

function handoverShare(v: string | null): { share: number; label: string } {
  const n = norm(v);
  if (!n) return { share: 0, label: "не указано" };
  if (n === "да") return { share: 1, label: "да" };
  if (n.includes("скорее да")) return { share: 0.72, label: "скорее да" };
  if (n.includes("зависит")) return { share: 0.48, label: "зависит от условий" };
  if (n === "нет" || n.startsWith("нет")) return { share: 0, label: "нет" };
  return { share: 0.3, label: "другое" };
}

export function scoreLead(input: LeadScoreInput, cfg: ScoringConfig): ScoreResult {
  const w = cfg.weights;
  const breakdown: CriterionResult[] = [];
  const add = (key: Criterion, share: number, reason: string) => {
    const max = w[key];
    breakdown.push({
      key,
      label: CRITERIA_LABELS[key],
      points: Math.round(max * Math.max(0, Math.min(1, share))),
      max,
      reason,
    });
  };

  // 1. Объём
  if (input.volumeKg == null) {
    add("volume", 0, "объём не указан или не распознан — нужно уточнить вручную");
  } else {
    const i = bandIndex(input.volumeKg, cfg.volumeBands);
    add(
      "volume",
      VOLUME_SHARES[i],
      `${fmt(input.volumeKg)} кг/мес — ${VOLUME_LABELS[i]} (${bandRange(i, cfg.volumeBands, "кг")})`,
    );
  }

  // 2. Готовность передавать отходы переработчику
  const ho = handoverShare(input.handover);
  add("handover", ho.share, `ответ: ${ho.label}`);

  // 3. Регулярность вывоза
  const fr = frequencyShare(input.frequency);
  add("frequency", fr.share, `вывоз: ${fr.label}`);

  // 4. Интервью / пилот: ответ «Да / Возможно / Нет»; если такого вопроса нет — считаем по наличию контакта
  if (input.interest) {
    const share = { yes: 1, maybe: 0.47, no: 0 }[input.interest];
    const text = { yes: "да", maybe: "возможно", no: "нет" }[input.interest];
    add("pilot", share, `готовность к интервью/пилоту: ${text}${input.hasContact ? ", контакт оставлен" : ", контакта нет"}`);
  } else {
    add(
      "pilot",
      input.hasContact ? 1 : 0,
      input.hasContact ? "оставил контакт для связи" : "контакт не оставлен",
    );
  }

  // 5. Расходы на вывоз
  if (input.costSom == null) {
    add("cost", 0, "расходы не указаны или не распознаны");
  } else {
    const i = bandIndex(input.costSom, cfg.costBands);
    add(
      "cost",
      COST_SHARES[i],
      `${fmt(input.costSom)} сом/мес — ${COST_LABELS[i]} (${bandRange(i, cfg.costBands, "сом")})`,
    );
  }

  // 6. Текущий способ обращения с отходами
  const hd = handlingShare(input.handling);
  add("handling", hd.share, hd.label);

  const totalMax = breakdown.reduce((s, b) => s + b.max, 0) || 1;
  const totalPts = breakdown.reduce((s, b) => s + b.points, 0);
  const rawScore = Math.round((totalPts / totalMax) * 100);

  let score = rawScore;
  let capped = false;
  const refused = cfg.refusalCold && ho.label === "нет";
  if (refused && score >= cfg.warm) {
    score = Math.max(0, cfg.warm - 1);
    capped = true;
  }

  const temperature: Temperature = refused
    ? "COLD"
    : score >= cfg.hot
      ? "HOT"
      : score >= cfg.warm
        ? "WARM"
        : "COLD";

  return { score, rawScore, temperature, breakdown, capped };
}

/** Приводит конфиг из формы/БД к допустимому виду (числа, порядок границ). */
export function sanitizeConfig(input: unknown): ScoringConfig {
  const d = DEFAULT_SCORING;
  const src = (input ?? {}) as Partial<ScoringConfig>;
  const num = (v: unknown, fb: number, min = 0, max = 1e9) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb;
  };
  const trio = (v: unknown, fb: [number, number, number]): [number, number, number] => {
    const a = Array.isArray(v) ? v : [];
    const t = [num(a[0], fb[0]), num(a[1], fb[1]), num(a[2], fb[2])].sort((x, y) => x - y);
    return [t[0], t[1], t[2]];
  };
  const weights = { ...d.weights };
  (Object.keys(weights) as Criterion[]).forEach((k) => {
    weights[k] = num(src.weights?.[k], d.weights[k], 0, 100);
  });
  let hot = num(src.hot, d.hot, 1, 100);
  let warm = num(src.warm, d.warm, 1, 100);
  if (warm > hot) [hot, warm] = [warm, hot];
  return {
    weights,
    hot,
    warm,
    volumeBands: trio(src.volumeBands, d.volumeBands),
    costBands: trio(src.costBands, d.costBands),
    refusalCold: src.refusalCold === undefined ? d.refusalCold : Boolean(src.refusalCold),
  };
}
