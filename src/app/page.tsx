import Link from "next/link";
import { connection } from "next/server";
import Filters from "@/components/Filters";
import type { FilterValues } from "@/components/Filters";
import SetupNeeded from "@/components/SetupNeeded";
import {
  Card, Chip, DayBars, Empty, GroupBars, Kpi, ScoreBar, SimpleBars, StatusBadge, TempBadge, TempSplit,
} from "@/components/ui";
import { isAdmin } from "@/lib/admin";
import { ACTIVITIES, OTHER, REGIONS, STATUSES, WASTE_TYPES } from "@/lib/config";
import { kgText, num, plural, relativeDay, somText } from "@/lib/format";
import { counts, getStats, listLeads } from "@/lib/leads";
import type { Lead } from "@/lib/leads";
import { maskContact } from "@/lib/mask";
import { scheduleSheetSync } from "@/lib/sheet";

type SP = Record<string, string | undefined>;

async function load(sp: SP) {
  await scheduleSheetSync();
  const c = await counts();
  const includeDemo = sp.demo === "1" ? true : sp.demo === "0" ? false : c.real === 0;
  const filters = {
    temperature: sp.temperature || undefined,
    region: sp.region || undefined,
    activity: sp.activity || undefined,
    waste: sp.waste || undefined,
    status: sp.status || undefined,
    q: sp.q?.trim() || undefined,
    review: sp.review === "1",
    includeDemo,
  };
  const [stats, leads, hot, admin] = await Promise.all([
    getStats(includeDemo),
    listLeads(filters, 300),
    listLeads({ includeDemo, temperature: "HOT" }, 50),
    isAdmin(),
  ]);
  const todo = hot.filter((l) => l.status === "new" || l.status === "contacted").slice(0, 3);
  return { c, includeDemo, stats, leads, todo, admin };
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<SP> }) {
  await connection();
  const sp = await searchParams;

  let data: Awaited<ReturnType<typeof load>>;
  try {
    data = await load(sp);
  } catch (e) {
    return <SetupNeeded message={e instanceof Error ? e.message : "Не удалось подключиться к базе данных."} />;
  }
  const { c, includeDemo, stats, leads, todo, admin } = data;
  const pct = (n: number) => (stats.total ? `${Math.round((n / stats.total) * 100)}% заявок` : "");
  const values: FilterValues = {
    temperature: sp.temperature, region: sp.region, activity: sp.activity, waste: sp.waste,
    status: sp.status, q: sp.q, review: sp.review, demo: sp.demo,
  };
  const opt = (list: readonly string[]) => list.map((v) => ({ value: v, label: v }));

  return (
    <div className="space-y-6">
      {/* Проблема и идея продукта */}
      <section className="rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-900 p-6 text-white shadow-sm">
        <h1 className="text-xl font-semibold sm:text-2xl">Скрининг заявок пищевых предприятий</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-emerald-50/90">
          Официальная статистика показывает рост пищевого производства, но детальных оперативных данных о потоках
          пищевых отходов конкретных предприятий почти нет. EcoFood AI собирает их короткой анкетой, оценивает каждого
          клиента по прозрачным критериям и подсказывает менеджеру, кому звонить первым.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {["1 · Анкета / Google-форма", "2 · Скоринг по критериям", "3 · HOT / WARM / COLD", "4 · AI: объяснение и следующий шаг"].map((s) => (
            <span key={s} className="rounded-full bg-white/15 px-3 py-1 font-medium">{s}</span>
          ))}
        </div>
      </section>

      {stats.total === 0 && c.real + c.demo === 0 ? (
        <Card>
          <div className="py-8 text-center">
            <p className="font-medium text-slate-800">Заявок пока нет</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Заявки появятся, когда предприятия заполнят анкету
              {" "}<Link href="/apply" className="text-emerald-700 underline">на этой странице</Link>{" "}
              или в подключённой Google-форме.
            </p>
            <Link href="/admin" className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              Подключить форму или загрузить демо-данные
            </Link>
          </div>
        </Card>
      ) : (
        <>
          {c.real === 0 && c.demo > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
              Сейчас показаны <b>демо-данные</b> (вымышленные предприятия). Реальные заявки из анкеты появятся здесь
              автоматически, и демо-данные скроются.
            </div>
          )}

          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Заявок" value={stats.total} sub={`${stats.newCount} новых · ${stats.withContact} с контактом`} tone="brand" />
            <Kpi label="HOT — звонить первыми" value={stats.hot} sub={pct(stats.hot)} tone="HOT" />
            <Kpi label="WARM" value={stats.warm} sub={pct(stats.warm)} tone="WARM" />
            <Kpi label="COLD" value={stats.cold} sub={pct(stats.cold)} tone="COLD" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Суммарный объём отходов", `${num(stats.totalKg / 1000, 1)} т/мес`],
              ["Расходы на вывоз", `${num(stats.totalCost)} сом/мес`],
              ["Средний балл", `${stats.avgScore} из 100`],
              ["Проверить вручную", `${stats.review} ${plural(stats.review, ["заявка", "заявки", "заявок"])}`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5">
                <div className="text-xs text-slate-500">{k}</div>
                <div className="text-sm font-semibold tabular-nums text-slate-900">{v}</div>
              </div>
            ))}
          </div>

          {/* Приоритет на сегодня */}
          {todo.length > 0 && (
            <Card title="Приоритет на сегодня" hint="Самые горячие лиды, с которыми ещё не работали, и что менеджеру сделать дальше">
              <div className="grid gap-3 md:grid-cols-3">
                {todo.map((l) => (
                  <Link
                    key={l.id}
                    href={`/leads/${l.id}`}
                    className="group rounded-xl border border-red-100 bg-red-50/40 p-4 transition hover:border-red-300 hover:bg-red-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-slate-900 group-hover:text-emerald-800">{l.company}</div>
                      <span className="rounded-md bg-red-500 px-1.5 py-0.5 text-xs font-bold text-white">{l.score}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {[l.region, kgText(l.volumeKg) + "/мес"].filter(Boolean).join(" · ")}
                    </div>
                    {l.aiNextStep && <p className="mt-2 line-clamp-3 text-sm text-slate-700">{l.aiNextStep}</p>}
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* Графики */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Структура заявок" hint="Доля горячих, тёплых и холодных клиентов">
              <TempSplit hot={stats.hot} warm={stats.warm} cold={stats.cold} />
              <div className="mt-5">
                <div className="mb-2 text-xs font-medium text-slate-500">Типы отходов</div>
                <SimpleBars rows={stats.byWaste} />
              </div>
            </Card>
            <Card title="По видам деятельности" hint="Цвет полосы — температура заявок">
              <GroupBars rows={stats.byActivity} />
            </Card>
            <Card title="Динамика и география">
              <div className="mb-1 text-xs font-medium text-slate-500">Заявки по дням (14 дней)</div>
              <DayBars data={stats.byDay} />
              <div className="mb-2 mt-5 text-xs font-medium text-slate-500">Регионы</div>
              <GroupBars rows={stats.byRegion} max={5} />
            </Card>
          </div>

          {/* Приоритетный список */}
          <Card
            title="Приоритетный список"
            hint="Отсортирован по баллу. Нажмите на компанию, чтобы увидеть расчёт баллов, AI-заметку и CRM-статус"
          >
            <div className="mb-4">
              <Filters
                values={values}
                regions={opt(REGIONS)}
                activities={opt([...ACTIVITIES, OTHER])}
                wastes={opt([...WASTE_TYPES, OTHER])}
                statuses={STATUSES.map((s) => ({ value: s.id, label: s.label }))}
                showDemoToggle={c.real > 0 && c.demo > 0}
                demoOn={includeDemo}
              />
            </div>
            {leads.length === 0 ? (
              <Empty text="По выбранным фильтрам заявок нет" />
            ) : (
              <LeadsTable leads={leads} admin={admin} />
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function LeadsTable({ leads, admin }: { leads: Lead[]; admin: boolean }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-2 font-medium">#</th>
            <th className="py-2 pr-3 font-medium">Компания</th>
            <th className="py-2 pr-3 font-medium">Балл</th>
            <th className="py-2 pr-3 font-medium">Статус</th>
            <th className="py-2 pr-3 font-medium">Объём / мес</th>
            <th className="py-2 pr-3 font-medium">Расходы / мес</th>
            <th className="hidden py-2 pr-3 font-medium xl:table-cell">Готовность</th>
            <th className="py-2 pr-3 font-medium">Контакт</th>
            <th className="py-2 font-medium">CRM</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {leads.map((l, i) => (
            <tr key={l.id} className="align-top hover:bg-slate-50">
              <td className="py-2.5 pr-2 text-slate-400 tabular-nums">{i + 1}</td>
              <td className="py-2.5 pr-3">
                <Link href={`/leads/${l.id}`} className="font-medium text-slate-900 hover:text-emerald-700 hover:underline">
                  {l.company}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                  <span>{[l.region, l.activityOther ?? l.activity].filter(Boolean).join(" · ")}</span>
                  {l.needsReview && <Chip tone="amber">проверить</Chip>}
                  {l.isDemo && <Chip tone="sky">демо</Chip>}
                </div>
                <div className="text-[11px] text-slate-400">{relativeDay(l.createdAt)}</div>
              </td>
              <td className="py-2.5 pr-3"><ScoreBar score={l.score} t={l.temperature} /></td>
              <td className="py-2.5 pr-3"><TempBadge t={l.temperature} /></td>
              <td className="py-2.5 pr-3 tabular-nums">
                {l.volumeKg == null ? <span className="text-xs text-amber-700">не распознан</span> : kgText(l.volumeKg)}
              </td>
              <td className="py-2.5 pr-3 tabular-nums">{somText(l.costSom)}</td>
              <td className="hidden py-2.5 pr-3 text-slate-600 xl:table-cell">{l.handover ?? "—"}</td>
              <td className="py-2.5 pr-3 text-slate-600">
                {l.contactOk ? (admin ? l.contactRaw : maskContact(l.contactRaw)) : <span className="text-xs text-slate-400">нет контакта</span>}
              </td>
              <td className="py-2.5"><StatusBadge status={l.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
