import { connection } from "next/server";
import { headers } from "next/headers";
import CopyButton from "@/components/CopyButton";
import LoginForm from "@/components/LoginForm";
import SettingsForm from "@/components/SettingsForm";
import SetupNeeded from "@/components/SetupNeeded";
import { Card } from "@/components/ui";
import { adminConfigured, isAdmin } from "@/lib/admin";
import { aiConfigured } from "@/lib/ai";
import { appsScript } from "@/lib/appsScript";
import { query } from "@/lib/db";
import { dateText } from "@/lib/format";
import { counts, getConfig } from "@/lib/leads";
import { getSheetUrl, getSyncState } from "@/lib/sheet";
import {
  aiMissingAction, deleteDemoAction, importCsvAction, logout, saveSheetAction, seedAction, syncNowAction,
} from "./actions";

export const metadata = { title: "Настройки — EcoFood AI" };

const btn = "rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";
const primary = "rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await connection();
  const { msg } = await searchParams;
  const admin = await isAdmin();

  if (!admin) {
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
    const [cfg, c, sheetUrl, sync, ai] = await Promise.all([
      getConfig(),
      counts(),
      getSheetUrl(),
      getSyncState(),
      query<{ n: number }>("select count(*)::int as n from leads where ai_model is null or ai_model = 'rules'"),
    ]);
    data = { cfg, c, sheetUrl, sync, aiMissing: ai[0]?.n ?? 0 };
  } catch (e) {
    return <SetupNeeded message={e instanceof Error ? e.message : "Не удалось подключиться к базе данных."} />;
  }
  const { cfg, c, sheetUrl, sync, aiMissing } = data;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const endpoint = `${proto}://${host}/api/intake`;
  const secret = process.env.INTAKE_SECRET ?? "";
  const script = appsScript(endpoint, secret || "ЗАДАЙТЕ_INTAKE_SECRET_НА_СЕРВЕРЕ");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Настройки и данные</h1>
        <form action={logout}>
          <button className="text-sm text-slate-500 hover:text-slate-800">Выйти</button>
        </form>
      </div>

      {msg && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">{msg}</p>
      )}

      <Card
        title="Пороги и веса скоринга"
        hint="Меняются здесь, без правки кода. После сохранения баллы всех заявок пересчитываются из сохранённых ответов — сами ответы предприятий не меняются."
      >
        <SettingsForm key={JSON.stringify(cfg)} initial={cfg} />
      </Card>

      <Card title="Подключение Google-формы" hint="Ответы формы попадают в приложение, скоринг и дашборд считаются автоматически">
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Вариант A — по ссылке на таблицу (без кода)</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              В таблице ответов: Файл → Поделиться → Опубликовать в Интернете → лист с ответами → формат CSV → Опубликовать.
              Либо откройте доступ «Все, у кого есть ссылка — читатель». Вставьте ссылку сюда: приложение само подтянет
              накопленные ответы и затем проверяет новые каждую минуту, пока открыт дашборд.
            </p>
            <form action={saveSheetAction} className="mt-2 flex flex-wrap gap-2">
              <input
                name="url"
                defaultValue={sheetUrl ?? ""}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                aria-label="Ссылка на Google-таблицу"
                className="h-10 min-w-72 flex-1 rounded-lg border border-slate-300 px-3 text-sm shadow-sm focus:border-emerald-500"
              />
              <button className={primary}>Подключить и загрузить</button>
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
            <p className="mt-2 text-xs text-amber-700">
              Опубликованная таблица доступна всем, у кого есть ссылка, а в ней контакты компаний. Если это важно — используйте вариант B.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-800">Вариант B — скрипт в таблице (закрытая отправка)</h3>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-slate-500">
              <li>Откройте Google-таблицу с ответами формы → Расширения → Apps Script.</li>
              <li>Удалите всё в редакторе, вставьте код ниже, сохраните.</li>
              <li>Выполните функцию <b>sendAll</b> (отправит все накопленные ответы), затем <b>setup</b> (включит отправку новых). Разрешите доступ, когда Google спросит.</li>
            </ol>
            {!secret && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                На сервере не задан <code>INTAKE_SECRET</code> — задайте его в переменных окружения Vercel и сделайте redeploy, потом скопируйте скрипт заново.
              </p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <CopyButton text={script} label="Скопировать скрипт" />
              <span className="text-xs text-slate-400">адрес приёма: {endpoint}</span>
            </div>
            <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">{script}</pre>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-800">Вариант C — загрузить CSV вручную</h3>
            <p className="mt-0.5 text-xs text-slate-500">Таблица ответов → Файл → Скачать → CSV. Повторная загрузка безопасна: дубликаты пропускаются.</p>
            <form action={importCsvAction} className="mt-2 flex flex-wrap items-center gap-2">
              <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
              <button className={btn}>Импортировать</button>
            </form>
          </div>
        </div>
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
    </div>
  );
}
