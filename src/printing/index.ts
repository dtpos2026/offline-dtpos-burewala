// Public API for the print module.
// Import from here, NOT from sub-files.
export { PRINT_CONFIG, paperWidthToMm, paperWidthToMicrons } from './printConfig';
export type { PaperSize } from './printConfig';
export { buildPrintCss, injectPrintCss } from './printCss';
export { electronPrintReceipt, isElectronPrintAvailable } from './electronPrint';
export { printNode } from './printService';
export type { PrintNodeResult } from './printService';
export {
  silentPrint,
  browserDialogPrint,
  isSilentPrintAvailable,
  isLanPrintAvailable,
  classifyPrintError,
} from './printer';
export type { PrintResult, PrintTransport, PrintFailureCode, SilentPrintJob } from './printer';
export { fastPrintHtml, isFastPrintAvailable } from './fastPrint';
export type { FastPrintArgs, FastPrintResult } from './fastPrint';
// Direct ESC/POS layer — receipts, KOT, tokens and anything added later.
export { printDirect, isDirectPrintAvailable, prewarmDirectPrint, resolveTarget } from './directPrint';
export type { DirectPrintArgs, DirectPrintResult, DirectSlip } from './directPrint';
export { buildReceiptBytes, buildKotBytes, buildTokenBytes, EscposDoc } from './escposBuilder';

