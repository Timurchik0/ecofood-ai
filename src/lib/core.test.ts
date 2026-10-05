import { describe, expect, it } from "vitest";
import { parseAmount, parseContact, parseInterest } from "./parse";
import { DEFAULT_SCORING, sanitizeConfig, scoreLead } from "./scoring";
import { maskContact } from "./mask";
import { matchMulti, matchOption } from "./config";

const kg = (s: string) => parseAmount(s, "kg");
const som = (s: string) => parseAmount(s, "som");

describe("parseAmount — объём, кг", () => {
  it.each([
    ["500", 500],
    ["500 кг", 500],
    ["около 600 кг", 600],
    ["1,5 тонны", 1500],
    ["2 т", 2000],
    ["2т", 2000],
    ["1 500 кг", 1500],
    ["1.500 кг", 1500],
    ["0,5 т", 500],
    ["300-500 кг", 400],
    ["от 100 до 200", 150],
    ["1-2 тонны", 1500],
    ["50 кг в день", 1500],
    ["200 кг в неделю", 800],
    ["≈ 750 кг/мес", 750],
  ])("«%s» → %i", (input, expected) => {
    expect(kg(input).value).toBe(expected);
  });

  it("не распознаёт текст без цифр", () => {
    expect(kg("не знаю").value).toBeNull();
    expect(kg("").value).toBeNull();
    expect(kg("затрудняюсь ответить").value).toBeNull();
  });

  it("помечает подозрительно малые числа без единиц", () => {
    expect(kg("2").suspicious).toBe(true);
    expect(kg("2 тонны").suspicious).toBe(false);
    expect(kg("300").suspicious).toBe(false);
  });
});

describe("parseAmount — расходы, сом", () => {
  it.each([
    ["5000", 5000],
    ["5 000 сом", 5000],
    ["около 20 тыс.", 20000],
    ["20 тысяч сомов", 20000],
    ["20к", 20000],
    ["1,5 млн", 1_500_000],
    ["3000-5000", 4000],
    ["2000 с", 2000],
  ])("«%s» → %i", (input, expected) => {
    expect(som(input).value).toBe(expected);
  });

  it("помечает валюту и очень малые суммы", () => {
    expect(som("100 $").suspicious).toBe(true);
    expect(som("20").suspicious).toBe(true);
    expect(som("нисколько").value).toBeNull();
  });
});

describe("parseContact", () => {
  it("находит и нормализует телефон КР", () => {
    expect(parseContact("0555 123 456").phone).toBe("+996555123456");
    expect(parseContact("+996 700 11-22-33").phone).toBe("+996700112233");
    expect(parseContact("WhatsApp 996555123456").phone).toBe("+996555123456");
  });
  it("находит email и telegram", () => {
    expect(parseContact("Айбек, aibek@mail.kg").email).toBe("aibek@mail.kg");
    expect(parseContact("@aibek_kg").telegram).toBe("@aibek_kg");
  });
  it("«нет» — не контакт и не «неясно»", () => {
    const c = parseContact("нет");
    expect(c.valid).toBe(false);
    expect(c.unclear).toBe(false);
  });
  it("текст без способа связи — «неясно»", () => {
    const c = parseContact("свяжитесь с директором");
    expect(c.valid).toBe(false);
    expect(c.unclear).toBe(true);
  });
  it("пусто — не контакт", () => {
    expect(parseContact("").valid).toBe(false);
    expect(parseContact(undefined).unclear).toBe(false);
  });
});

describe("parseInterest", () => {
  it.each([
    ["Да", "yes"],
    ["да ", "yes"],
    ["Да 0555123456", "yes"],
    ["Возможно", "maybe"],
    ["Скорее да", "maybe"],
    ["Нет", "no"],
    ["не готовы", "no"],
    ["", null],
    ["посмотрим", null],
  ])("«%s» → %s", (input, expected) => {
    expect(parseInterest(input)).toBe(expected);
  });
});

describe("maskContact", () => {
  it("скрывает середину телефона и почты", () => {
    expect(maskContact("+996555123456")).toBe("+9965******56");
    expect(maskContact("aibek@mail.kg")).toBe("a***@m***.kg");
    expect(maskContact("@aibek_kg")).toBe("@a***");
  });
});

describe("matchOption / matchMulti", () => {
  it("сводит ответ к варианту или «Другое»", () => {
    expect(matchOption("ежедневно", ["Ежедневно", "1 раз в неделю"])).toBe("Ежедневно");
    expect(matchOption("раз в полгода", ["Ежедневно", "1 раз в неделю"])).toBe("Другое");
    expect(matchOption("", ["Ежедневно"])).toBeNull();
  });
  it("разбирает мультивыбор", () => {
    const opts = ["Органические остатки сырья", "Просроченная продукция"];
    expect(matchMulti("Органические остатки сырья, Просроченная продукция", opts)).toEqual(opts);
    expect(matchMulti("Просроченная продукция, жмых", opts)).toEqual(["Просроченная продукция", "Другое"]);
  });
});

