import { describe, expect, it } from 'vitest';
import {
  flightObjects,
  flightResolver,
  flightRows,
  flightText,
} from '../../src/lib/next-flight.js';

const push = (text: string) => `<script>self.__next_f.push(${JSON.stringify([1, text])})</script>`;

describe('next flight payload', () => {
  it('joins the pushed chunks, ignoring the bootstrap push', () => {
    const html = `<script>(self.__next_f=self.__next_f||[]).push([0])</script>${push('1:{"a"')}${push(':2}\n')}`;
    expect(flightText(html)).toBe('1:{"a":2}\n');
  });

  it('splits rows, including byte-counted text rows with multi-byte characters', () => {
    const text = 'žč';
    const rows = flightRows(
      `1:{"x":"$2"}\n2:T${Buffer.byteLength(text).toString(16)},${text}3:["$1"]\n4:I[1,2]\n`,
    );

    expect(rows.get('1')).toEqual({ x: '$2' });
    expect(rows.get('2')).toBe('žč');
    expect(rows.get('3')).toEqual(['$1']);
    expect(rows.get('4')).toBe('I[1,2]');
  });

  it('resolves references recursively and survives cycles', () => {
    const rows = flightRows('1:{"self":"$1","child":"$2","literal":"$$x"}\n2:{"v":3}\n');
    const resolved = flightResolver(rows)(rows.get('1')) as Record<string, unknown>;

    expect(resolved.child).toEqual({ v: 3 });
    expect(resolved.literal).toBe('$$x');
  });

  it('finds objects by __typename', () => {
    const html = push(
      '1:{"__typename":"CatalogProductModel","cat":"$2"}\n2:{"name":"X"}\n3:{"__typename":"Other"}\n',
    );

    expect(flightObjects(html, 'CatalogProductModel')).toEqual([
      { __typename: 'CatalogProductModel', cat: { name: 'X' } },
    ]);
  });
});
