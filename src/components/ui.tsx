import type { ReactNode } from "react";
import InfoTip from "@/components/InfoTip";
import { statusLabel } from "@/lib/config";
import { lastDays } from "@/lib/format";
import type { GroupRow } from "@/lib/leads";
import type { Temperature } from "@/lib/scoring";

export const TEMP: Record<Temperature, { label: string; text: string; bg: string; bar: string; ring: string; border: string }> = {
  HOT: { label: "HOT", text: "text-red-700", bg: "bg-red-50", bar: "bg-red-500", ring: "ring-red-200", border: "border-l-red-500" },
  WARM: { label: "WARM", text: "text-amber-700", bg: "bg-amber-50", bar: "bg-amber-400", ring: "ring-amber-200", border: "border-l-amber-400" },
  COLD: { label: "COLD", text: "text-slate-600", bg: "bg-slate-100", bar: "bg-slate-400", ring: "ring-slate-200", border: "border-l-slate-400" },
};

export function TempBadge({ t, size = "sm" }: { t: Temperature; size?: "sm" | "lg" }) {
  const c = TEMP[t];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset ${c.bg} ${c.text} ${c.ring} ${
        size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"
      }`}
    >
      <span className={`size-1.5 rounded-full ${c.bar}`} />
      {c.label}
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  new: "bg-sky-50 text-sky-700 ring-sky-200",
  contacted: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  interview: "bg-violet-50 text-violet-700 ring-violet-200",
  pilot: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  closed: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  rejected: "bg-slate-100 text-slate-500 ring-slate-200",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        STATUS_STYLE[status] ?? STATUS_STYLE.new
      }`}
    >
      {statusLabel(status)}
    </span>
  );
}

export function ScoreBar({ score, t }: { score: number; t: Temperature }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-right text-sm font-semibold tabular-nums">{score}</span>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${TEMP[t].bar}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export function Card({
  title,
  hint,
  help,
  children,
  className = "",
}: {
  title?: string;
  hint?: string;
  /** Подсказка «как это считается» (значок ⓘ рядом с заголовком) */
  help?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title && (
        <header className="mb-4">
          <h2 className="text-sm font-semibold text-slate-800">
            {title}
            {help && <InfoTip text={help} />}
          </h2>
          {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  sub,
  tone,
  help,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: Temperature | "brand";
  help?: string;
}) {
  const accent = tone === "brand" ? "border-l-4 border-l-emerald-500" : tone ? `border-l-4 ${TEMP[tone].border}` : "";
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${accent}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
        {help && <InfoTip text={help} />}
      </div>
      <div className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/** Горизонтальные полосы с разбивкой HOT / WARM / COLD внутри каждой. */
export function GroupBars({ rows, max = 8 }: { rows: GroupRow[]; max?: number }) {
  const shown = rows.slice(0, max);
  const top = Math.max(1, ...shown.map((r) => r.n));
  if (!shown.length) return <Empty />;
  return (
    <ul className="space-y-2.5">
      {shown.map((r) => (
        <li key={r.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-slate-700" title={r.key}>
              {r.key}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-900">{r.n}</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-slate-100" style={{ width: `${(r.n / top) * 100}%` }}>
            {r.hot > 0 && <div className="bg-red-500" style={{ width: `${(r.hot / r.n) * 100}%` }} />}
            {r.warm > 0 && <div className="bg-amber-400" style={{ width: `${(r.warm / r.n) * 100}%` }} />}
            {r.cold > 0 && <div className="bg-slate-400" style={{ width: `${(r.cold / r.n) * 100}%` }} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SimpleBars({ rows }: { rows: { key: string; n: number }[] }) {
  const top = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.length) return <Empty />;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-slate-700">{r.key}</span>
            <span className="font-semibold tabular-nums text-slate-900">{r.n}</span>
          </div>
          <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${(r.n / top) * 100}%` }} />
        </li>
      ))}
    </ul>
  );
}

/** Столбики заявок по дням за последние 14 дней. */
export function DayBars({ data }: { data: { day: string; n: number }[] }) {
  const byDay = new Map(data.map((d) => [d.day, d.n]));
  const days = lastDays(14).map((day) => ({ day, n: byDay.get(day) ?? 0 }));
  const top = Math.max(1, ...days.map((d) => d.n));
  if (days.every((d) => d.n === 0)) return <Empty text="За последние 14 дней заявок не было" />;
  return (
    <div>
      <div className="flex h-28 items-end gap-1.5">
        {days.map((d) => (
          <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end">
            <div
              className="min-h-px rounded-t bg-emerald-500 transition-colors group-hover:bg-emerald-600"
              style={{ height: `${(d.n / top) * 100}%`, opacity: d.n ? 1 : 0.15 }}
              title={`${d.day}: ${d.n}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-slate-400">
        <span>{days[0].day.slice(5).split("-").reverse().join(".")}</span>
        <span>сегодня</span>
      </div>
    </div>
  );
}

/** Одна горизонтальная «температурная» полоса: доля HOT / WARM / COLD. */
export function TempSplit({ hot, warm, cold }: { hot: number; warm: number; cold: number }) {
  const total = hot + warm + cold;
  if (!total) return <Empty />;
  const pct = (n: number) => Math.round((n / total) * 100);
  // подпись внутри сегмента зависит от его ширины: широкий — «HOT 44%», средний — только «11%», узкий — без текста
  const seg = (n: number, cls: string, label: string) => {
    if (n <= 0) return null;
    const share = n / total;
    const text = share >= 0.22 ? `${label} ${pct(n)}%` : share >= 0.08 ? `${pct(n)}%` : "";
    return (
      <div
        className={`${cls} flex items-center justify-center overflow-hidden whitespace-nowrap text-xs font-semibold text-white`}
        style={{ width: `${share * 100}%` }}
      >
        {text}
      </div>
    );
  };
  const legend: [string, number, string][] = [
    ["HOT", hot, "bg-red-500"],
    ["WARM", warm, "bg-amber-400"],
    ["COLD", cold, "bg-slate-400"],
  ];
  return (
    <div>
      <div className="flex h-9 overflow-hidden rounded-xl">
        {seg(hot, "bg-red-500", "HOT")}
        {seg(warm, "bg-amber-400", "WARM")}
        {seg(cold, "bg-slate-400", "COLD")}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {legend.map(([label, n, dot]) => (
          <span key={label} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <i className={`size-2 rounded-full ${dot}`} />
            {label} <b className="tabular-nums text-slate-800">{n}</b> · {pct(n)}%
          </span>
        ))}
      </div>
    </div>
  );
}

export function Empty({ text = "Данных пока нет" }: { text?: string }) {
  return <p className="py-4 text-center text-sm text-slate-400">{text}</p>;
}

export function Chip({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "amber" | "sky" }) {
  const c = {
    slate: "bg-slate-100 text-slate-600",
    amber: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
    sky: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200",
  }[tone];
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs ${c}`}>{children}</span>;
}
