import type { SalePayload } from '../types/contract';
import { printerService } from './printerService';
import { isScanSupported, scanOnce } from './barcodeScanner';

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
 * Web/PWA implementation. Printing is delegated to the printer service, which
 * streams ESC/POS to a paired Bluetooth thermal printer when one is connected
 * and otherwise falls back to the browser print dialog — so a receipt is always
 * reachable. Barcode scanning is handled by keyboard-wedge scanners typing into
 * the cart search field, so this returns null.
 */
export class WebDeviceBridge implements DeviceBridge {
  get capabilities(): DeviceCapabilities {
    return {
      print: true,
      scan: isScanSupported(),
      cashDrawer: printerService.isConnected(),
    };
  }

  async printReceipt(context: ReceiptContext): Promise<void> {
    await printerService.printReceipt(context);
  }

  /**
   * Headless scan for non-UI callers. The till itself uses ScannerModal, which
   * shows a camera preview and aiming guide — a better experience than a bare
   * promise. Both funnel through the same barcodeScanner module.
   */
  async scanBarcode(): Promise<string | null> {
    if (!isScanSupported()) return null;
    return scanOnce();
  }

  async openDrawer(): Promise<void> {
    await printerService.kickDrawer();
  }
}

/** Chosen at boot; swapped for a native bridge in a Capacitor build. */
export const deviceBridge: DeviceBridge = new WebDeviceBridge();
