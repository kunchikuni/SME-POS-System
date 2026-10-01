import type { StaffMember } from '../types/contract';

/**
 * The cashier currently signed into the till, persisted so a page reload mid-
 * shift doesn't force re-entry of the PIN. Distinct from the device session:
 * the device is the credential, the cashier is attribution on each sale (§7).
 */

const KEY = 'wivae.pos.shift';

export interface Shift {
    cashierId: string;
    cashierName: string;
    /** Captured from StaffMember at shift-start — RetailTill's "Receive stock"
     * trigger gates on this (owner/manager only; see ReceiveStock.tsx's
     * docblock for why a restock isn't safe to leave open to every cashier). */
    role: string;
    startedAt: string;
}

export function getShift(): Shift | null {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as Shift;
    } catch {
        return null;
    }
}

export function startShift(staff: StaffMember): Shift {
    const shift: Shift = {
        cashierId: staff.id,
        cashierName: staff.name,
        role: staff.role,
        startedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(shift));
    return shift;
}

export function endShift(): void {
    localStorage.removeItem(KEY);
}
