import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { formatMoney } from '../lib/money';
import { uuid } from '../lib/uuid';
import type { Customer, SaleCustomer } from '../types/contract';

/**
 * "Who owes this?" for a credit sale — shared by every till (Retail,
 * Restaurant checkout, Hardware, Workshop) so they pick, match and create
 * customers the same way. Previously this lived inside RetailTill only.
 */
export interface CreditCustomerState {
    name: string;
    phone: string;
    selectedId: string | null;
    customers: Customer[];
    setName: (v: string) => void;
    setPhone: (v: string) => void;
    pick: (c: Customer) => void;
    /** The customer for completeSale(), or null when no name was entered. */
    toSaleCustomer: () => SaleCustomer | null;
    reset: () => void;
}

export function useCreditCustomer(): CreditCustomerState {
    const customers = useLiveQuery(() => db.customers.toArray(), [], [] as Customer[]);
    const [name, setNameRaw] = useState('');
    const [phone, setPhone] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);

    return {
        name,
        phone,
        selectedId,
        customers,
        // Typing after picking means it's no longer necessarily that customer.
        setName: (v) => { setNameRaw(v); setSelectedId(null); },
        setPhone,
        pick: (c) => { setSelectedId(c.id); setNameRaw(c.name); setPhone(c.phone ?? ''); },
        toSaleCustomer: () => {
            const trimmed = name.trim();
            if (!trimmed) return null;
            // The picked customer, else one whose name matches exactly (ignoring
            // case) — a cashier typing "Tariro Moyo" in full instead of tapping
            // the suggestion would otherwise open a second account — else new.
            const id = selectedId
                ?? customers.find((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase())?.id
                ?? uuid();
            return { id, name: trimmed, phone: phone.trim() || null };
        },
        reset: () => { setNameRaw(''); setPhone(''); setSelectedId(null); },
    };
}

/**
 * The name (with suggestions) + phone inputs. A top-level component on
 * purpose: declared inside a till it would remount on every keystroke and
 * lose focus (the bug fixed in RetailTill's renderCart).
 */
export function CreditCustomerFields({ credit, focusRing = 'focus:border-violet-500/50 focus:ring-violet-500/20' }: {
    credit: CreditCustomerState;
    /** Till accent for the focus ring, e.g. orange on the restaurant till. */
    focusRing?: string;
}) {
    const typed = credit.name.trim().toLowerCase();
    // Only suggest while the typed name isn't already the picked customer.
    const matches = typed && !credit.selectedId
        ? credit.customers.filter((c) => c.name.toLowerCase().includes(typed)).slice(0, 5)
        : [];
    const inputClass = `w-full rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:ring-2 transition-all ${focusRing}`;

    return (
        <div className="mt-2.5 space-y-2">
            <p className="text-xs text-amber-400/80">
                This amount will be tracked as owed by the customer — nothing is collected now.
            </p>
            <div className="relative">
                <input
                    value={credit.name}
                    onChange={(e) => credit.setName(e.target.value)}
                    placeholder="Customer name"
                    className={inputClass}
                />
                {matches.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-xl">
                        {matches.map((c) => (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => credit.pick(c)}
                                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-white hover:bg-white/5"
                            >
                                <span>{c.name}</span>
                                <span className={c.balance_cents > 0 ? 'text-amber-400 tabular-nums' : 'text-slate-500 tabular-nums'}>
                                    {formatMoney(c.balance_cents)} owed
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
            {credit.selectedId && (
                <p className="text-xs text-emerald-400/80">Existing customer selected — balance will add to what they already owe.</p>
            )}
            <input
                value={credit.phone}
                onChange={(e) => credit.setPhone(e.target.value)}
                placeholder="Phone (optional)"
                className={inputClass}
            />
        </div>
    );
}
