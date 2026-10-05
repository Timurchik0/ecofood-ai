// Приём ответов Google-формы: Apps Script шлёт сюда каждый новый ответ (и накопленные — разово).
//   POST /api/intake   заголовок  x-intake-secret: <INTAKE_SECRET>
//   тело: { "batch": [ { "timestamp": "04.10.2026 14:23:11", "answers": { "<название вопроса>": "<ответ>" } } ] }
//   (одиночная заявка: { "timestamp": "...", "answers": {...} })
// Повторная отправка безопасна: дубликаты отсекаются по отметке времени.

import { after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { importRecords } from "@/lib/sheet";
import { runAiBatch } from "@/lib/ai";
import type { RawAnswers } from "@/lib/intake";
import { DbNotConfigured } from "@/lib/db";

export const maxDuration = 300;

type Item = { timestamp?: string; answers?: RawAnswers };

function authorized(req: Request): boolean {
  const secret = process.env.INTAKE_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const given = req.headers.get("x-intake-secret") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!process.env.INTAKE_SECRET && process.env.NODE_ENV === "production") {
    return Response.json({ error: "INTAKE_SECRET не задан на сервере" }, { status: 503 });
  }
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { batch?: Item[] } & Item;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const items = (Array.isArray(body.batch) ? body.batch : [body]).slice(0, 500);
  const records: RawAnswers[] = items
    .filter((i) => i && typeof i.answers === "object" && i.answers)
    .map((i) => ({ ...i.answers, ...(i.timestamp ? { "Отметка времени": i.timestamp } : {}) }));
  if (!records.length) return Response.json({ error: "Нет данных в answers" }, { status: 400 });

  try {
    const r = await importRecords(records, "google_form");
    if (r.ids.length) after(() => runAiBatch(r.ids));
    return Response.json({ added: r.added, duplicates: r.duplicates, failed: r.failed, errors: r.errors });
  } catch (e) {
    const status = e instanceof DbNotConfigured ? 503 : 500;
    return Response.json({ error: e instanceof Error ? e.message : "Ошибка сервера" }, { status });
  }
}

export async function GET() {
  return Response.json({ ok: true, service: "EcoFood AI intake", method: "POST" });
}
