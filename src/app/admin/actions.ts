"use server";

import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminToken, canConfigure, isAdmin, keyMatches } from "@/lib/admin";
import { aiConfigured, runAiBatch } from "@/lib/ai";
import { seedDemo } from "@/lib/demo";
import {
  DEFAULT_SCORING,
  sanitizeConfig,
} from "@/lib/scoring";
import type { Criterion, ScoringConfig, Temperature } from "@/lib/scoring";
import { counts, deleteDemo, previewConfig, rescoreAll, saveConfig, setSetting } from "@/lib/leads";
import { query } from "@/lib/db";
import { tooMany } from "@/lib/ratelimit";
import { syncSheet } from "@/lib/sheet";

const flash = (msg: string): never => redirect(`/admin?msg=${encodeURIComponent(msg)}`);

async function guard() {
  if (!(await isAdmin())) redirect("/admin");
}

export type LoginState = { error?: string };

export async function login(_prev: LoginState, fd: FormData): Promise<LoginState> {
  // ключ может быть коротким, поэтому ограничиваем число попыток с одного адреса
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  if (tooMany(`login:${ip}`, 8, 15 * 60_000)) {
    return { error: "Слишком много попыток входа. Подождите 15 минут." };
  }
  const key = String(fd.get("key") ?? "");
  if (!keyMatches(key)) return { error: "Неверный ключ" };
  (await cookies()).set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/admin");
}

export async function logout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/");
}

// ---------- настройки скоринга ----------

export type ScoringState = {
  error?: string;
  saved?: string;
  preview?: {
    total: number;
    current: Record<Temperature, number>;
    next: Record<Temperature, number>;
    changed: number;
  };
};

function configFromForm(fd: FormData): ScoringConfig {
  const n = (k: string) => Number(String(fd.get(k) ?? "").replace(/\s/g, "").replace(",", "."));
  const weights = {} as Record<Criterion, number>;
  (Object.keys(DEFAULT_SCORING.weights) as Criterion[]).forEach((c) => (weights[c] = n(`w_${c}`)));
  return sanitizeConfig({
    weights,
    hot: n("hot"),
    warm: n("warm"),
    volumeBands: [n("vb0"), n("vb1"), n("vb2")],
    costBands: [n("cb0"), n("cb1"), n("cb2")],
    refusalCold: fd.get("refusalCold") === "on",
  });
}

export async function scoringAction(_prev: ScoringState, fd: FormData): Promise<ScoringState> {
  if (!(await canConfigure())) return { error: "Нет доступа" };
  const intent = String(fd.get("intent") ?? "preview");

  // настройки открыты без входа — ограничиваем частоту сохранений с одного адреса (предпросмотр не ограничиваем)
  if (intent !== "preview") {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
    if (tooMany(`cfg:${ip}`, 20)) return { error: "Слишком много изменений настроек. Попробуйте позже." };
  }

  if (intent === "reset") {
    await saveConfig(DEFAULT_SCORING);
    const n = await rescoreAll(DEFAULT_SCORING);
    revalidatePath("/", "layout");
    // после сохранения форма пересоздаётся с новыми значениями, поэтому подтверждение показываем плашкой на перезагруженной странице
    flash(`Настройки сброшены к рекомендованным. Пересчитано заявок: ${n}.`);
  }

  const cfg = configFromForm(fd);
  if (intent === "save") {
    await saveConfig(cfg);
    const n = await rescoreAll(cfg);
    revalidatePath("/", "layout");
    flash(`Сохранено. Баллы пересчитаны у ${n} заявок — сами ответы не менялись.`);
  }
  return { preview: await previewConfig(cfg) };
}

// ---------- данные ----------

export async function seedAction() {
  await guard();
  const ids = await seedDemo();
  if (aiConfigured()) after(() => runAiBatch(ids));
  else await runAiBatch(ids);
  revalidatePath("/", "layout");
  if (ids.length === 0) {
    // демо уже в базе (повторная загрузка дубликатов не создаёт) — объясняем, где их смотреть
    const { demo, real } = await counts();
    flash(
      `Демо-данные уже загружены (${demo} шт.), повторно они не добавляются.` +
        (real > 0 ? " На дашборде они скрыты, пока есть реальные заявки: включите переключатель «Демо-данные» над таблицей." : ""),
    );
  }
  flash(`Загружено демо-заявок: ${ids.length}`);
}

export async function deleteDemoAction() {
  await guard();
  const n = await deleteDemo();
  revalidatePath("/", "layout");
  flash(`Демо-данные удалены: ${n}`);
}

export async function saveSheetAction(fd: FormData) {
  await guard();
  const url = String(fd.get("url") ?? "").trim();
  await setSetting("sheet", { url });
  if (!url) flash("Ссылка на таблицу удалена");
  const r = await syncSheet();
  if (r.ids.length) after(() => runAiBatch(r.ids));
  revalidatePath("/", "layout");
  flash(r.error ? `Ошибка: ${r.error}` : `Таблица подключена. Добавлено ${r.added}, уже были ${r.duplicates}`);
}

export async function syncNowAction() {
  await guard();
  const r = await syncSheet();
  if (r.ids.length) after(() => runAiBatch(r.ids));
  revalidatePath("/", "layout");
  flash(r.error ? `Ошибка: ${r.error}` : `Синхронизировано. Добавлено ${r.added}, уже были ${r.duplicates}`);
}

export async function aiMissingAction() {
  await guard();
  if (!aiConfigured()) flash("AI не подключён: добавьте ANTHROPIC_API_KEY в переменные окружения");
  const rows = await query<{ id: number }>(
    "select id from leads where ai_model is null or ai_model = 'rules' order by score desc limit 60",
  );
  const ids = rows.map((r) => r.id);
  after(() => runAiBatch(ids));
  flash(`AI-заметки запущены для ${ids.length} заявок — обновите дашборд через минуту`);
}
