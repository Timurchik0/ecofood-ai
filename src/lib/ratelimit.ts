// Простейший ограничитель для публичной формы: N отправок в окне на IP.
// Хранится в памяти инстанса — этого хватает, чтобы остановить случайный флуд
// в демо (каждая заявка запускает AI-запрос). Для продакшена — вынести в Redis/Upstash.

const hits = new Map<string, number[]>();

export function tooMany(key: string, limit = 8, windowMs = 60 * 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}
