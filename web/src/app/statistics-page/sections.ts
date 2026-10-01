// The sections of the statistics page, as the page shows them and as /statistics/edit edits them.
// A plain module (no schematic makes one): a pure function, tested on its own.

/** A section: its name (null: the charts without one) and its charts, in their order. */
export interface Section<T> {
  name: string | null;
  items: T[];
}

/**
 * The charts by section: the sections in the order of their first chart, each with its charts in
 * their order; the charts without a section are one more, in its place.
 */
export function sectionsOf<T extends { section: string | null }>(items: readonly T[]): Section<T>[] {
  const sections: Section<T>[] = [];
  for (const item of items) {
    let section = sections.find((s) => s.name === item.section);
    if (!section) sections.push((section = { name: item.section, items: [] }));
    section.items.push(item);
  }
  return sections;
}
