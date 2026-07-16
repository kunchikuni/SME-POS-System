import { columnsFor, encodeReceipt } from './escpos';
import type { ReceiptContext } from './DeviceBridge';

/**
 * Web Bluetooth transport for thermal receipt printers — the Phase 4 spike
 * (docs/spikes/phase-4-thermal-printing.md). It connects to a BLE printer,
 * discovers a writable characteristic, and streams ESC/POS bytes from the
 * encoder in MTU-sized chunks.
 *
 * IMPORTANT CONSTRAINTS (these feed the Capacitor decision):
 *  - Web Bluetooth needs a SECURE CONTEXT (https or localhost). It will not run
 *    on http://demo.wivae.test — that alone may force a native shell in the field.
 *  - It is Chromium-only (Chrome/Edge/Android Chrome; not Safari/iOS).
 *  - There is no universal BLE printer profile, so we accept any device and
 *    probe for a writable characteristic across a set of known service UUIDs.
 *  - Reliable silent reconnection is limited; we persist the printer name for UX
 *    but a fresh connect may require a user gesture.
 *
 * Because of all this the service degrades gracefully: printReceipt() falls back
 * to the browser print dialog when no BLE printer is connected, so the cashier
 * can always produce a receipt.
 */

// Cheap ESC/POS BLE printers expose a writable characteristic under one of these.
const KNOWN_SERVICES: BluetoothServiceUUID[] = [
  0x18f0,
  0xff00,
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

const PAPER_KEY = 'wivae.pos.printer.paper';
const CHUNK_SIZE = 180; // conservative for low-MTU BLE printers

export type PaperWidth = '58mm' | '80mm';

export interface PrinterStatus {
  supported: boolean;
  connected: boolean;
  name: string | null;
  paper: PaperWidth;
}

type Listener = (status: PrinterStatus) => void;

class PrinterService {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private listeners = new Set<Listener>();

  private status: PrinterStatus = {
    supported: typeof navigator !== 'undefined' && 'bluetooth' in navigator && window.isSecureContext,
    connected: false,
    name: null,
    paper: (localStorage.getItem(PAPER_KEY) as PaperWidth) || '58mm',
  };

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private emit(patch: Partial<PrinterStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const l of this.listeners) l(this.status);
  }

  getStatus(): PrinterStatus {
    return this.status;
  }

  setPaper(paper: PaperWidth): void {
    localStorage.setItem(PAPER_KEY, paper);
    this.emit({ paper });
  }

  /** Prompt the operator to pick a BLE printer and connect. Requires a user gesture. */
  async connect(): Promise<void> {
    if (!this.status.supported) {
      throw new Error('Bluetooth printing needs Chrome/Edge over HTTPS.');
    }

    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: KNOWN_SERVICES,
    });

    device.addEventListener('gattserverdisconnected', this.handleDisconnect);
    const server = await device.gatt?.connect();
    if (!server) throw new Error('Could not open a connection to the printer.');

    const characteristic = await this.findWritableCharacteristic(server);
    if (!characteristic) throw new Error('No writable characteristic found on this device.');

    this.device = device;
    this.characteristic = characteristic;
    this.emit({ connected: true, name: device.name ?? 'Printer' });
  }

  disconnect(): void {
    this.device?.gatt?.disconnect();
    this.device = null;
    this.characteristic = null;
    this.emit({ connected: false, name: null });
  }

  isConnected(): boolean {
    return this.status.connected && this.characteristic !== null;
  }

  /** Print a receipt: over BLE if connected, else fall back to the browser dialog. */
  async printReceipt(context: ReceiptContext, opts: { openDrawer?: boolean } = {}): Promise<void> {
    if (!this.isConnected()) {
      window.print();
      return;
    }
    const bytes = encodeReceipt(context, {
      columns: columnsFor(this.status.paper),
      openDrawer: opts.openDrawer,
    });
    try {
      await this.write(bytes);
    } catch {
      // A mid-print failure shouldn't strand the cashier — fall back.
      this.handleDisconnect();
      window.print();
    }
  }

  /** Print a short self-test; surfaces errors so pairing UI can report them. */
  async testPrint(): Promise<void> {
    if (!this.isConnected()) throw new Error('No printer connected.');
    const sample = new TextEncoder().encode('Wivae POS\nPrinter test OK\n\n\n');
    await this.write(Uint8Array.from([0x1b, 0x40, ...sample, 0x1d, 0x56, 0x00]));
  }

  async kickDrawer(): Promise<void> {
    if (!this.isConnected()) return;
    await this.write(Uint8Array.from([0x1b, 0x70, 0x00, 0x19, 0xfa]));
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private handleDisconnect = (): void => {
    this.characteristic = null;
    this.emit({ connected: false });
  };

  private async findWritableCharacteristic(
    server: BluetoothRemoteGATTServer,
  ): Promise<BluetoothRemoteGATTCharacteristic | null> {
    const services = await server.getPrimaryServices();
    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      for (const c of characteristics) {
        if (c.properties.write || c.properties.writeWithoutResponse) return c;
      }
    }
    return null;
  }

  private async write(bytes: Uint8Array): Promise<void> {
    const c = this.characteristic;
    if (!c) throw new Error('Printer not connected.');
    const useNoResponse = c.properties.writeWithoutResponse;

    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
      const chunk = bytes.slice(offset, offset + CHUNK_SIZE);
      if (useNoResponse) {
        await c.writeValueWithoutResponse(chunk);
      } else {
        await c.writeValueWithResponse(chunk);
      }
      // Small pause so low-buffer printers keep up.
      await new Promise((r) => setTimeout(r, 20));
    }
  }
}

export const printerService = new PrinterService();
