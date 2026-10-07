"use client";

import { startTransition, useActionState, useState } from "react";
import { scoringAction } from "@/app/admin/actions";
import type { ScoringState } from "@/app/admin/actions";
import { CRITERIA_LABELS } from "@/lib/scoring";
import type { Criterion, ScoringConfig } from "@/lib/scoring";

const field =
  "h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm tabular-nums shadow-sm focus:border-emerald-500";

const CRITERIA: Criterion[] = ["volume", "handover", "frequency", "pilot", "cost", "handling"];

export default function SettingsForm({ initial }: { initial: ScoringConfig }) {
  const [state, run, pending] = useActionState<ScoringState, FormData>(scoringAction, {});
  const [weights, setWeights] = useState(initial.weights);
  const total = CRITERIA.reduce((s, c) => s + (Number(weights[c]) || 0), 0);

  return (
    <form
      className="space-y-6"
      // Отправляем вручную (а не через action=), иначе React 19 после ответа сервера
      // сбрасывает поля к исходным значениям, и введённые пороги пропадают из формы.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => run(data));
      }}
    >
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Веса критериев (баллы)</h3>
        <p className="text-xs text-slate-500">
          Сумма сейчас: <b className={total === 100 ? "text-emerald-700" : "text-amber-700"}>{total}</b>
          {total !== 100 && " — итоговый балл всё равно приводится к шкале 0–100"}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CRITERIA.map((c) => (
            <label key={c} className="flex flex-col justify-between gap-1 text-xs text-slate-600">
              {CRITERIA_LABELS[c]}
              <input
                name={`w_${c}`}
                type="number"
                min={0}
                max={100}
                defaultValue={initial.weights[c]}
                onChange={(e) => setWeights((w) => ({ ...w, [c]: Number(e.target.value) }))}
                className={field}
              />
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-800">Статусы лидов (по шкале 0–100)</h3>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:max-w-md">
          <label className="flex flex-col justify-between gap-1 text-xs text-slate-600">
            HOT — от (баллов)
            <input name="hot" type="number" min={1} max={100} defaultValue={initial.hot} className={field} />
          </label>
          <label className="flex flex-col justify-between gap-1 text-xs text-slate-600">
            WARM — от (баллов)
            <input name="warm" type="number" min={1} max={100} defaultValue={initial.warm} className={field} />
          </label>
        </div>
        <p className="mt-1 text-xs text-slate-500">Всё ниже порога WARM — COLD.</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Границы объёма, кг в месяц</h3>
          <p className="text-xs text-slate-500">очень малый → малый → средний → крупный</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {initial.volumeBands.map((v, i) => (
              <input key={i} name={`vb${i}`} type="number" min={0} defaultValue={v} aria-label={`Граница объёма ${i + 1}`} className={field} />
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Границы расходов, сом в месяц</h3>
          <p className="text-xs text-slate-500">низкие → средние → высокие → очень высокие</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {initial.costBands.map((v, i) => (
              <input key={i} name={`cb${i}`} type="number" min={0} defaultValue={v} aria-label={`Граница расходов ${i + 1}`} className={field} />
            ))}
          </div>
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name="refusalCold" defaultChecked={initial.refusalCold} className="mt-0.5 accent-emerald-600" />
        <span>
          Ответ «Нет» на передачу отходов переработчику — лид автоматически COLD
          <span className="block text-xs text-slate-500">
            Без этого правила такое предприятие могло бы набрать до 75 баллов за счёт объёма и расходов и попасть в HOT.
          </span>
        </span>
      </label>

      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state.saved && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
          {state.saved}
        </p>
      )}
      {state.preview && (
        <div role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="font-medium text-slate-800">
            Предпросмотр: статус изменится у {state.preview.changed} из {state.preview.total} заявок
          </div>
          <table className="mt-2 text-xs tabular-nums">
            <thead>
              <tr className="text-slate-500">
                <th className="pr-4 text-left font-medium"> </th>
                <th className="pr-4 text-left font-medium">HOT</th>
                <th className="pr-4 text-left font-medium">WARM</th>
                <th className="text-left font-medium">COLD</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="pr-4 text-slate-500">Сейчас</td>
                <td className="pr-4">{state.preview.current.HOT}</td>
                <td className="pr-4">{state.preview.current.WARM}</td>
                <td>{state.preview.current.COLD}</td>
              </tr>
              <tr className="font-semibold">
                <td className="pr-4 text-slate-500">С новыми настройками</td>
                <td className="pr-4">{state.preview.next.HOT}</td>
                <td className="pr-4">{state.preview.next.WARM}</td>
                <td>{state.preview.next.COLD}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Это только расчёт: пока вы не нажали «Сохранить», ничего не изменилось.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button name="intent" value="preview" disabled={pending} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          Предпросмотр
        </button>
        <button name="intent" value="save" disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
          Сохранить и пересчитать
        </button>
        <button name="intent" value="reset" disabled={pending} className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100" formNoValidate>
          Сбросить к рекомендованным
        </button>
      </div>
    </form>
  );
}
