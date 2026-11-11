/**
 * TypeScript definitions for qr-paygen
 */

/// <reference types="node" />

export type QRFormat = 'png' | 'svg' | 'webp';
export type QRErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';
export type LogoBackgroundShape = 'rounded-rect' | 'circle' | 'rect';

export interface CzechBankAccount {
  /** Account prefix (up to 6 digits, optional) */
  prefix?: string | number;
  /** Account number (up to 10 digits) */
  number: string | number;
  /** Bank code (4 digits, e.g. '0800', '0300', '0100', '2010') */
  bankCode: string | number;
}

export interface LogoOptions {
  /** Logo source: file path on disk, Buffer, base64 Data URL, or raw SVG markup */
  src: string | Buffer;
  /** Width or size ratio (<= 1 as percentage of QR size, e.g. 0.2 = 20%, or fixed px > 1) */
  size?: number;
  /** Alias for size */
  width?: number;
  /** Draw a solid badge background behind the logo (default: true) or specify hex color */
  background?: boolean | string;
  /** Background shape for the badge (default: 'rounded-rect') */
  backgroundShape?: LogoBackgroundShape;
  /** Padding around the logo inside the badge (default: ~14% of logo size) */
  backgroundPadding?: number;
  /** Corner radius for 'rounded-rect' badge (default: ~18% of logo size) */
  borderRadius?: number;
}

export interface FrameOptions {
  /** Whether to render the outer frame (default: true) */
  show?: boolean;
  /** Border stroke width in px (default: auto proportional ~2px) */
  strokeWidth?: number;
  /** Border line color (default: '#000000') */
  color?: string;
  /** Text on the bottom border break (default: 'QR Platba', or custom text, or ''/false to disable gap) */
  text?: string | boolean;
  /** Text color (default: matches frame color) */
  textColor?: string;
  /** Font family (default: 'Arial, Helvetica, sans-serif') */
  fontFamily?: string;
  /** Font size in px (default: auto proportional ~34px) */
  fontSize?: number;
  /** Font weight (default: 'bold') */
  fontWeight?: string | number;
  /** Left offset along bottom border before text starts (default: auto ~8% of frame size) */
  textOffset?: number;
  /** Gap in pixels before and after text in the border line (default: ~10px) */
  textGap?: number;
  /** Explicit text width override in px (optional, auto-calculated by default) */
  textWidth?: number;
}

export interface QROptions {
  /** QR Error correction level ('L': 7%, 'M': 15%, 'Q': 25%, 'H': 30%). Default: 'M', or 'Q' if logo is present */
  errorCorrectionLevel?: QRErrorCorrectionLevel;
  /** Color configuration for QR modules */
  color?: {
    dark?: string;
    light?: string | null;
  };
  /** Padding between outer frame and QR modules in px */
  padding?: number;
}

export interface SpaydPaymentOptions {
  /** International Bank Account Number (e.g. 'CZ7603000000000076327632') */
  iban?: string;
  /** Or Czech national account format: "19-2000145399/0800" or { prefix, number, bankCode } */
  account?: string | CzechBankAccount;
  /** Optional BIC / SWIFT code (e.g. 'KOMBCZPPXXX') */
  bic?: string;
  /** Alias for bic */
  swift?: string;
  /** Payment amount (e.g. 200.00 or '200.00') */
  amount?: number | string;
  /** 3-letter ISO 4217 currency code (default: 'CZK') */
  currency?: string;
  /** Variable symbol (X-VS, max 10 digits) */
  vs?: string | number;
  /** Alias for vs */
  variableSymbol?: string | number;
  /** Specific symbol (X-SS, max 10 digits) */
  ss?: string | number;
  /** Alias for ss */
  specificSymbol?: string | number;
  /** Constant symbol (X-KS, max 4 digits) */
  ks?: string | number;
  /** Alias for ks */
  constantSymbol?: string | number;
  /** Message for recipient (max 60 chars; Czech diacritics automatically stripped) */
  message?: string;
  /** Alias for message */
  msg?: string;
  /** Recipient name (max 35 chars; diacritics automatically stripped) */
  recipientName?: string;
  /** Payment due date (YYYYMMDD string or Date object) */
  dueDate?: string | Date;
  /** Payment type (max 3 chars) */
  paymentType?: string;
  /** Payment reference (SEPA, max 16 chars) */
  reference?: string;
  /** Custom SPAYD key-value pairs (e.g. { 'X-URL': 'https://example.com' }) */
  custom?: Record<string, string | number>;
  /** Include IEEE 802.3 CRC32 checksum in SPAYD string (default: false) */
  includeCrc32?: boolean;
}

export interface PaymentQROptions extends SpaydPaymentOptions {
  /** Pre-formatted raw SPAYD string (overrides individual payment fields if provided) */
  rawSpayd?: string;
  /** Output image format ('png', 'svg', 'webp'). Default: 'png' */
  format?: QRFormat;
  /** Total image dimension in pixels (width = height, default: 500) */
  size?: number;
  /** Outer margin from canvas edge to border (default: ~10% of size) */
  margin?: number;
  /** Canvas background color (default: '#ffffff', can be 'transparent') */
  backgroundColor?: string;
  /** WebP compression quality 1-100 (default: 95) */
  quality?: number;
  /** If format is 'svg', return Buffer instead of string */
  asBuffer?: boolean;
  /** Frame and border text configuration */
  frame?: FrameOptions;
  /** QR module styling and error correction */
  qr?: QROptions;
  /** Center logo options */
  logo?: LogoOptions | string | Buffer;
}

/**
 * Main generator function. Returns PNG/WebP Buffer, or SVG string.
 */
export function generatePaymentQR(options?: PaymentQROptions): Promise<Buffer | string>;

export namespace generatePaymentQR {
  export function toSvg(options?: PaymentQROptions): string;
  export function toBuffer(options?: PaymentQROptions): Promise<Buffer>;
  export function toDataUrl(options?: PaymentQROptions): Promise<string>;
  export function toFile(filePath: string, options?: PaymentQROptions): Promise<string>;
  export function buildSpayd(options: SpaydPaymentOptions | string): string;
  export function czechAccountToIban(account: string | CzechBankAccount): string;
  export function validateIban(iban: string): boolean;
  export function removeDiacritics(str: string): string;
}

export {
  generatePaymentQR as default,
  buildSpayd,
  czechAccountToIban,
  validateIban,
  removeDiacritics
};
