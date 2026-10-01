/**
 * Phone numbers, kept in one shape — E.164 ("+263771234567") — so what is
 * stored is what an SMS provider needs, however the owner typed it:
 * "0771 234 567", "077-123-4567", "+263 77 123 4567", "263771234567".
 *
 * Zimbabwean numbers are the default (a bare local number is read as one), and a
 * +263 number must be a mobile — Econet 077/078, NetOne 071, Telecel 073 —
 * because a text to a landline goes nowhere. A number from another country is
 * accepted if it is plausibly E.164 (8 to 15 digits after the +).
 */
const ZW = '263';
const ZW_MOBILE = /^(71|73|77|78)\d{7}$/;

/** The number in E.164, or null if it is not a usable mobile number. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim().replace(/[\s().-]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;

  let digits: string;
  if (s.startsWith('+')) digits = s.slice(1);
  else if (s.startsWith('0')) digits = ZW + s.slice(1); // 0771234567
  else if (s.startsWith(ZW)) digits = s;                // 263771234567
  else digits = ZW + s;                                 // 771234567

  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith(ZW)) return ZW_MOBILE.test(digits.slice(ZW.length)) ? `+${digits}` : null;
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

/** "+263771234567" → "+263 77 123 4567" — for showing back to the owner. */
export function formatPhone(e164: string): string {
  const m = /^\+263(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+263 ${m[1]} ${m[2]} ${m[3]}` : e164;
}
