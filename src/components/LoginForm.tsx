"use client";

import { useActionState } from "react";
import { login } from "@/app/admin/actions";
import type { LoginState } from "@/app/admin/actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm text-slate-700">
        Ключ администратора
        <input
          name="key"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm shadow-sm focus:border-emerald-500"
        />
      </label>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <button disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
        Войти
      </button>
    </form>
  );
}
