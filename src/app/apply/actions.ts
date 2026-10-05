"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ingest } from "@/lib/intake";
import { runAi } from "@/lib/ai";
import { tooMany } from "@/lib/ratelimit";
import { OTHER } from "@/lib/config";

export type ApplyState = { ok?: boolean; error?: string };

const REQUIRED: [string, string][] = [
  ["company", "название предприятия"],
  ["region", "регион"],
  ["activity", "вид деятельности"],
  ["volume", "объём отходов"],
  ["frequency", "частоту вывоза"],
  ["handling", "текущий способ вывоза"],
  ["cost", "расходы на вывоз"],
  ["handover", "готовность передать отходы"],
  ["priority", "что важно при выборе переработчика"],
];

export async function submitApplication(_prev: ApplyState, fd: FormData): Promise<ApplyState> {
  // ловушка для ботов: поле скрыто от людей
  if (String(fd.get("website") ?? "").trim()) return { ok: true };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  if (tooMany(`apply:${ip}`)) {
    return { error: "Слишком много заявок с вашего адреса. Попробуйте позже." };
  }

  const get = (k: string) => String(fd.get(k) ?? "").trim();
  const wasteTypes = fd.getAll("wasteTypes").map(String).filter(Boolean);
  const other = get("wasteOther");
  if (other) wasteTypes.push(other);

  for (const [key, label] of REQUIRED) {
    if (!get(key)) return { error: `Заполните поле: ${label}.` };
  }
  if (wasteTypes.length === 0) return { error: "Выберите хотя бы один тип отходов." };

  const activity = get("activity") === OTHER && get("activityOther") ? get("activityOther") : get("activity");

  const r = await ingest({
    source: "app_form",
    answers: {
      company: get("company"),
      region: get("region"),
      activity,
      wasteTypes: wasteTypes.join(", "),
      volume: get("volume"),
      frequency: get("frequency"),
      handling: get("handling"),
      cost: get("cost"),
      handover: get("handover"),
      priority: get("priority"),
      contact: get("contact"),
    },
  });
  if (!r.ok) return { error: r.duplicate ? "Эта заявка уже получена." : r.error };

  const id = r.lead.id;
  after(() => runAi(id));
  revalidatePath("/");
  return { ok: true };
}
