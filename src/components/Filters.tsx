"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Opt = { value: string; label: string };

export type FilterValues = {
  temperature?: string;
  region?: string;
  activity?: string;
  waste?: string;
  status?: string;
  q?: string;
  review?: string;
  demo?: string;
};

const sel =
  "h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-700 shadow-sm focus:border-emerald-500";

export default function Filters({
  values,
  regions,
  activities,
  wastes,
  statuses,
  showDemoToggle,
  demoOn,
}: {
  values: FilterValues;
  regions: Opt[];
  activities: Opt[];
  wastes: Opt[];
  statuses: Opt[];
  showDemoToggle: boolean;
  demoOn: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState(values.q ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const first = useRef(true);

  function push(next: FilterValues) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const qs = p.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }

  // поиск по названию — с задержкой, чтобы не дёргать сервер на каждую букву
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => push({ ...values, q }), 350);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const set = (key: keyof FilterValues) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    push({ ...values, q, [key]: e.target.value });

  const active = Object.entries(values).some(([k, v]) => v && k !== "demo");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Поиск по названию…"
        aria-label="Поиск по названию"
        className={`${sel} w-48`}
      />
      <select aria-label="Температура" className={sel} value={values.temperature ?? ""} onChange={set("temperature")}>
        <option value="">Все: HOT / WARM / COLD</option>
        <option value="HOT">HOT</option>
        <option value="WARM">WARM</option>
        <option value="COLD">COLD</option>
      </select>
      <select aria-label="Регион" className={sel} value={values.region ?? ""} onChange={set("region")}>
        <option value="">Все регионы</option>
        {regions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select aria-label="Вид деятельности" className={`${sel} max-w-56`} value={values.activity ?? ""} onChange={set("activity")}>
        <option value="">Все виды деятельности</option>
        {activities.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select aria-label="Тип отходов" className={`${sel} max-w-52`} value={values.waste ?? ""} onChange={set("waste")}>
        <option value="">Все типы отходов</option>
        {wastes.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select aria-label="Статус в CRM" className={sel} value={values.status ?? ""} onChange={set("status")}>
        <option value="">Все статусы CRM</option>
        {statuses.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <label className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-700 shadow-sm">
        <input
          type="checkbox"
          checked={values.review === "1"}
          onChange={(e) => push({ ...values, q, review: e.target.checked ? "1" : "" })}
          className="accent-emerald-600"
        />
        Проверить вручную
      </label>
      {showDemoToggle && (
        <label className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-700 shadow-sm">
          <input
            type="checkbox"
            checked={demoOn}
            onChange={(e) => push({ ...values, q, demo: e.target.checked ? "1" : "0" })}
            className="accent-emerald-600"
          />
          Демо-данные
        </label>
      )}
      {active && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            push({ demo: values.demo });
          }}
          className="h-9 rounded-lg px-2.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          Сбросить
        </button>
      )}
    </div>
  );
}
