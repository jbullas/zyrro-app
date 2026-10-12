import type opentype from 'opentype.js';

// #7: the share preview's title (app/s/[slug]/opengraph-image.tsx) is one line,
// always. Widths are measured with the same Inter ExtraBold file Satori draws
// with: 56px by default, shrinking 1px at a time to fit, floor 40px, then
// an ellipsis. Longest real Named Identity at the time of writing ("The
// Illuminating Originator", 27 chars) is ~742px at 56px.
export const TITLE_MAX = 56;
export const TITLE_MIN = 40;

export function fitTitle(font: opentype.Font, text: string, maxWidth: number) {
  const width = (t: string, s: number) => font.getAdvanceWidth(t, s, { kerning: true });
  for (let fontSize = TITLE_MAX; fontSize >= TITLE_MIN; fontSize--) {
    if (width(text, fontSize) <= maxWidth) return { text, fontSize, width: width(text, fontSize) };
  }
  let cut = text;
  while (cut.length > 1 && width(`${cut.trimEnd()}…`, TITLE_MIN) > maxWidth) cut = cut.slice(0, -1);
  const out = `${cut.trimEnd()}…`;
  return { text: out, fontSize: TITLE_MIN, width: width(out, TITLE_MIN) };
}
