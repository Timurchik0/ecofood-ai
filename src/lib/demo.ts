// Демо-данные: вымышленные предприятия в формате ответов реальной Google-формы.
// Помечаются is_demo и удаляются одной кнопкой на /admin, чтобы не смешиваться с реальными заявками.
// Свободный текст специально «грязный» (тонны, диапазоны, «в день», «не знаю») — это проверка парсера.

import { ingest } from "./intake";
import { getConfig } from "./leads";

type Demo = {
  company: string;
  region: string;
  activity: string;
  waste: string;
  volume: string;
  frequency: string;
  handling: string;
  cost: string;
  handover: string;
  priority: string;
  contact: string;
  daysAgo: number;
  status?: string;
  interest?: string;
};

const COMM = "Вывозятся вместе с коммунальными отходами";
const SPEC = "Передаются специализированной организации";
const OTHERS = "Передаются другим лицам/организациям";
const SELF = "Перерабатываются/используются самим предприятием";

const DEMO: Demo[] = [
  { company: "Хлебозавод «Сары-Нан»", region: "г. Бишкек", activity: "Хлебобулочное и мучное производство", waste: "Остатки/брак готовой продукции, Органические остатки сырья", volume: "около 3 тонн", frequency: "Ежедневно", handling: COMM, cost: "25 000 сом", handover: "Да", priority: "Цена", contact: "0555 000 101, Айбек", daysAgo: 1, status: "contacted" },
  { company: "Кондитерская фабрика «Тулпар Свит»", region: "г. Бишкек", activity: "Кондитерское производство", waste: "Остатки/брак готовой продукции, Просроченная продукция", volume: "1 200 кг", frequency: "2–3 раза в неделю", handling: COMM, cost: "12 тыс.", handover: "Да", priority: "Документы", contact: "+996 700 000 202", daysAgo: 1 },
  { company: "Молочный комбинат «Арпа-Сут»", region: "Чуйская область", activity: "Молочное производство", waste: "Органические остатки сырья, Просроченная продукция", volume: "2,5 т", frequency: "Ежедневно", handling: OTHERS, cost: "18000", handover: "Да", priority: "Регулярность вывоза", contact: "arpa.sut@example.kg", daysAgo: 2, status: "interview" },
  { company: "Мясокомбинат «Кара-Мал»", region: "Чуйская область", activity: "Мясное производство", waste: "Органические остатки сырья", volume: "800-1000 кг", frequency: "Ежедневно", handling: SPEC, cost: "9 000 сом", handover: "Зависит от условий", priority: "Экологический эффект", contact: "0770 000 303", daysAgo: 2, interest: "Возможно" },
  { company: "Сеть супермаркетов «Достук Маркет»", region: "г. Бишкек", activity: "Пищевая торговля / супермаркеты", waste: "Просроченная продукция, Остатки/брак готовой продукции", volume: "1,8 тонны", frequency: "Ежедневно", handling: COMM, cost: "от 15 до 20 тыс", handover: "Да", priority: "Удобство и скорость вывоза", contact: "0550 000 404", daysAgo: 3, status: "pilot" },
  { company: "Столовая и кейтеринг «Ош-Дастархан»", region: "г. Ош", activity: "Рестораны / кафе / столовые / кейтеринг", waste: "Остатки готовой пищи", volume: "60 кг в день", frequency: "Ежедневно", handling: COMM, cost: "4500", handover: "Да", priority: "Цена", contact: "@osh_dastarkhan", daysAgo: 3 },
  { company: "Кафе «Чынар»", region: "г. Бишкек", activity: "Рестораны / кафе / столовые / кейтеринг", waste: "Остатки готовой пищи", volume: "150 кг", frequency: "Ежедневно", handling: COMM, cost: "2 500 сом", handover: "Зависит от условий", priority: "Цена", contact: "0705 000 505", daysAgo: 4 },
  { company: "Переработка овощей «Жайыл Фрукт»", region: "Чуйская область", activity: "Переработка фруктов и овощей", waste: "Органические остатки сырья", volume: "5 тонн", frequency: "2–3 раза в неделю", handling: SELF, cost: "0", handover: "Зависит от условий", priority: "Экологический эффект", contact: "", daysAgo: 4 },
  { company: "Пекарня «Нур-Нан»", region: "г. Ош", activity: "Хлебобулочное и мучное производство", waste: "Остатки/брак готовой продукции", volume: "400", frequency: "Ежедневно", handling: COMM, cost: "3000", handover: "Да", priority: "Регулярность вывоза", contact: "", daysAgo: 5 },
  { company: "Ресторан «Сан-Таш»", region: "г. Бишкек", activity: "Рестораны / кафе / столовые / кейтеринг", waste: "Остатки готовой пищи, Органические остатки сырья", volume: "700 кг/мес", frequency: "Ежедневно", handling: SPEC, cost: "6 тыс сом", handover: "Зависит от условий", priority: "Документы", contact: "santash@example.kg", daysAgo: 5, interest: "Возможно" },
  { company: "Сыроварня «Кочкор-Чиз»", region: "Нарынская область", activity: "Молочное производство", waste: "Органические остатки сырья", volume: "500 кг", frequency: "1 раз в неделю", handling: OTHERS, cost: "1500", handover: "Зависит от условий", priority: "Цена", contact: "", daysAgo: 6 },
  { company: "Цех полуфабрикатов «Манты-Хаус»", region: "г. Бишкек", activity: "Мясное производство", waste: "Органические остатки сырья, Остатки/брак готовой продукции", volume: "1 000", frequency: "2–3 раза в неделю", handling: COMM, cost: "7000", handover: "Зависит от условий", priority: "Цена", contact: "0700 000 707, Нурлан", daysAgo: 6 },
  { company: "Кафе при университете", region: "Джалал-Абадская область", activity: "Рестораны / кафе / столовые / кейтеринг", waste: "Остатки готовой пищи", volume: "200 кг", frequency: "Ежедневно", handling: COMM, cost: "1 000", handover: "Да", priority: "Экологический эффект", contact: "0555 000 808", daysAgo: 7 },
  { company: "Пекарня «Каракол Бейкери»", region: "Иссык-Кульская область", activity: "Хлебобулочное и мучное производство", waste: "Остатки/брак готовой продукции", volume: "90 кг", frequency: "По мере накопления", handling: COMM, cost: "800 сом", handover: "Нет", priority: "Цена", contact: "", daysAgo: 7 },
  { company: "Мясной магазин «Эт-Дукон»", region: "Таласская область", activity: "Мясное производство", waste: "Просроченная продукция", volume: "не знаю", frequency: "Несколько раз в месяц", handling: COMM, cost: "затрудняюсь ответить", handover: "Зависит от условий", priority: "Регулярность вывоза", contact: "0770 000 909", daysAgo: 8 },
  { company: "Сеть кофеен «Кофе-Поинт»", region: "г. Бишкек", activity: "Рестораны / кафе / столовые / кейтеринг", waste: "Остатки готовой пищи, Просроченная продукция", volume: "120 кг", frequency: "2–3 раза в неделю", handling: SPEC, cost: "1 800", handover: "Нет", priority: "Документы", contact: "нет", daysAgo: 9 },
  { company: "Овощехранилище «Баткен-Агро»", region: "Баткенская область", activity: "Переработка фруктов и овощей", waste: "Органические остатки сырья, Просроченная продукция", volume: "2 т", frequency: "1 раз в неделю", handling: COMM, cost: "20 тыс.", handover: "Да", priority: "Удобство и скорость вывоза", contact: "0556 000 010", daysAgo: 10 },
  { company: "Столовая бизнес-центра «Меню Дня»", region: "г. Бишкек", activity: "Рестораны / кафе / столовые / кейтеринг", waste: "Остатки готовой пищи", volume: "300 кг", frequency: "Ежедневно", handling: OTHERS, cost: "3 500 сом", handover: "Нет", priority: "Цена", contact: "0700 000 111", daysAgo: 11, status: "rejected" },
  { company: "Кондитерская «Шоколад-KG»", region: "г. Бишкек", activity: "Кондитерское производство", waste: "Остатки/брак готовой продукции", volume: "полтонны", frequency: "1 раз в неделю", handling: COMM, cost: "примерно 5 тысяч", handover: "Да", priority: "Цена", contact: "позвоните директору", daysAgo: 12 },
  { company: "Фермерское хозяйство «Айдар-Ферма»", region: "Ошская область", activity: "Другое: фермерское хозяйство", waste: "Органические остатки сырья", volume: "1,5", frequency: "По мере накопления", handling: SELF, cost: "—", handover: "Нет", priority: "Экологический эффект", contact: "", daysAgo: 13 },
];

export async function seedDemo(): Promise<number[]> {
  const config = await getConfig();
  const ids: number[] = [];
  for (let i = 0; i < DEMO.length; i++) {
    const d = DEMO[i];
    const createdAt = new Date(Date.now() - d.daysAgo * 86_400_000 - ((i * 37) % 600) * 60_000);
    const r = await ingest({
      source: "demo",
      isDemo: true,
      externalId: `demo:${i}`,
      createdAt,
      status: d.status,
      config,
      answers: {
        company: d.company,
        region: d.region,
        activity: d.activity,
        wasteTypes: d.waste,
        volume: d.volume,
        frequency: d.frequency,
        handling: d.handling,
        cost: d.cost,
        handover: d.handover,
        priority: d.priority,
        interest: d.interest ?? (d.contact && d.contact !== "нет" ? "Да" : "Нет"),
        contact: d.contact,
      },
    });
    if (r.ok) ids.push(r.lead.id);
  }
  return ids;
}
