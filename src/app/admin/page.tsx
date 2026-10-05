import { connection } from "next/server";
import LoginForm from "@/components/LoginForm";
import SettingsForm from "@/components/SettingsForm";
import SetupNeeded from "@/components/SetupNeeded";
import { Card } from "@/components/ui";
import { adminConfigured, canConfigure, isAdmin } from "@/lib/admin";
import { aiConfigured } from "@/lib/ai";
import { query } from "@/lib/db";
import { dateText } from "@/lib/format";
import { counts, getConfig } from "@/lib/leads";
import { getSheetUrl, getSyncState } from "@/lib/sheet";
import {
  aiMissingAction, deleteDemoAction, logout, saveSheetAction, seedAction, syncNowAction,
} from "./actions";

export const metadata = { title: "Настройки — EcoFood AI" };

const btn = "rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";
const primary = "rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await connection();
  const { msg } = await searchParams;
  const admin = await isAdmin();

  // страница закрыта целиком только при SETTINGS_LOCKED=1
  if (!(await canConfigure())) {
    return (
      <div className="mx-auto max-w-md py-10">
        <Card title="Вход для администратора">
          {adminConfigured() ? (
            <LoginForm />
          ) : (
            <p className="text-sm text-slate-600">
              Администрирование отключено: задайте переменную окружения <code className="rounded bg-slate-100 px-1">ADMIN_KEY</code> на
              сервере и сделайте redeploy.
            </p>
          )}
          <p className="mt-4 text-xs text-slate-400">
            Дашборд и анкета открыты без входа. Администратору доступны: настройка порогов скоринга, подключение
            Google-таблицы, импорт, видимость контактов.
          </p>
        </Card>
      </div>
    );
  }

  let data;
  try {
    // данные для админских блоков запрашиваем только админу
    const [cfg, meta, c, sheetUrl, sync, ai] = await Promise.all([
      getConfig(),
      query<{ updated_at: string }>("select updated_at from settings where key = 'scoring'"),
      admin ? counts() : Promise.resolve({ real: 0, demo: 0 }),
      admin ? getSheetUrl() : Promise.resolve(null),
      admin ? getSyncState() : Promise.resolve(null),
      admin
        ? query<{ n: number }>("select count(*)::int as n from leads where ai_model is null or ai_model = 'rules'")
        : Promise.resolve([] as { n: number }[]),
    ]);
    data = {
      cfg,
      savedAt: meta[0]?.updated_at ? new Date(meta[0].updated_at) : null,
      c,
      sheetUrl,
      sync,
      aiMissing: ai[0]?.n ?? 0,
    };
  } catch (e) {
    return <SetupNeeded message={e instanceof Error ? e.message : "Не удалось подключиться к базе данных."} />;
  }
  const { cfg, savedAt, c, sheetUrl, sync, aiMissing } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Настройки и данные</h1>
        {admin && (
          <form action={logout}>
            <button className="text-sm text-slate-500 hover:text-slate-800">Выйти</button>
          </form>
        )}
      </div>

      {msg && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">{msg}</p>
      )}

      <Card
        title="Пороги и веса скоринга"
        hint={
          "Меняются здесь, без правки кода. После сохранения баллы всех заявок пересчитываются из сохранённых ответов — сами ответы предприятий не меняются. " +
          (admin ? "" : "Страница открыта без входа: изменения увидят все посетители. ") +
          (savedAt ? `Последнее сохранение: ${dateText(savedAt, true)}.` : "Сейчас действуют рекомендованные настройки.")
        }
      >
        <SettingsForm key={JSON.stringify(cfg)} initial={cfg} />
      </Card>

      {!admin ? (
        <Card title="Данные, контакты и подключение формы" hint="Эти функции доступны только администратору по ключу">
          {adminConfigured() ? (
            <div className="max-w-sm">
              <LoginForm />
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              Чтобы включить администрирование, задайте переменную окружения <code className="rounded bg-slate-100 px-1">ADMIN_KEY</code> на
              сервере.
            </p>
          )}
          <p className="mt-4 text-xs text-slate-400">
            После входа: контакты компаний полностью, ссылка на Google-таблицу, выгрузка CSV, демо-данные, AI-заметки.
          </p>
        </Card>
      ) : (
      <>
      <Card
        title="Google-таблица с ответами"
        hint="Ответы формы подтягиваются сами: накопленные — при подключении, новые — каждую минуту, пока открыт дашборд"
      >
        <form action={saveSheetAction} className="flex flex-wrap gap-2">
          <input
            name="url"
            defaultValue={sheetUrl ?? ""}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            aria-label="Ссылка на Google-таблицу"
            className="h-10 min-w-72 flex-1 rounded-lg border border-slate-300 px-3 text-sm shadow-sm focus:border-emerald-500"
          />
          <button className={primary}>{sheetUrl ? "Сохранить ссылку и загрузить" : "Подключить и загрузить"}</button>
        </form>
        {sheetUrl && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>
              Последняя синхронизация: {sync ? dateText(new Date(sync.at), true) : "—"}
              {sync?.error ? <b className="ml-1 text-red-700">· {sync.error}</b> : sync ? ` · добавлено ${sync.added}` : ""}
            </span>
            <form action={syncNowAction}><button className="text-emerald-700 underline">Синхронизировать сейчас</button></form>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Таблица должна быть открыта по ссылке («Все, у кого есть ссылка — читатель») или опубликована как CSV. В ней контакты компаний,
          поэтому не передавайте ссылку посторонним.
        </p>
      </Card>

      <Card title="Данные и AI">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2 text-sm">
            <div className="text-slate-600">
              Реальных заявок: <b>{c.real}</b> · демо-заявок: <b>{c.demo}</b>
            </div>
            <div className="flex flex-wrap gap-2">
              <form action={seedAction}><button className={btn}>Загрузить демо-данные</button></form>
              {c.demo > 0 && <form action={deleteDemoAction}><button className={btn}>Удалить демо-данные</button></form>}
              <a href="/api/export" className={btn}>Скачать все заявки (CSV)</a>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="text-slate-600">
              AI-модель:{" "}
              {aiConfigured() ? (
                <b className="text-emerald-700">подключена ({process.env.ANTHROPIC_MODEL || "claude-opus-5-5"})</b>
              ) : (
                <b className="text-amber-700">не подключена — заметки по шаблону</b>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {aiConfigured()
                ? `Заявок без AI-заметки или с шаблонной: ${aiMissing}`
                : "Добавьте ANTHROPIC_API_KEY в переменные окружения Vercel и сделайте redeploy."}
            </div>
            {aiConfigured() && aiMissing > 0 && (
              <form action={aiMissingAction}><button className={btn}>Сформировать AI-заметки ({aiMissing})</button></form>
            )}
          </div>
        </div>
      </Card>
      </>
      )}
    </div>
  );
}
