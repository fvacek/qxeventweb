import { SqlTable } from './SqlTable';
import type { TableJson } from './SqlTable';

const mockData: TableJson = {
  fields: [
    { name: 'ckey' },
    { name: 'cvalue' },
    { name: 'ctype' }
  ],
  rows: [
    ['event.name', 'Test Event', 'QString'],
    ['event.date', new Date('2025-10-10'), 'QDate']
  ]
};

describe('SqlTable', () => {
  let table: SqlTable;

  beforeEach(() => {
    table = new SqlTable(mockData);
  });

  it('returns correct row count', () => {
    expect(table.rowCount()).toBe(2);
  });

  it('returns correct field count', () => {
    expect(table.fieldCount()).toBe(3);
  });

  it('retrieves field by index', () => {
    expect(table.fieldAt(0)).toEqual({ name: 'ckey' });
    expect(table.fieldAt(2)).toEqual({ name: 'ctype' });
  });

  it('throws when accessing invalid field index', () => {
    expect(() => table.fieldAt(-1)).toThrow();
    expect(() => table.fieldAt(99)).toThrow();
  });

  it('retrieves row by index', () => {
    expect(table.rowAt(0)).toEqual(['event.name', 'Test Event', 'QString']);
    expect(table.rowAt(1)).toEqual(['event.date', new Date('2025-10-10'), 'QDate']);
  });

  it('throws when accessing invalid row index', () => {
    expect(() => table.rowAt(-1)).toThrow();
    expect(() => table.rowAt(999)).toThrow();
  });

  it('gets value by field index', () => {
    const row = table.rowAt(0);
    expect(table.get(row, 1)).toBe('Test Event');
  });

  it('gets value by field name', () => {
    const row = table.rowAt(1);
    expect(table.get(row, 'ckey')).toBe('event.date');
    expect(table.get(row, 'ctype')).toBe('QDate');
  });

  it('throws if field name is invalid in get()', () => {
    const row = table.rowAt(0);
    expect(() => table.get(row, 'nonexistent')).toThrow('Field "nonexistent" not found');
  });
});
