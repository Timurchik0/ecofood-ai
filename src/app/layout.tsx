import type { Metadata } from "next";
import { Inter } from "next/font/google";
import SiteChrome from "@/components/SiteChrome";
import { APP_NAME } from "@/lib/config";
import { isAdmin } from "@/lib/admin";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: `${APP_NAME} — скрининг заявок пищевых предприятий`,
  description:
    "Анкета предприятий о пищевых отходах, автоматическая квалификация клиентов (HOT / WARM / COLD) и CRM-дашборд с приоритетным списком.",
  // на дашборде видны названия компаний — не отдаём сайт поисковикам
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const admin = await isAdmin();
  return (
    <html lang="ru" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteChrome admin={admin} appName={APP_NAME}>
          {children}
        </SiteChrome>
      </body>
    </html>
  );
}
