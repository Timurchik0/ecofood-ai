import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Card, Chip, StatusBadge, TEMP, TempBadge } from "@/components/ui";
import SetupNeeded from "@/components/SetupNeeded";
import { demoReadonly, isAdmin } from "@/lib/admin";
import { STATUSES } from "@/lib/config";
import { dateText, kgText, somText } from "@/lib/format";
import { getLead } from "@/lib/leads";
import type { Lead } from "@/lib/leads";
import { maskContact } from "@/lib/mask";
import { aiConfigured } from "@/lib/ai";
import { changeStatus, regenerateAi, saveNote } from "./actions";

const RING: Record<string, string> = { HOT: "#ef4444", WARM: "#fbbf24", COLD: "#94a3b8" };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n)) notFound();

  let lead: Lead | null;
  let admin: boolean;
  try {
    [lead, admin] = await Promise.all([getLead(n), isAdmin()]);
  } catch (e) {
    return <SetupNeeded message={e instanceof Error ? e.message : "Не удалось подключиться к базе данных."} />;
  }
  if (!lead) notFound();

  const editable = !demoReadonly() || admin;
  const contactText = lead.contactRaw ? (admin ? lead.contactRaw : maskContact(lead.contactRaw)) : null;
  const isTemplate = lead.aiModel === "rules";
  const capped = lead.rawScore > lead.score;

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">← К приоритетному списку</Link>

      <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div
          className="grid size-20 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(${RING[lead.temperature]} ${lead.score * 3.6}deg, #e2e8f0 0)` }}
          aria-label={`Балл ${lead.score} из 100`}
        >
          <div className="grid size-16 place-items-center rounded-full bg-white">
            <div className="text-center leading-none">
              <div className="text-2xl font-bold tabular-nums">{lead.score}</div>
              <div className="mt-0.5 text-[10px] text-slate-400">из 100</div>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{lead.company}</h1>
            <TempBadge t={lead.temperature} size="lg" />
            <StatusBadge status={lead.status} />
            {lead.isDemo && <Chip tone="sky">демо-данные</Chip>}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {[lead.region, lead.activityOther ?? lead.activity].filter(Boolean).join(" · ")} · заявка от {dateText(lead.createdAt, true)} ·{" "}
            {lead.source === "google_form" ? "Google-форма" : lead.source === "app_form" ? "анкета в приложении" : lead.source === "demo" ? "демо" : "импорт CSV"}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* AI-заметка */}
          <Card title="AI-заметка для менеджера">
            {lead.aiSummary ? (
              <div className="space-y-3 text-sm">
                <p className="text-slate-800">{lead.aiSummary}</p>
                {lead.aiWhy && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Почему такой приоритет</div>
                    <p className="mt-0.5 text-slate-700">{lead.aiWhy}</p>
                  </div>
                )}
                {lead.aiNextStep && (
                  <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-inset ring-emerald-200">
                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Следующий шаг</div>
                    <p className="mt-0.5 text-emerald-950">{lead.aiNextStep}</p>
                  </div>
                )}
                {lead.aiQuestions.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Вопросы для разговора</div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-700">
                      {lead.aiQuestions.map((q) => <li key={q}>{q}</li>)}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-slate-400">
                  {isTemplate
                    ? "Шаблонная заметка по правилам (AI-модель не подключена)."
                    : `Сформировано AI (${lead.aiModel})`}
                  {lead.aiAt ? ` · ${dateText(lead.aiAt, true)}` : ""}
                  {lead.aiError ? ` · ошибка AI: ${lead.aiError}` : ""}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Заметка ещё формируется. Обновите страницу через несколько секунд.</p>
            )}
            {admin && (
              <form action={regenerateAi} className="mt-3">
                <input type="hidden" name="id" value={lead.id} />
                <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  {aiConfigured() ? "Пересчитать AI-заметку" : "Обновить заметку (AI не подключён)"}
                </button>
              </form>
            )}
          </Card>

          {/* Расчёт баллов */}
          <Card title="Как посчитан балл" hint="Прозрачная модель: каждый критерий даёт баллы по ответам анкеты. Пороги и веса меняются в настройках">
            {capped && (
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Предприятие ответило «Нет» на передачу отходов переработчику, поэтому лид автоматически <b>COLD</b>.
                Сумма баллов по критериям была {lead.rawScore}.
              </div>
            )}
            <ul className="space-y-3">
              {lead.breakdown.map((b) => (
                <li key={b.key}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-800">{b.label}</span>
                    <span className="tabular-nums text-slate-900">
                      <b>{b.points}</b> <span className="text-slate-400">/ {b.max}</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${TEMP[lead.temperature].bar}`} style={{ width: `${b.max ? (b.points / b.max) * 100 : 0}%` }} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{b.reason}</div>
                </li>
              ))}
            </ul>
          </Card>

          {lead.flags.some((f) => f.code !== "note") && (
            <Card title="Требует внимания">
              <ul className="space-y-1.5 text-sm">
                {lead.flags.filter((f) => f.code !== "note").map((f) => (
                  <li key={f.code} className="flex items-start gap-2">
                    <Chip tone={f.review ? "amber" : "slate"}>{f.review ? "проверить" : "инфо"}</Chip>
                    <span className="text-slate-700">{f.text}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          {/* CRM */}
          <Card title="CRM">
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <form key={s.id} action={changeStatus}>
                  <input type="hidden" name="id" value={lead.id} />
                  <input type="hidden" name="status" value={s.id} />
                  <button
                    disabled={!editable}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      lead.status === s.id
                        ? "bg-emerald-600 text-white ring-emerald-600"
                        : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {s.label}
                  </button>
                </form>
              ))}
            </div>
            <form action={saveNote} className="mt-4">
              <input type="hidden" name="id" value={lead.id} />
              <label className="text-xs font-medium text-slate-500" htmlFor="note">Заметка менеджера</label>
              <textarea
                id="note"
                name="note"
                defaultValue={lead.note ?? ""}
                disabled={!editable}
                rows={4}
                maxLength={2000}
                placeholder="Итоги звонка, договорённости…"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm shadow-sm focus:border-emerald-500 disabled:bg-slate-50"
              />
              <button disabled={!editable} className="mt-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50">
                Сохранить заметку
              </button>
            </form>
          </Card>

          {/* Контакт */}
          <Card title="Контакт">
            {contactText ? (
              <div className="space-y-1 text-sm">
                <p className="break-words text-slate-800">{contactText}</p>
                {admin && (
                  <div className="flex flex-wrap gap-3 pt-1 text-xs">
                    {lead.contactPhone && <a className="text-emerald-700 underline" href={`tel:${lead.contactPhone}`}>Позвонить</a>}
                    {lead.contactPhone && <a className="text-emerald-700 underline" href={`https://wa.me/${lead.contactPhone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>}
                    {lead.contactEmail && <a className="text-emerald-700 underline" href={`mailto:${lead.contactEmail}`}>Написать</a>}
                  </div>
                )}
                {!admin && <p className="text-xs text-slate-400">В открытой демо-версии контакт скрыт.</p>}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Контакт не оставлен — нужно найти другой способ связаться с предприятием.</p>
            )}
          </Card>

          {/* Ответы */}
          <Card title="Ответы анкеты">
            <dl className="space-y-2.5 text-sm">
              <Row k="Типы отходов" v={lead.wasteTypes.join(", ")} />
              <Row k="Объём в месяц" v={lead.volumeRaw} parsed={lead.volumeKg != null ? kgText(lead.volumeKg) : null} />
              <Row k="Частота вывоза" v={lead.frequency} />
              <Row k="Как вывозят сейчас" v={lead.handling} />
              <Row k="Расходы на вывоз" v={lead.costRaw} parsed={lead.costSom != null ? somText(lead.costSom) : null} />
              <Row k="Передача переработчику" v={lead.handover} />
              <Row k="Важно при выборе" v={lead.priority} />
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, parsed }: { k: string; v: string | null; parsed?: string | null }) {
  const clean = (s: string) => s.replace(/[\s ]/g, "").toLowerCase().replace(/(кг|сом)$/, "");
  const showParsed = Boolean(v && parsed && clean(v) !== clean(parsed));
  return (
    <div>
      <dt className="text-xs text-slate-500">{k}</dt>
      <dd className="text-slate-800">
        {v || "—"}
        {showParsed && <span className="ml-1.5 text-xs text-slate-400">→ {parsed}</span>}
      </dd>
    </div>
  );
}
