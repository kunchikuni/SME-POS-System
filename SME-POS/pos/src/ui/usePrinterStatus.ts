import { useEffect, useState } from 'react';
import { printerService, type PrinterStatus } from '../hardware/printerService';

/** Subscribe a component to live printer status (supported/connected/paper). */
export function usePrinterStatus(): PrinterStatus {
  const [status, setStatus] = useState<PrinterStatus>(printerService.getStatus());
  useEffect(() => printerService.subscribe(setStatus), []);
  return status;
}
