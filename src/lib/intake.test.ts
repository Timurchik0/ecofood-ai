import { describe, expect, it } from "vitest";
import { mapAnswers, parseTimestamp, readInterestAndContact, stableId } from "./intake";
import { csvToRecords, parseCsv } from "./csv";
import { toCsvUrl } from "./sheetUrl";

// Названия вопросов — точно как в реальной Google-форме (с пробелами и переносом строки в конце).
const FORM = {
  company: "Название предприятия",
  region: "Регион, в котором расположено предприятие:  ",
  activity: "Вид деятельности предприятия",
  waste: "Какие пищевые отходы преимущественно образуются на вашем предприятии? Можно выбрать несколько вариантов: ",
  volume: "Какой примерный объём пищевых отходов образуется в месяц? Укажите примерный объём в кг: _______",
  frequency: "Как часто осуществляется вывоз пищевых отходов? ",
  handling: "Как сейчас осуществляется вывоз/передача пищевых отходов вашего предприятия? ",
  cost: "Сколько примерно предприятие тратит на вывоз/утилизацию пищевых отходов в месяц?\nУкажите примерную сумму в сомах: ______",
  handover: "Рассмотрели бы вы передачу пищевых отходов специализированному переработчику, если это позволит сократить расходы на их вывоз? ",
  priority: "Что для вас наиболее важно при выборе переработчика?",
  // старая форма: готовность и контакт в одном вопросе
  contact: "Готовы ли вы принять участие в коротком интервью или рассмотреть участие в пилотном проекте?  Если да, оставьте, пожалуйста, контакт для связи (телефон / WhatsApp / e-mail): ",
};

// новая форма (таблица Динары): готовность — отдельный вопрос, контакт — отдельное поле
const NEW_INTEREST = "Готовы ли вы принять участие в коротком интервью или рассмотреть участие в пилотном проекте? ";
const NEW_CONTACT = "Если да или возможно, оставьте контакт и имя контактного лица: ______";

describe("mapAnswers — реальные названия вопросов Google-формы", () => {
  it("раскладывает все 11 вопросов по своим полям", () => {
    const raw = Object.fromEntries(Object.values(FORM).map((title, i) => [title, `v${i}`]));
    const m = mapAnswers({ ...raw, "Отметка времени": "04.10.2026 14:23:11" });
    expect(m).toEqual({
      company: "v0",
      region: "v1",
      activity: "v2",
      wasteTypes: "v3",
      volume: "v4",
      frequency: "v5",
      handling: "v6",
      cost: "v7",
      handover: "v8",
      priority: "v9",
      contact: "v10",
      timestamp: "04.10.2026 14:23:11",
    });
  });

  it("новая форма: готовность и контакт — разные поля, «Столбец N» игнорируется", () => {
    const m = mapAnswers({
      [NEW_INTEREST]: "Да",
      [NEW_CONTACT]: "0555 123 456, Айбек",
      "Столбец 12": "мусор",
      "Столбец 13": "",
    });
    expect(m.interest).toBe("Да");
    expect(m.contact).toBe("0555 123 456, Айбек");
    expect(Object.keys(m).sort()).toEqual(["contact", "interest"]);
  });

  it("принимает и готовые ключи (форма в приложении), и массивы (чекбоксы)", () => {
    const m = mapAnswers({ company: "Х", wasteTypes: ["А", "Б"] });
    expect(m.company).toBe("Х");
    expect(m.wasteTypes).toBe("А, Б");
  });

  it("мелкие правки формулировок не ломают сопоставление", () => {
    const m = mapAnswers({
      "Объем пищевых отходов в месяц (кг)": "500",
      "Сколько вы тратите на вывоз, сом": "3000",
    });
    expect(m.volume).toBe("500");
    expect(m.cost).toBe("3000");
  });

  it("неизвестные колонки игнорируются", () => {
    expect(mapAnswers({ "Что-то лишнее": "1" })).toEqual({});
  });
});

