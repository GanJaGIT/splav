/**
 * ART-02: the interface icons from art/ui/*.svg, inlined into the DOM. Monochrome ones follow
 * the text colour (currentColor); coloured ones carry their own colours. They have no ids and
 * no gradients, so the same icon can appear many times on a page.
 */

const raw = import.meta.glob<string>('../../art/ui/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
});

export function icon(name: string): string {
  const svg = raw[`../../art/ui/${name}.svg`];
  if (!svg) throw new Error(`no icon art/ui/${name}.svg`);
  return svg.trim();
}
