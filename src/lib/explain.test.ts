import { describe, expect, it } from "vitest";
import { metricHelp as rawHelp } from "./explain";
import type { ScoringConfig } from "./scoring";
import { DEFAULT_SCORING, sanitizeConfig } from "./scoring";

// toLocaleString("ru-RU") ставит неразрывные пробелы в числах («2 000») — для сравнения приводим к обычным
const metricHelp = (cfg: ScoringConfig, demo: boolean) =>
  Object.fromEntries(
    Object.entries(rawHelp(cfg, demo)).map(([k, v]) => [k, v.replace(/[  ]/g, " ")]),
  ) as ReturnType<typeof rawHelp>;

describe("metricHelp — подсказки берут значения из настроек", () => {
  it("по умолчанию: пороги 75/50, границы и баллы по критериям", () => {
    const h = metricHelp(DEFAULT_SCORING, false);
    expect(h.hot).toContain("от 75 до 100");
    expect(h.warm).toContain("от 50 до 74");
    expect(h.cold).toContain("ниже 50");
    expect(h.colStatus).toContain("HOT — от 75 баллов");
    // объём: веса 30 → 5/12/22/30 б. при границах 100/500/2000
    expect(h.colVolume).toContain("до 100 кг — 5 б.");
    expect(h.colVolume).toContain("от 2 000 — 30 б.");
    // расходы: вес 10 → 2/5/8/10 б.
    expect(h.colCost).toContain("до 2 000 сом — 2 б.");
    expect(h.colCost).toContain("от 10 000 — 10 б.");
    expect(h.colReadiness).toContain("«Зависит от условий» — 12 б.");
    expect(h.colScore).toContain("объём 30");
    expect(h.colScore).not.toContain("сумма весов");
  });

  it("после смены настроек подсказки показывают новые значения", () => {
    const cfg = sanitizeConfig({
      ...DEFAULT_SCORING,
      hot: 85,
      warm: 60,
      volumeBands: [200, 800, 3000],
      weights: { ...DEFAULT_SCORING.weights, volume: 40 },
      refusalCold: false,
    });
    const h = metricHelp(cfg, true);
    expect(h.hot).toContain("от 85 до 100");
    expect(h.warm).toContain("от 60 до 84");
    expect(h.cold).not.toContain("«Нет»");
    expect(h.colVolume).toContain("до 200 кг");
    expect(h.colVolume).toContain("от 3 000");
    expect(h.colScore).toContain("объём 40");
    expect(h.colScore).toContain("сумма весов сейчас 110");
    expect(h.total).toContain("вместе с демо-данными");
  });

  it("правило отказа упоминается только пока оно включено", () => {
    expect(metricHelp(DEFAULT_SCORING, false).hot).toContain("«Нет»");
    expect(metricHelp({ ...DEFAULT_SCORING, refusalCold: false }, false).hot).not.toContain("«Нет»");
  });
});
