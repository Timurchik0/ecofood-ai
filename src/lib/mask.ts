// Маскирование контактов в открытой демо-версии: жюри видит скоринг и приоритеты,
// а телефоны/почты реальных компаний остаются закрытыми (раскрываются в режиме админа).

export function maskContact(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  return s
    .replace(
      /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9])[A-Za-z0-9.-]*(\.[A-Za-z]{2,})/g,
      "$1***@$2***$3",
    )
    .replace(/(^|[\s(])@([A-Za-z0-9_])[A-Za-z0-9_]+/g, "$1@$2***")
    .replace(/\+?\d[\d\s().-]{5,}\d/g, (run) => {
      const total = run.replace(/\D/g, "").length;
      let seen = 0;
      return run.replace(/\d/g, (d) => {
        const keep = seen < 4 || seen >= total - 2;
        seen++;
        return keep ? d : "*";
      });
    });
}
