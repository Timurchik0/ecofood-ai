/** Ссылка на таблицу → ссылка на CSV. Понимает «Опубликовать в Интернете» и обычную ссылку на таблицу. */
export function toCsvUrl(input: string): string {
  const url = input.trim();
  if (/output=csv|format=csv/.test(url)) return url;
  const pub = /^(https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[^/]+)\/pub/.exec(url);
  if (pub) return `${pub[1]}/pub?output=csv`;
  const id = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(url)?.[1];
  const gid = /[?&#]gid=(\d+)/.exec(url)?.[1];
  if (id) return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
  return url;
}
