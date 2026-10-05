// Доступ администратора. Открытая демо-версия работает без входа, но:
//  • контакты в ней замаскированы (раскрываются только админу);
//  • настройки скоринга, импорт, демо-данные и ссылка на таблицу — только для админа.
// Ключ задаётся переменной ADMIN_KEY. Локально (без ключа) админом считается любой.

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "eco_admin";

const adminKey = () => process.env.ADMIN_KEY || "";

const token = (key: string) => createHash("sha256").update(`eco:${key}`).digest("hex");

export const adminConfigured = () => Boolean(adminKey());

export function keyMatches(input: string): boolean {
  const key = adminKey();
  if (!key) return false;
  const a = Buffer.from(token(input));
  const b = Buffer.from(token(key));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function adminToken(): string {
  return token(adminKey());
}

export async function isAdmin(): Promise<boolean> {
  if (!adminKey()) return process.env.NODE_ENV !== "production";
  const c = (await cookies()).get(ADMIN_COOKIE)?.value;
  return c === adminToken();
}

/** Закрытая демо-версия: статусы и заметки меняет только админ (по умолчанию в демо можно всем). */
export const demoReadonly = () => process.env.DEMO_READONLY === "1";
