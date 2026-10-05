import { Card } from "./ui";

export default function SetupNeeded({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <Card title="Нужно подключить базу данных">
        <p className="text-sm text-slate-600">{message}</p>
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
          <li>В проекте на Vercel откройте <b>Storage</b> (или Marketplace) и создайте базу <b>Neon · Postgres</b>.</li>
          <li>Привяжите её к проекту — в Environment Variables появится <code className="rounded bg-slate-100 px-1">DATABASE_URL</code>.</li>
          <li>Добавьте <code className="rounded bg-slate-100 px-1">ADMIN_KEY</code> и <code className="rounded bg-slate-100 px-1">INTAKE_SECRET</code> (любые длинные строки) и сделайте <b>Redeploy</b>.</li>
        </ol>
        <p className="mt-4 text-xs text-slate-400">Таблицы создаются автоматически при первом открытии страницы.</p>
      </Card>
    </div>
  );
}
