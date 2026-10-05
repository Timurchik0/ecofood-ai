import { query } from "./db";
import { sanitizeConfig, scoreLead, DEFAULT_SCORING } from "./scoring";
import type { CriterionResult, ScoreResult, ScoringConfig, Temperature } from "./scoring";

export type Flag = { code: string; text: string; review: boolean };

export type Lead = {
  id: number;
  createdAt: Date;
  source: string;
  externalId: string | null;
  isDemo: boolean;
  company: string;
  region: string | null;
  activity: string | null;
  activityOther: string | null;
  wasteTypes: string[];
  volumeRaw: string | null;
  volumeKg: number | null;
  frequency: string | null;
  handling: string | null;
  costRaw: string | null;
  costSom: number | null;
  handover: string | null;
  priority: string | null;
  contactRaw: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  contactOk: boolean;
  interest: string | null;
  score: number;
  rawScore: number;
  temperature: Temperature;
  breakdown: CriterionResult[];
  flags: Flag[];
  needsReview: boolean;
  status: string;
  note: string | null;
  aiSummary: string | null;
  aiWhy: string | null;
  aiNextStep: string | null;
  aiQuestions: string[];
  aiModel: string | null;
  aiAt: Date | null;
  aiError: string | null;
  answers: Record<string, unknown>;
};

type DbRow = Record<string, unknown>;

export function rowToLead(r: DbRow): Lead {
  return {
    id: r.id as number,
    createdAt: new Date(r.created_at as string),
    source: r.source as string,
    externalId: (r.external_id as string) ?? null,
    isDemo: Boolean(r.is_demo),
    company: r.company as string,
    region: (r.region as string) ?? null,
    activity: (r.activity as string) ?? null,
    activityOther: (r.activity_other as string) ?? null,
    wasteTypes: (r.waste_types as string[]) ?? [],
    volumeRaw: (r.volume_raw as string) ?? null,
    volumeKg: (r.volume_kg as number) ?? null,
    frequency: (r.frequency as string) ?? null,
    handling: (r.handling as string) ?? null,
    costRaw: (r.cost_raw as string) ?? null,
    costSom: (r.cost_som as number) ?? null,
    handover: (r.handover as string) ?? null,
    priority: (r.priority as string) ?? null,
    contactRaw: (r.contact_raw as string) ?? null,
    contactPhone: (r.contact_phone as string) ?? null,
    contactEmail: (r.contact_email as string) ?? null,
    contactOk: Boolean(r.contact_ok),
    interest: (r.interest as string) ?? null,
    score: r.score as number,
    rawScore: r.raw_score as number,
    temperature: r.temperature as Temperature,
    breakdown: (r.breakdown as CriterionResult[]) ?? [],
    flags: (r.flags as Flag[]) ?? [],
    needsReview: Boolean(r.needs_review),
    status: r.status as string,
    note: (r.note as string) ?? null,
    aiSummary: (r.ai_summary as string) ?? null,
    aiWhy: (r.ai_why as string) ?? null,
    aiNextStep: (r.ai_next_step as string) ?? null,
    aiQuestions: (r.ai_questions as string[]) ?? [],
    aiModel: (r.ai_model as string) ?? null,
    aiAt: r.ai_at ? new Date(r.ai_at as string) : null,
    aiError: (r.ai_error as string) ?? null,
    answers: (r.answers as Record<string, unknown>) ?? {},
  };
}

// ---------- настройки скоринга (пороги и веса живут в БД) ----------

export async function getConfig(): Promise<ScoringConfig> {
  const rows = await query<{ value: unknown }>("select value from settings where key = 'scoring'");
  return rows.length ? sanitizeConfig(rows[0].value) : DEFAULT_SCORING;
}

