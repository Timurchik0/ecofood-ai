"use client";

import { useState } from "react";

export default function CopyButton({ text, label = "Скопировать" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* буфер недоступен — пользователь скопирует вручную */
        }
      }}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      {done ? "Скопировано ✓" : label}
    </button>
  );
}