describe("scoreLead — модель Динары (30/25/15/15/10/5, HOT 75+, WARM 50–74)", () => {
  const best = {
    volumeKg: 3000,
    costSom: 15000,
    frequency: "Ежедневно",
    handling: "Вывозятся вместе с коммунальными отходами",
    handover: "Да",
    hasContact: true,
  };

  it("идеальный лид = 100 баллов, HOT", () => {
    const r = scoreLead(best, DEFAULT_SCORING);
    expect(r.score).toBe(100);
    expect(r.temperature).toBe("HOT");
  });

  it("пустой лид = 0, COLD", () => {
    const r = scoreLead(
      { volumeKg: null, costSom: null, frequency: null, handling: null, handover: null, hasContact: false },
      DEFAULT_SCORING,
    );
    expect(r.score).toBe(0);
    expect(r.temperature).toBe("COLD");
  });

  it("границы объёма: <100 очень малый, 100–500 малый, 500–2000 средний, ≥2000 крупный", () => {
    const pts = (kgv: number) =>
      scoreLead({ ...best, volumeKg: kgv }, DEFAULT_SCORING).breakdown[0].points;
    expect(pts(99)).toBe(5);
    expect(pts(100)).toBe(12);
    expect(pts(499)).toBe(12);
    expect(pts(500)).toBe(22);
    expect(pts(1999)).toBe(22);
    expect(pts(2000)).toBe(30);
  });

  it("ответ «Нет» → COLD независимо от баллов, балл ограничен", () => {
    const r = scoreLead({ ...best, handover: "Нет" }, DEFAULT_SCORING);
    expect(r.temperature).toBe("COLD");
    expect(r.rawScore).toBeGreaterThanOrEqual(50);
    expect(r.score).toBe(49);
    expect(r.capped).toBe(true);
  });

  it("критерий «интервью/пилот»: Да 15, Возможно 7, Нет 0 (если вопрос есть в анкете)", () => {
    const pts = (interest: "yes" | "maybe" | "no", hasContact = true) =>
      scoreLead({ ...best, interest, hasContact }, DEFAULT_SCORING).breakdown.find((b) => b.key === "pilot")!.points;
    expect(pts("yes")).toBe(15);
    expect(pts("maybe")).toBe(7);
    expect(pts("no")).toBe(0);
    // «Да», но контакта нет — баллы за готовность сохраняются (флаг «нет контакта» ставится отдельно)
    expect(pts("yes", false)).toBe(15);
  });

  it("правило отказа можно выключить настройкой", () => {
    const cfg = { ...DEFAULT_SCORING, refusalCold: false };
    const r = scoreLead({ ...best, handover: "Нет" }, cfg);
    expect(r.capped).toBe(false);
    expect(r.temperature).not.toBe("COLD");
  });

  it("смена порогов меняет температуру без изменения данных", () => {
    const lead = { ...best, volumeKg: 300, frequency: "1 раз в неделю", costSom: 3000 };
    const before = scoreLead(lead, DEFAULT_SCORING);
    const strict = sanitizeConfig({ ...DEFAULT_SCORING, hot: 95, warm: 90 });
    const after = scoreLead(lead, strict);
    expect(after.rawScore).toBe(before.rawScore);
    expect(after.temperature).toBe("COLD");
  });

  it("смена границ объёма сдвигает баллы", () => {
    const lead = { ...best, volumeKg: 1000 };
    const a = scoreLead(lead, DEFAULT_SCORING).breakdown[0].points;
    const b = scoreLead(lead, sanitizeConfig({ ...DEFAULT_SCORING, volumeBands: [200, 600, 900] })).breakdown[0].points;
    expect(b).toBeGreaterThan(a);
  });

  it("баллы приводятся к 100, даже если сумма весов другая", () => {
    const cfg = sanitizeConfig({
      ...DEFAULT_SCORING,
      weights: { volume: 60, handover: 50, frequency: 30, pilot: 30, cost: 20, handling: 10 },
    });
    expect(scoreLead(best, cfg).score).toBe(100);
  });
});

describe("sanitizeConfig", () => {
  it("чинит мусор и порядок границ", () => {
    const c = sanitizeConfig({ hot: "40", warm: "80", volumeBands: [900, 100, 500], costBands: ["x", 1, 2] });
    expect(c.hot).toBe(80);
    expect(c.warm).toBe(40);
    expect(c.volumeBands).toEqual([100, 500, 900]);
    expect(c.costBands[0]).toBeLessThanOrEqual(c.costBands[1]);
  });
  it("пустой ввод даёт дефолты", () => {
    expect(sanitizeConfig(null)).toEqual(DEFAULT_SCORING);
  });
});
