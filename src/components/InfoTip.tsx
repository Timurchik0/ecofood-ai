"use client";

import { useEffect, useId, useRef, useState } from "react";

type Pos = { left: number; width: number; top?: number; bottom?: number };

/**
 * Значок ⓘ с подсказкой «как это считается».
 * Мышь — по наведению, телефон — по касанию, клавиатура — по фокусу (Esc закрывает).
 * Подсказка позиционируется как fixed, поэтому её не обрезает прокручиваемая таблица.
 */
export default function InfoTip({ text, label = "Как это считается" }: { text: string; label?: string }) {
  const [pos, setPos] = useState<Pos | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const pointer = useRef("mouse");
  const id = useId();

  function show() {
    const el = btn.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(320, vw - 16);
    const left = Math.max(8, Math.min(r.left + r.width / 2 - width / 2, vw - width - 8));
    const spaceBelow = vh - r.bottom;
    setPos(
      spaceBelow >= 260 || spaceBelow >= r.top
        ? { left, width, top: r.bottom + 8 }
        : { left, width, bottom: vh - r.top + 8 },
    );
  }

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !tip.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-expanded={pos !== null}
        aria-describedby={pos ? id : undefined}
        onPointerEnter={(e) => {
          pointer.current = e.pointerType;
          if (e.pointerType === "mouse") show();
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setPos(null);
        }}
        // фокус от клавиатуры показывает подсказку; фокус от касания/клика — нет (иначе тап сразу её закрывает)
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) show();
        }}
        onBlur={() => setPos(null)}
        onClick={() => {
          if (pointer.current === "mouse" && pos) return;
          if (pos) setPos(null);
          else show();
        }}
        className="ml-1 inline-flex size-4 shrink-0 translate-y-[1px] items-center justify-center rounded-full text-slate-400 transition-colors hover:text-emerald-700 focus-visible:text-emerald-700"
      >
        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
          <circle cx="8" cy="8" r="6.3" />
          <path d="M8 7.2v3.6" strokeLinecap="round" />
          <circle cx="8" cy="5.1" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {pos && (
        <div
          ref={tip}
          id={id}
          role="tooltip"
          style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
          className="pointer-events-none z-50 rounded-xl bg-slate-900 px-3.5 py-3 text-left whitespace-normal text-xs font-normal normal-case leading-relaxed tracking-normal text-slate-100 shadow-xl ring-1 ring-black/10"
        >
          {text.split("\n").map((line, i) => (
            <p key={i} className={i ? "mt-1.5" : ""}>
              {line}
            </p>
          ))}
        </div>
      )}
    </>
  );
}