export async function saveConfig(cfg: ScoringConfig): Promise<void> {
  await query(
    `insert into settings (key, value) values ('scoring', $1::jsonb)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify(cfg)],
  );
}

export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const rows = await query<{ value: T }>("select value from settings where key = $1", [key]);
  return rows.length ? rows[0].value : null;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await query(
    `insert into settings (key, value) values ($1, $2::jsonb)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

// ---------- запись ----------

export type NewLead = {
  source: string;
  externalId: string | null;
  isDemo: boolean;
  createdAt: Date | null;
  company: string;
  region: string | null;
  activity: string | null;
  activityOther: string | null;
  wasteTypes: string[];
  volumeRaw: string | null;
  volumeKg: number | null;
  frequency: string | null;
  handling: string | null;
  costRaw: string | null;
  costSom: number | null;
  handover: string | null;
  priority: string | null;
  contactRaw: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  contactOk: boolean;
  interest: string | null;
  score: ScoreResult;
  flags: Flag[];
  status: string;
  answers: Record<string, unknown>;
  ai?: { summary: string; why: string; nextStep: string; questions: string[]; model: string } | null;
};

/** Возвращает null, если заявка с таким external_id уже есть (дубликат). */
export async function insertLead(l: NewLead): Promise<Lead | null> {
  const rows = await query(
    `insert into leads (
       created_at, source, external_id, is_demo, company, region, activity, activity_other,
       waste_types, volume_raw, volume_kg, frequency, handling, cost_raw, cost_som, handover,
       priority, contact_raw, contact_phone, contact_email, contact_ok,
       score, raw_score, temperature, breakdown, flags, needs_review, status, answers,
       ai_summary, ai_why, ai_next_step, ai_questions, ai_model, ai_at, interest
     ) values (
       coalesce($1::timestamptz, now()), $2, $3, $4, $5, $6, $7, $8,
       $9::jsonb, $10, $11, $12, $13, $14, $15, $16,
       $17, $18, $19, $20, $21,
       $22, $23, $24, $25::jsonb, $26::jsonb, $27, $28, $29::jsonb,
       $30, $31, $32, $33::jsonb, $34, case when $34::text is null then null else now() end, $35
     )
     on conflict (external_id) do nothing
     returning *`,
    [
      l.createdAt ? l.createdAt.toISOString() : null,
      l.source,
      l.externalId,
      l.isDemo,
      l.company,
      l.region,
      l.activity,
      l.activityOther,
      JSON.stringify(l.wasteTypes),
      l.volumeRaw,
      l.volumeKg,
      l.frequency,
      l.handling,
      l.costRaw,
      l.costSom,
      l.handover,
      l.priority,
      l.contactRaw,
      l.contactPhone,
      l.contactEmail,
      l.contactOk,
      l.score.score,
      l.score.rawScore,
      l.score.temperature,
      JSON.stringify(l.score.breakdown),
      JSON.stringify(l.flags),
      l.flags.some((f) => f.review),
      l.status,
      JSON.stringify(l.answers),
      l.ai?.summary ?? null,
      l.ai?.why ?? null,
      l.ai?.nextStep ?? null,
      l.ai ? JSON.stringify(l.ai.questions) : null,
      l.ai?.model ?? null,
      l.interest,
    ],
  );
  return rows.length ? rowToLead(rows[0]) : null;
}

export async function setStatus(id: number, status: string): Promise<void> {
  await query("update leads set status = $2 where id = $1", [id, status]);
}

export async function setNote(id: number, note: string): Promise<void> {
  await query("update leads set note = $2 where id = $1", [id, note.slice(0, 2000) || null]);
}

export async function saveAi(
  id: number,
  ai: { summary: string; why: string; nextStep: string; questions: string[]; model: string },
): Promise<void> {
  await query(
    `update leads set ai_summary=$2, ai_why=$3, ai_next_step=$4, ai_questions=$5::jsonb,
       ai_model=$6, ai_at=now(), ai_error=null where id=$1`,
    [id, ai.summary, ai.why, ai.nextStep, JSON.stringify(ai.questions), ai.model],
  );
}

export async function saveAiError(id: number, error: string): Promise<void> {
  await query("update leads set ai_error = $2 where id = $1", [id, error.slice(0, 500)]);
}

export function scoreInputOf(
  l: Pick<Lead, "volumeKg" | "costSom" | "frequency" | "handling" | "handover" | "contactOk" | "interest">,
) {
  return {
    volumeKg: l.volumeKg,
    costSom: l.costSom,
    frequency: l.frequency,
    handling: l.handling,
    handover: l.handover,
    hasContact: l.contactOk,
    interest: (l.interest as "yes" | "maybe" | "no" | null) ?? null,
  };
}

async function writeScore(id: number, s: ScoreResult): Promise<void> {
  await query(
    `update leads set score=$2, raw_score=$3, temperature=$4, breakdown=$5::jsonb where id=$1`,
    [id, s.score, s.rawScore, s.temperature, JSON.stringify(s.breakdown)],
  );
}

/** Подставляет числа, которые AI разобрал из свободного текста, и пересчитывает балл. true — если что-то изменилось. */
export async function applyAiNumbers(
  lead: Lead,
  nums: { volumeKg: number | null; costSom: number | null },
  cfg: ScoringConfig,
): Promise<boolean> {
  const volumeKg = lead.volumeKg == null && nums.volumeKg != null ? nums.volumeKg : lead.volumeKg;
  const costSom = lead.costSom == null && nums.costSom != null ? nums.costSom : lead.costSom;
  if (volumeKg === lead.volumeKg && costSom === lead.costSom) return false;
  const flags = lead.flags
    .filter((f) => !(volumeKg !== lead.volumeKg && f.code.startsWith("volume")) && !(costSom !== lead.costSom && f.code.startsWith("cost")))
    .concat([{ code: "ai_parsed", text: "число разобрано AI из свободного текста — проверьте", review: false }]);
  const s = scoreLead(scoreInputOf({ ...lead, volumeKg, costSom }), cfg);
  await query(
    `update leads set volume_kg=$2, cost_som=$3, flags=$4::jsonb, needs_review=$5 where id=$1`,
    [lead.id, volumeKg, costSom, JSON.stringify(flags), flags.some((f) => f.review)],
  );
  await writeScore(lead.id, s);
  return true;
}

/** Пересчитывает баллы ВСЕХ заявок по новым настройкам. Ответы не меняются. */
export async function rescoreAll(cfg: ScoringConfig): Promise<number> {
  const rows = await query("select * from leads");
  const leads = rows.map(rowToLead);
  for (let i = 0; i < leads.length; i += 25) {
    await Promise.all(
      leads.slice(i, i + 25).map((l) => writeScore(l.id, scoreLead(scoreInputOf(l), cfg))),
    );
  }
  return leads.length;
}

/** Что изменится при новых настройках — без записи в базу. */
export async function previewConfig(cfg: ScoringConfig) {
  const leads = (await query("select * from leads")).map(rowToLead);
  const count = (t: Temperature, f: (l: Lead) => Temperature) => leads.filter((l) => f(l) === t).length;
  const next = (l: Lead) => scoreLead(scoreInputOf(l), cfg).temperature;
  const temps: Temperature[] = ["HOT", "WARM", "COLD"];
  return {
    total: leads.length,
    current: Object.fromEntries(temps.map((t) => [t, count(t, (l) => l.temperature)])) as Record<Temperature, number>,
    next: Object.fromEntries(temps.map((t) => [t, count(t, next)])) as Record<Temperature, number>,
    changed: leads.filter((l) => next(l) !== l.temperature).length,
  };
}

export async function deleteDemo(): Promise<number> {
  const rows = await query<{ id: number }>("delete from leads where is_demo returning id");
  return rows.length;
}

// ---------- чтение ----------

export type Filters = {
  temperature?: string;
  region?: string;
  activity?: string;
  waste?: string;
  status?: string;
  q?: string;
  review?: boolean;
  includeDemo: boolean;
};

function where(f: Filters): { sql: string; params: unknown[] } {
  const c: string[] = [];
  const p: unknown[] = [];
  const add = (cond: string, v: unknown) => {
    p.push(v);
    c.push(cond.replace("?", `$${p.length}`));
  };
  if (!f.includeDemo) c.push("not is_demo");
  if (f.temperature) add("temperature = ?", f.temperature);
  if (f.region) add("region = ?", f.region);
  if (f.activity) add("activity = ?", f.activity);
  if (f.status) add("status = ?", f.status);
  if (f.waste) add("waste_types @> ?::jsonb", JSON.stringify([f.waste]));
  if (f.q) add("company ilike ?", `%${f.q}%`);
  if (f.review) c.push("needs_review");
  return { sql: c.length ? `where ${c.join(" and ")}` : "", params: p };
}

export async function listLeads(f: Filters, limit = 300): Promise<Lead[]> {
  const w = where(f);
  const rows = await query(
    `select * from leads ${w.sql} order by score desc, created_at desc limit ${Math.min(limit, 1000)}`,
    w.params,
  );
  return rows.map(rowToLead);
}

export async function getLead(id: number): Promise<Lead | null> {
  const rows = await query("select * from leads where id = $1", [id]);
  return rows.length ? rowToLead(rows[0]) : null;
}

export async function counts(): Promise<{ real: number; demo: number }> {
  const r = await query<{ real: number; demo: number }>(
    `select count(*) filter (where not is_demo)::int as real,
            count(*) filter (where is_demo)::int as demo from leads`,
  );
  return r[0] ?? { real: 0, demo: 0 };
}

export type GroupRow = { key: string; n: number; hot: number; warm: number; cold: number };

export type Stats = {
  total: number;
  hot: number;
  warm: number;
  cold: number;
  avgScore: number;
  totalKg: number;
  totalCost: number;
  newCount: number;
  noContact: number;
  review: number;
  withContact: number;
  byActivity: GroupRow[];
  byRegion: GroupRow[];
  byWaste: { key: string; n: number }[];
  byDay: { day: string; n: number }[];
};

export async function getStats(includeDemo: boolean): Promise<Stats> {
  const cond = includeDemo ? "" : "where not is_demo";
  const group = (col: string) =>
    query<GroupRow>(
      `select coalesce(${col}, '—') as key, count(*)::int as n,
         count(*) filter (where temperature='HOT')::int as hot,
         count(*) filter (where temperature='WARM')::int as warm,
         count(*) filter (where temperature='COLD')::int as cold
       from leads ${cond} group by 1 order by n desc`,
    );
  const [tot, byActivity, byRegion, byWaste, byDay] = await Promise.all([
    query<Record<string, number>>(
      `select count(*)::int as total,
         count(*) filter (where temperature='HOT')::int as hot,
         count(*) filter (where temperature='WARM')::int as warm,
         count(*) filter (where temperature='COLD')::int as cold,
         coalesce(avg(score),0)::float as avg_score,
         coalesce(sum(volume_kg),0)::float as total_kg,
         coalesce(sum(cost_som),0)::float as total_cost,
         count(*) filter (where status='new')::int as new_count,
         count(*) filter (where not contact_ok)::int as no_contact,
         count(*) filter (where needs_review)::int as review
       from leads ${cond}`,
    ),
    group("activity"),
    group("region"),
    query<{ key: string; n: number }>(
      `select w as key, count(*)::int as n from leads, jsonb_array_elements_text(waste_types) w
       ${cond} group by 1 order by n desc`,
    ),
    query<{ day: string; n: number }>(
      `select to_char(created_at at time zone 'Asia/Bishkek', 'YYYY-MM-DD') as day, count(*)::int as n
       from leads where created_at > now() - interval '30 days' ${includeDemo ? "" : "and not is_demo"}
       group by 1 order by 1`,
    ),
  ]);
  const t = tot[0];
  return {
    total: t.total,
    hot: t.hot,
    warm: t.warm,
    cold: t.cold,
    avgScore: Math.round(t.avg_score),
    totalKg: t.total_kg,
    totalCost: t.total_cost,
    newCount: t.new_count,
    noContact: t.no_contact,
    review: t.review,
    withContact: t.total - t.no_contact,
    byActivity,
    byRegion,
    byWaste,
    byDay,
  };
}
