import { describe, expect, it } from 'vitest';
import { formatPhone, normalizePhone } from './phone.js';

describe('normalizePhone — one shape, however it was typed', () => {
  it('reads every common way of writing a Zimbabwean mobile number', () => {
    for (const typed of [
      '0771234567', '077 123 4567', '077-123-4567', '(077) 123 4567',
      '+263771234567', '+263 77 123 4567', '263771234567', '00263771234567', '771234567',
    ]) {
      expect(normalizePhone(typed), typed).toBe('+263771234567');
    }
  });

  it('knows all three networks: Econet (077, 078), NetOne (071), Telecel (073)', () => {
    expect(normalizePhone('0771234567')).toBe('+263771234567');
    expect(normalizePhone('0781234567')).toBe('+263781234567');
    expect(normalizePhone('0711234567')).toBe('+263711234567');
    expect(normalizePhone('0731234567')).toBe('+263731234567');
  });

  it('refuses a number that cannot receive a text — a landline, or the wrong length', () => {
    expect(normalizePhone('0242123456')).toBeNull();   // Harare landline
    expect(normalizePhone('077123456')).toBeNull();    // a digit short
    expect(normalizePhone('07712345678')).toBeNull();  // a digit over
    expect(normalizePhone('0761234567')).toBeNull();   // not a mobile prefix
  });

  it('refuses things that are not numbers at all', () => {
    for (const bad of ['', '   ', 'not a number', '077 abc 4567', '++263771234567', null, undefined]) {
      expect(normalizePhone(bad as string), String(bad)).toBeNull();
    }
  });

  it('accepts a plausible number from another country, with its +', () => {
    expect(normalizePhone('+27 82 123 4567')).toBe('+27821234567');
    expect(normalizePhone('0044 7700 900123')).toBe('+447700900123');
  });

  it('refuses an impossibly short or long international number', () => {
    expect(normalizePhone('+1234')).toBeNull();
    expect(normalizePhone('+1234567890123456')).toBeNull();
  });

  it('is stable: normalising a normalised number changes nothing', () => {
    expect(normalizePhone('+263771234567')).toBe('+263771234567');
    expect(normalizePhone(normalizePhone('0771234567'))).toBe('+263771234567');
  });
});

describe('formatPhone', () => {
  it('spaces a Zimbabwean number for reading', () => {
    expect(formatPhone('+263771234567')).toBe('+263 77 123 4567');
  });
  it('leaves any other number alone', () => {
    expect(formatPhone('+27821234567')).toBe('+27821234567');
  });
});
