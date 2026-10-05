import type { Metadata } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";
import { APP_NAME } from "@/lib/config";
import { isAdmin } from "@/lib/admin";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: `${APP_NAME} — скрининг заявок пищевых предприятий`,
  description:
    "Анкета предприятий о пищевых отходах, автоматическая квалификация клиентов (HOT / WARM / COLD) и CRM-дашборд с приоритетным списком.",
};

function Logo() {
  return (
    <span className="grid size-8 place-items-center rounded-lg bg-emerald-600 text-white shadow-sm">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z" />
        <path d="M2 21c0-3 1.9-5.5 5-7" />
      </svg>
    </span>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const admin = await isAdmin();
  return (
    <html lang="ru" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5 whitespace-nowrap font-semibold text-slate-900">
              <Logo />
              <span>{APP_NAME}</span>
            </Link>
            <nav className="order-last -ml-3 flex w-full items-center gap-1 text-sm sm:order-none sm:ml-2 sm:w-auto">
              <Link href="/" className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                Дашборд
              </Link>
              <Link href="/apply" className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                Анкета
              </Link>
              <Link href="/admin" className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                Настройки
              </Link>
            </nav>
            <span
              className={`ml-auto rounded-full px-2.5 py-1 text-xs font-medium ${
                admin ? "bg-emerald-100 text-emerald-800" : "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"
              }`}
              title={admin ? "Контакты видны полностью" : "В открытой демо-версии контакты компаний скрыты"}
            >
              <span className="hidden sm:inline">{admin ? "Режим администратора" : "Демо-версия · контакты скрыты"}</span>
              <span className="sm:hidden">{admin ? "Админ" : "Демо"}</span>
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
        <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
          {APP_NAME} · MVP · скоринг по прозрачным правилам, AI объясняет приоритет и подсказывает следующий шаг
        </footer>
      </body>
    </html>
  );
}
