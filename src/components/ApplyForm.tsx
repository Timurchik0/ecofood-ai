"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { submitApplication } from "@/app/apply/actions";
import type { ApplyState } from "@/app/apply/actions";
import { ACTIVITIES, FREQUENCIES, HANDLING, HANDOVER, INTEREST, OTHER, PRIORITIES, REGIONS, WASTE_TYPES } from "@/lib/config";

const input =
  "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
    >
      {pending ? "Отправляем…" : "Отправить анкету"}
    </button>
  );
}

function Q({ n, label, hint, children }: { n: number; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-slate-200 bg-white p-4">
      <legend className="sr-only">{label}</legend>
      <div className="text-sm font-medium text-slate-900">
        <span className="mr-1.5 text-emerald-700">{n}.</span>
        {label}
      </div>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      {children}
    </fieldset>
  );
}

function Radios({ name, options }: { name: string; options: readonly string[] }) {
  return (
    <div className="mt-2 space-y-1.5">
      {options.map((o) => (
        <label key={o} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="radio" name={name} value={o} required className="accent-emerald-600" />
          {o}
        </label>
      ))}
    </div>
  );
}

export default function ApplyForm() {
  const [state, action] = useActionState<ApplyState, FormData>(submitApplication, {});
  const [activity, setActivity] = useState("");

  if (state.ok) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <div className="text-lg font-semibold text-emerald-900">Спасибо! Анкета получена</div>
        <p className="mx-auto mt-2 max-w-md text-sm text-emerald-800">
          Мы изучим ответы и свяжемся с вами, если вы оставили контакт. Ваша заявка уже попала в скоринг и появилась на дашборде.
        </p>
        <a href="/apply" className="mt-4 inline-block text-sm text-emerald-800 underline">Заполнить ещё одну анкету</a>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      {/* ловушка для ботов */}
      <div className="hidden" aria-hidden>
        <label>Сайт<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <Q n={1} label="Название предприятия">
        <input name="company" required maxLength={200} className={input} />
      </Q>

      <Q n={2} label="Регион, в котором расположено предприятие">
        <select name="region" required defaultValue="" className={input}>
          <option value="" disabled>Выберите…</option>
          {REGIONS.map((r) => <option key={r}>{r}</option>)}
        </select>
      </Q>

      <Q n={3} label="Вид деятельности предприятия">
        <select
          name="activity"
          required
          defaultValue=""
          onChange={(e) => setActivity(e.target.value)}
          className={input}
        >
          <option value="" disabled>Выберите…</option>
          {ACTIVITIES.map((a) => <option key={a}>{a}</option>)}
          <option>{OTHER}</option>
        </select>
        {activity === OTHER && (
          <input name="activityOther" maxLength={120} placeholder="Уточните вид деятельности" className={input} />
        )}
      </Q>

      <Q n={4} label="Какие пищевые отходы преимущественно образуются на вашем предприятии?" hint="Можно выбрать несколько вариантов">
        <div className="mt-2 space-y-1.5">
          {WASTE_TYPES.map((w) => (
            <label key={w} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="wasteTypes" value={w} className="accent-emerald-600" />
              {w}
            </label>
          ))}
          <input name="wasteOther" maxLength={120} placeholder="Другое (укажите)" className={input} />
        </div>
      </Q>

      <Q n={5} label="Какой примерный объём пищевых отходов образуется в месяц?" hint="Укажите примерный объём в кг, например: 500">
        <input name="volume" required maxLength={100} placeholder="кг в месяц" className={input} />
      </Q>

      <Q n={6} label="Как часто осуществляется вывоз пищевых отходов?">
        <Radios name="frequency" options={FREQUENCIES} />
      </Q>

      <Q n={7} label="Как сейчас осуществляется вывоз/передача пищевых отходов вашего предприятия?">
        <Radios name="handling" options={HANDLING} />
      </Q>

      <Q n={8} label="Сколько примерно предприятие тратит на вывоз/утилизацию пищевых отходов в месяц?" hint="Укажите примерную сумму в сомах, например: 5000">
        <input name="cost" required maxLength={100} placeholder="сом в месяц" className={input} />
      </Q>

      <Q n={9} label="Рассмотрели бы вы передачу пищевых отходов специализированному переработчику, если это позволит сократить расходы на их вывоз?">
        <Radios name="handover" options={HANDOVER} />
      </Q>

      <Q n={10} label="Что для вас наиболее важно при выборе переработчика?">
        <Radios name="priority" options={PRIORITIES} />
      </Q>

      <Q n={11} label="Готовы ли вы принять участие в коротком интервью или рассмотреть участие в пилотном проекте?">
        <Radios name="interest" options={INTEREST} />
      </Q>

      <Q n={12} label="Если да или возможно, оставьте контакт и имя контактного лица" hint="Телефон / WhatsApp / e-mail и как к вам обращаться">
        <input name="contact" maxLength={200} placeholder="+996 …, Айбек" className={input} />
      </Q>

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
          {state.error}
        </p>
      )}
      <Submit />
    </form>
  );
}
