import { describe, expect, it } from 'vitest';
import { formatMoney, lineTotal, sumCents, taxOf, toCents } from '../lib/money';

describe('money', () => {
  it('multiplies unit price by quantity in cents', () => {
    expect(lineTotal(150, 3)).toBe(450);
    expect(lineTotal(0, 5)).toBe(0);
  });

  it('applies tax in basis points, rounding half-up, integer cents', () => {
    expect(taxOf(1000, 1500)).toBe(150); // 15% of $10.00
    expect(taxOf(333, 1500)).toBe(50); // 49.95 → 50
    expect(taxOf(100, 0)).toBe(0);
    expect(taxOf(0, 1500)).toBe(0);
  });

  it('sums cents without float drift', () => {
    expect(sumCents([1, 2, 3])).toBe(6);
    expect(sumCents([])).toBe(0);
  });

  it('formats cents as a currency string', () => {
    expect(formatMoney(150, 'USD')).toBe('$1.50');
    expect(formatMoney(-150, 'USD')).toBe('-$1.50');
    expect(formatMoney(1234567, 'USD')).toBe('$12345.67');
    expect(formatMoney(0, 'USD')).toBe('$0.00');
  });

  it('parses decimal input back into integer cents', () => {
    expect(toCents('1.50')).toBe(150);
    expect(toCents('$1.50')).toBe(150);
    expect(toCents('')).toBe(0);
    expect(toCents('abc')).toBe(0);
    expect(toCents('10')).toBe(1000);
  });
});
