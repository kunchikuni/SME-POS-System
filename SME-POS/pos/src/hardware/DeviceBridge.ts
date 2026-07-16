import type { SalePayload } from '../types/contract';

/**
 * Every hardware capability sits behind this one interface, so the React POS
 * calls printReceipt()/scanBarcode()/openDrawer() and never knows its host
 * (docs/ARCHITECTURE.md §11). The PWA ships the Web implementation below; a
 * Capacitor build will provide a native one calling device plugins — decided by
 * the Phase 4 printing spike, without the app changing.
 */

export interface ReceiptContext {
  sale: SalePayload;
  tenantName: string;
  branchName: string;
}

export interface DeviceCapabilities {
  print: boolean;
  scan: boolean;
  cashDrawer: boolean;
}

export interface DeviceBridge {
  readonly capabilities: DeviceCapabilities;
  /** Render/emit a receipt for a completed sale. */
  printReceipt(context: ReceiptContext): Promise<void>;
  /** Resolve a scanned barcode, or null if scanning isn't available/was cancelled. */
  scanBarcode(): Promise<string | null>;
  /** Kick the cash drawer, where one exists. */
  openDrawer(): Promise<void>;
}

/**
 * Web/PWA implementation. Printing uses the browser print path (a thermal
 * printer on the OS handles the rest); barcode scanning is handled by
 * keyboard-wedge scanners typing into the cart search field, so this returns
 * null; there is no cash-drawer access from the browser.
 */
export class WebDeviceBridge implements DeviceBridge {
  readonly capabilities: DeviceCapabilities = {
    print: true,
    scan: false,
    cashDrawer: false,
  };

  async printReceipt(_context: ReceiptContext): Promise<void> {
    // The receipt view is rendered in the DOM; hand off to the browser/OS.
    window.print();
  }

  async scanBarcode(): Promise<string | null> {
    return null;
  }

  async openDrawer(): Promise<void> {
    // No-op in the browser.
  }
}

/** Chosen at boot; swapped for a native bridge in a Capacitor build. */
export const deviceBridge: DeviceBridge = new WebDeviceBridge();
