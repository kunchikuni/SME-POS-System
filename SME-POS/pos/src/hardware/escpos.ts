import { formatMoney } from '../lib/money';
import type { ReceiptContext } from './DeviceBridge';

/**
 * Encodes a sale into ESC/POS — the command language virtually every thermal
 * receipt printer speaks. This is deliberately pure (bytes in, bytes out, no
 * DOM, no I/O) so it can be unit-tested and reused by any transport: Web
 * Bluetooth today, a Capacitor native plugin later, USB/serial if it ever comes
 * to that. The transport's only job is to deliver these bytes.
 *
 * Paper width is expressed in monospace columns: 58mm ≈ 32, 80mm ≈ 48.
 */

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Fluent buffer of ESC/POS bytes. */
class EscPosBuilder {
    private bytes: number[] = [];
    private encoder = new TextEncoder();

    raw(...b: number[]): this {
        this.bytes.push(...b);
        return this;
    }

    /** Append text as CP437-safe ASCII (we only emit '$', digits, latin letters). */
    text(value: string): this {
        for (const byte of this.encoder.encode(value)) this.bytes.push(byte);
        return this;
    }

    line(value = ''): this {
        return this.text(value).raw(LF);
    }

    init(): this {
        return this.raw(ESC, 0x40); // ESC @ — reset
    }

    align(mode: 'left' | 'center' | 'right'): this {
        return this.raw(ESC, 0x61, mode === 'center' ? 1 : mode === 'right' ? 2 : 0);
    }

    bold(on: boolean): this {
        return this.raw(ESC, 0x45, on ? 1 : 0);
    }

    /** 0 = normal, 1 = double height+width. */
    size(double: boolean): this {
        return this.raw(GS, 0x21, double ? 0x11 : 0x00);
    }

    feed(lines = 1): this {
        return this.raw(ESC, 0x64, lines);
    }

    cut(): this {
        return this.raw(GS, 0x56, 0x00); // full cut
    }

    /** Pulse pin 2 of the drawer connector (many printers drive the cash drawer). */
    drawerKick(): this {
        return this.raw(ESC, 0x70, 0x00, 0x19, 0xfa);
    }

    build(): Uint8Array {
        return Uint8Array.from(this.bytes);
    }
}

/** Lay out "left ............ right" within a fixed column width. */
function row(left: string, right: string, columns: number): string {
    const maxLeft = columns - right.length - 1;
    const trimmed = left.length > maxLeft ? left.slice(0, Math.max(0, maxLeft)) : left;
    const gap = Math.max(1, columns - trimmed.length - right.length);
    return trimmed + ' '.repeat(gap) + right;
}

function divider(columns: number): string {
    return '-'.repeat(columns);
}

export interface EncodeOptions {
    /** Monospace columns for the paper: 32 for 58mm, 48 for 80mm. */
    columns?: number;
    /** Emit a drawer-kick pulse (e.g. for cash sales). */
    openDrawer?: boolean;
}

/** Encode a completed sale into ESC/POS bytes ready to stream to a printer. */
export function encodeReceipt(context: ReceiptContext, options: EncodeOptions = {}): Uint8Array {
    const columns = options.columns ?? 32;
    const { sale, tenantName, branchName, branchAddress, branchPhone, cashierName, receiptRef, fiscal: rawFiscal } = context;
    const fiscal = rawFiscal ?? { verified: false, taxpayerTin: null, vatNumber: null };
    const b = new EscPosBuilder();

    b.init().align('center').bold(true).size(true).line(tenantName).size(false);
    b.bold(false).line(branchName);
    if (branchAddress) b.line(branchAddress);
    if (branchPhone) b.line(branchPhone);
    b.line(fiscal.taxpayerTin ? `TIN: ${fiscal.taxpayerTin}` : 'TIN: -');
    b.line(fiscal.vatNumber ? `VAT Reg: ${fiscal.vatNumber}` : 'VAT Reg: Not Configured');

    b.align('left').line(divider(columns));
    b.line(row('Ref', receiptRef, columns));
    b.line(row('Date', new Date(sale.occurred_at).toLocaleDateString(), columns));
    b.line(row('Time', new Date(sale.occurred_at).toLocaleTimeString(), columns));
    b.line(row('Cashier', cashierName, columns));
    b.line(divider(columns));

    for (const item of sale.lines) {
        b.line(item.name);
        const qtyPrice = `${item.qty} x ${formatMoney(item.unit_price_cents, sale.currency)}`;
        const lineTotal = formatMoney(item.line_total_cents, sale.currency);
        b.line(row(qtyPrice, lineTotal, columns));
    }

    b.line(divider(columns));
    b.line(row('Net (ex VAT)', formatMoney(sale.subtotal_cents, sale.currency), columns));
    if (sale.tax_cents > 0) {
        b.line(row('VAT (included)', formatMoney(sale.tax_cents, sale.currency), columns));
    }
    if (sale.gratuity_cents > 0) {
        b.line(row('Gratuity', formatMoney(sale.gratuity_cents, sale.currency), columns));
    }
    b.bold(true).line(row('TOTAL', formatMoney(sale.total_cents, sale.currency), columns)).bold(false);
    b.line(divider(columns));

    for (const payment of sale.payments) {
        const label = payment.method.charAt(0).toUpperCase() + payment.method.slice(1);
        b.line(row(label, formatMoney(payment.amount_cents, payment.currency), columns));
        if (payment.received_cents != null && payment.received_cents > payment.amount_cents) {
            b.line(row('Amount paid', formatMoney(payment.received_cents, payment.currency), columns));
            b.line(row('Change', formatMoney(payment.received_cents - payment.amount_cents, payment.currency), columns));
        }
    }

    // Tax breakdown — a single row today, since every product currently shares
    // one tenant-wide VAT rate (Product.tax_class isn't yet captured per sale
    // line, so this can't honestly break down by code/line the way a receipt
    // with multiple real tax classes would need to — see contract.ts's
    // SaleLinePayload if that becomes a real requirement later).
    if (sale.tax_cents > 0) {
        b.line(divider(columns));
        b.bold(true).line('TAX BREAKDOWN').bold(false);
        b.line(row('Standard', formatMoney(sale.tax_cents, sale.currency), columns));
    }

    b.line(divider(columns));
    b.align('center');
    if (fiscal.verified) {
        b.line('PROVISIONAL - PENDING FISCAL SYNC');
        b.line('Fiscal receipt no. assigned on sync');
    } else {
        b.line('NOT YET FISCALISED');
        b.line('Configure ZIMRA in Settings');
    }

    b.feed(1).line('Thank you for your business');
    b.feed(3);

    if (options.openDrawer) b.drawerKick();
    b.cut();

    return b.build();
}

/** Column count for a paper width. */
export function columnsFor(paper: '58mm' | '80mm'): number {
    return paper === '80mm' ? 48 : 32;
}
