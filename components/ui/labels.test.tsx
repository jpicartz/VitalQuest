import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every form control in the app must be labelled.
 *
 * Six labels shipped as bare <label> elements with no htmlFor and no wrapping,
 * which renders them decorative: a screen reader announces the input as
 * unlabelled. Nothing failed, nothing looked wrong. Field now makes the
 * association structural, and this catches anything hand-rolled around it.
 *
 * Source-level rather than render-level on purpose: a render test only covers
 * the states a test happens to reach, and these live inside modals.
 */
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith('.tsx') && !p.endsWith('.test.tsx') ? [p] : [];
  });

describe('form labelling', () => {
  it('has no <label> without htmlFor', () => {
    const offenders: string[] = [];
    for (const file of walk('components')) {
      // Field owns the one legitimate bare label: it is the primitive that
      // renders the htmlFor, from a generated id.
      if (file.endsWith('ui/Field.tsx')) continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (/<label(\s|>)/.test(line) && !/htmlFor=/.test(line)) {
          offenders.push(`${file}:${i + 1}`);
        }
      });
    }
    expect(offenders, `unassociated <label> at:\n${offenders.join('\n')}`).toEqual([]);
  });
});
