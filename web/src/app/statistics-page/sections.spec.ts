import { sectionsOf } from './sections';

const chart = (id: number, section: string | null) => ({ id, section });

describe('sectionsOf', () => {
  it('the sections in the order of their first chart, each with its charts in order', () => {
    const sections = sectionsOf([chart(1, 'Money'), chart(2, 'Habits'), chart(3, 'Money'), chart(4, null), chart(5, 'Habits')]);

    expect(sections.map((s) => [s.name, s.items.map((i) => i.id)])).toEqual([
      ['Money', [1, 3]],
      ['Habits', [2, 5]],
      [null, [4]], // the charts without a section, together, in their place
    ]);
  });

  it('none without charts', () => {
    expect(sectionsOf([])).toEqual([]);
  });
});