describe("readInterestAndContact", () => {
  it("старая форма: «Да 0555…» → готовность да + номер", () => {
    const r = readInterestAndContact({ contact: "Да 0555 123 456" });
    expect(r.interest).toBe("yes");
    expect(r.contactText).toBe("0555 123 456");
  });
  it("«Да» без номера — готовность есть, контакта нет (и это не «неясный контакт»)", () => {
    const r = readInterestAndContact({ contact: "Да " });
    expect(r.interest).toBe("yes");
    expect(r.contactText).toBe("");
  });
  it("два столбца контакта (старый «Да» + новый с номером) склеиваются", () => {
    const m = mapAnswers({
      "Готовы ли вы принять участие в интервью? Если да, оставьте, пожалуйста, контакт": "Да",
      "Если да или возможно, оставьте контакт и имя контактного лица": "0700 111 222, Нурлан",
    });
    const r = readInterestAndContact(m);
    expect(r.interest).toBe("yes");
    expect(r.contactText).toBe("0700 111 222, Нурлан");
  });
  it("новая форма: отдельные готовность и контакт", () => {
    const r = readInterestAndContact({ interest: "Возможно", contact: "aibek@mail.kg" });
    expect(r.interest).toBe("maybe");
    expect(r.contactText).toBe("aibek@mail.kg");
  });
  it("«Нет» и пусто — ни готовности к контакту, ни контакта", () => {
    expect(readInterestAndContact({ contact: "Нет" })).toEqual({ interest: "no", contactText: "" });
    expect(readInterestAndContact({})).toEqual({ interest: null, contactText: "" });
  });
});

describe("parseTimestamp", () => {
  it("русский формат — время Бишкека (UTC+6)", () => {
    expect(parseTimestamp("04.10.2026 14:23:11")?.toISOString()).toBe("2026-10-04T08:23:11.000Z");
  });
  it("американский формат с AM/PM", () => {
    expect(parseTimestamp("10/4/2026 2:23:11 PM")?.toISOString()).toBe("2026-10-04T08:23:11.000Z");
  });
  it("ISO и мусор", () => {
    expect(parseTimestamp("2026-10-04T08:23:11Z")?.toISOString()).toBe("2026-10-04T08:23:11.000Z");
    expect(parseTimestamp("вчера")).toBeNull();
    expect(parseTimestamp("")).toBeNull();
  });
});

describe("stableId", () => {
  it("один и тот же вход — один id, без учёта регистра и пробелов по краям", () => {
    expect(stableId("gs", " ABC ")).toBe(stableId("gs", "abc"));
    expect(stableId("gs", "a")).not.toBe(stableId("gs", "b"));
  });
});

describe("CSV", () => {
  it("кавычки, запятые, переносы строк внутри ячеек и BOM", () => {
    const csv = '\uFEFFОтметка времени,Название предприятия,"Расходы\nв сомах"\r\n04.10.2026 14:23:11,"ООО ""Берекет"", Бишкек","5 000"\r\n';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0][2]).toBe("Расходы\nв сомах");
    expect(rows[1][1]).toBe('ООО "Берекет", Бишкек');
  });
  it("разделитель ; (русская локаль Excel)", () => {
    expect(csvToRecords("a;b\n1;2")).toEqual([{ a: "1", b: "2" }]);
  });
  it("пустые строки пропускаются", () => {
    expect(csvToRecords("a,b\n1,2\n\n,\n")).toHaveLength(1);
  });
});

describe("toCsvUrl", () => {
  it("публикация в интернете → CSV", () => {
    expect(toCsvUrl("https://docs.google.com/spreadsheets/d/e/2PACX-abc/pubhtml")).toBe(
      "https://docs.google.com/spreadsheets/d/e/2PACX-abc/pub?output=csv",
    );
  });
  it("обычная ссылка на таблицу (с gid) → export CSV", () => {
    expect(toCsvUrl("https://docs.google.com/spreadsheets/d/1AbC_dEf/edit?gid=123#gid=123")).toBe(
      "https://docs.google.com/spreadsheets/d/1AbC_dEf/export?format=csv&gid=123",
    );
    expect(toCsvUrl("https://docs.google.com/spreadsheets/d/1AbC_dEf/edit")).toBe(
      "https://docs.google.com/spreadsheets/d/1AbC_dEf/export?format=csv",
    );
  });
  it("готовую ссылку на CSV не трогает", () => {
    const u = "https://docs.google.com/spreadsheets/d/e/2PACX-abc/pub?gid=0&single=true&output=csv";
    expect(toCsvUrl(u)).toBe(u);
  });
});
