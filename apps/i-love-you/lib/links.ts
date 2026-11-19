// Link handling for message bodies: split text into plain and link segments
// so the bubble can render links as tappable linkText runs. Deliberately
// conservative — http(s) URLs and bare www. hosts only; no phone or email
// detection (a two-person chat is full of numbers that are not phone
// numbers). Trailing punctuation that usually closes a sentence is left out
// of the link.

export type Segment = { kind: 'text'; text: string } | { kind: 'link'; text: string; url: string };

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
const TRAILING = /[).,!?;:'"\]]+$/;

export function splitLinks(body: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const match of body.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    let text = match[0];
    // Keep a closing paren that has its opening partner inside the URL
    // (Wikipedia-style links).
    const trail = TRAILING.exec(text);
    if (trail) {
      let cut = trail[0];
      if (cut.startsWith(')') && (text.match(/\(/g)?.length ?? 0) > (text.slice(0, -cut.length).match(/\)/g)?.length ?? 0)) {
        cut = cut.slice(1);
      }
      text = text.slice(0, text.length - cut.length);
    }
    if (!text) continue;
    if (start > last) out.push({ kind: 'text', text: body.slice(last, start) });
    const url = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    out.push({ kind: 'link', text, url });
    last = start + text.length;
  }
  if (last < body.length) out.push({ kind: 'text', text: body.slice(last) });
  return out;
}

export function firstLink(body: string | null): string | null {
  if (!body) return null;
  const seg = splitLinks(body).find((s) => s.kind === 'link');
  return seg && seg.kind === 'link' ? seg.url : null;
}
