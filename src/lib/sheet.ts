// Загрузка ответов из Google-таблицы (CSV) и импорт CSV-файла.
// Таблица, привязанная к форме, содержит заголовки = названия вопросов + «Отметка времени».
// Дубликаты отсекаются по отметке времени, поэтому синхронизацию можно запускать сколько угодно раз.

import { after } from "next/server";
import { csvToRecords } from "./csv";
import { toCsvUrl } from "./sheetUrl";
import { ingest, mapAnswers, parseTimestamp, stableId } from "./intake";
import type { RawAnswers } from "./intake";
import { getConfig, getSetting, setSetting } from "./leads";
import { runAiBatch } from "./ai";

export type ImportSummary = {
  added: number;
  duplicates: number;
  failed: number;
  errors: string[];
  ids: number[];
};

export async function importRecords(
  records: RawAnswers[],
  source: "google_form" | "csv",
): Promise<ImportSummary> {
  const config = await getConfig();
  const out: ImportSummary = { added: 0, duplicates: 0, failed: 0, errors: [], ids: [] };
  for (const rec of records) {
    const m = mapAnswers(rec);
    const ts = parseTimestamp(m.timestamp);
    // единая формула id для CSV-синхронизации и Apps Script — чтобы они не плодили дубли
    const externalId = stableId(
      "gs",
      ts ? ts.toISOString() : `${m.company}|${m.volume}|${m.contact}`,
    );
    const r = await ingest({ answers: rec, source, externalId, config });
    if (r.ok) {
      out.added++;
      out.ids.push(r.lead.id);
    } else if (r.duplicate) out.duplicates++;
    else {
      out.failed++;
      if (out.errors.length < 5) out.errors.push(r.error);
    }
  }
  return out;
}

export async function importCsvText(text: string, source: "google_form" | "csv" = "csv") {
  return importRecords(csvToRecords(text), source);
}

export async function getSheetUrl(): Promise<string | null> {
  const s = await getSetting<{ url?: string }>("sheet");
  return s?.url || process.env.GOOGLE_SHEET_URL || null;
}

export type SyncState = { at: string; added: number; duplicates: number; error?: string };

export async function getSyncState(): Promise<SyncState | null> {
  return getSetting<SyncState>("sheet_sync");
}

/** Скачивает таблицу и добавляет новые строки. Возвращает id новых заявок. */
export async function syncSheet(): Promise<ImportSummary & { error?: string }> {
  const empty: ImportSummary = { added: 0, duplicates: 0, failed: 0, errors: [], ids: [] };
  const url = await getSheetUrl();
  if (!url) return { ...empty, error: "Ссылка на таблицу не задана" };

  try {
    const res = await fetch(toCsvUrl(url), { cache: "no-store", redirect: "follow" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || type.includes("text/html")) {
      throw new Error(
        "Таблица недоступна: откройте доступ «всем, у кого есть ссылка» или опубликуйте её как CSV (Файл → Поделиться → Опубликовать в Интернете).",
      );
    }
    const summary = await importCsvText(await res.text(), "google_form");
    await setSetting("sheet_sync", {
      at: new Date().toISOString(),
      added: summary.added,
      duplicates: summary.duplicates,
    } satisfies SyncState);
    return summary;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await setSetting("sheet_sync", { at: new Date().toISOString(), added: 0, duplicates: 0, error } satisfies SyncState);
    return { ...empty, error };
  }
}

const SYNC_EVERY_MS = 60_000;

/**
 * Вызывается при открытии дашборда: если таблица подключена и прошло больше минуты —
 * подтягивает новые ответы уже после отправки страницы (страница не ждёт).
 */
export async function scheduleSheetSync(): Promise<void> {
  try {
    if (!(await getSheetUrl())) return;
    const last = await getSyncState();
    if (last && Date.now() - new Date(last.at).getTime() < SYNC_EVERY_MS) return;
    // «занимаем» слот сразу, чтобы параллельные открытия страницы не запускали синк повторно
    await setSetting("sheet_sync", { at: new Date().toISOString(), added: 0, duplicates: 0 } satisfies SyncState);
    after(async () => {
      const r = await syncSheet();
      if (r.ids.length) await runAiBatch(r.ids);
    });
  } catch {
    /* дашборд должен открываться, даже если синхронизация не удалась */
  }
}
