#!/usr/bin/env node
/**
 * qr-paygen - High quality Czech & Slovak SPAYD payment QR code generator for Node.js
 * 
 * Primarily built for Merchant (https://github.com/filip-koch/merchant),
 * but designed as a standalone, zero-compromise library for any Node.js environment.
 * 
 * Provided "as is" without warranty of any kind. No liability is assumed by the developer.
 * 
 * @author Filip Koch
 * @license MIT
 */

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

// Sharp is lazily required for PNG and WebP rendering
let _sharp = null;
function getSharp() {
  if (!_sharp) {
    try {
      _sharp = require('sharp');
    } catch (err) {
      throw new Error(
        'The "sharp" package is required for PNG and WebP generation. ' +
        'Please install it via "npm install sharp" or use format: "svg".'
      );
    }
  }
  return _sharp;
}

// ============================================================================
// 1. HELPERS & UTILITIES
// ============================================================================

/**
 * Escapes special XML characters to prevent SVG injection vulnerabilities.
 * @param {string|number} str
 * @returns {string}
 */
function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Strips Czech, Slovak and other European diacritics and converts to ASCII uppercase.
 * SPAYD specification allows only standard uppercase ASCII characters in text fields.
 * @param {string} str
 * @returns {string}
 */
function removeDiacritics(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

/**
 * Validates an International Bank Account Number (IBAN) using the ISO 7064 Mod 97-10 algorithm.
 * @param {string} iban
 * @returns {boolean}
 */
function validateIban(iban) {
  if (!iban || typeof iban !== 'string') return false;
  const clean = iban.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(clean)) return false;

  const rearranged = clean.slice(4) + clean.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));

  try {
    return BigInt(numeric) % 97n === 1n;
  } catch {
    return false;
  }
}

/**
 * Converts a Czech national bank account format to an international IBAN.
 * Accepts either:
 * - String: "19-2000145399/0800" or "2000145399/0800"
 * - Object: { prefix?: string|number, number: string|number, bankCode: string|number }
 * 
 * @param {string|object} account
 * @returns {string} Standard Czech IBAN (24 characters)
 */
function czechAccountToIban(account) {
  let prefix = '0';
  let number = '';
  let bankCode = '';

  if (typeof account === 'string') {
    const trimmed = account.trim();
    const slashIdx = trimmed.indexOf('/');
    if (slashIdx === -1) {
      throw new Error(`Invalid Czech account format "${account}". Expected format: [prefix-]number/bankCode (e.g. 19-2000145399/0800)`);
    }
    bankCode = trimmed.slice(slashIdx + 1).trim();
    const numPart = trimmed.slice(0, slashIdx).trim();

    const dashIdx = numPart.indexOf('-');
    if (dashIdx !== -1) {
      prefix = numPart.slice(0, dashIdx).trim();
      number = numPart.slice(dashIdx + 1).trim();
    } else {
      prefix = '0';
      number = numPart;
    }
  } else if (account && typeof account === 'object') {
    prefix = String(account.prefix || '0').trim();
    number = String(account.number || '').trim();
    bankCode = String(account.bankCode || '').trim();
  } else {
    throw new Error('Czech account must be a string (e.g. "19-2000145399/0800") or an object { prefix, number, bankCode }');
  }

  // Normalize and validate parts
  prefix = prefix.replace(/\D/g, '');
  number = number.replace(/\D/g, '');
  bankCode = bankCode.replace(/\D/g, '');

  if (prefix.length > 6) {
    throw new Error(`Account prefix cannot exceed 6 digits, received "${prefix}"`);
  }
  if (!number || number.length > 10) {
    throw new Error(`Account number must be between 1 and 10 digits, received "${number}"`);
  }
  if (bankCode.length !== 4) {
    throw new Error(`Bank code must be exactly 4 digits, received "${bankCode}"`);
  }

  const paddedPrefix = prefix.padStart(6, '0');
  const paddedNumber = number.padStart(10, '0');
  const bban = bankCode + paddedPrefix + paddedNumber; // 20 digits

  // Country code CZ = C(12), Z(35) + '00' = 123500
  const bigNum = BigInt(bban + '123500');
  const mod = bigNum % 97n;
  const checkDigits = (98n - mod).toString().padStart(2, '0');

  const iban = `CZ${checkDigits}${bban}`;
  if (!validateIban(iban)) {
    throw new Error(`Internal error: Generated invalid IBAN "${iban}"`);
  }
  return iban;
}

/**
 * Standard IEEE 802.3 32-bit Cyclic Redundancy Check (CRC-32) calculation.
 * @param {string} str
 * @returns {string} 8-character uppercase hexadecimal string
 */
function crc32(str) {
  let crc = 0 ^ -1;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ code) & 0xff];
  }
  return ((crc ^ -1) >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

// Pre-computed CRC32 lookup table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c;
}

/**
 * Approximates text width in sans-serif / Arial / Helvetica bold.
 * Accurately sizes the gap in the bottom frame line.
 * @param {string} text
 * @param {number} fontSize
 * @returns {number}
 */
function estimateTextWidth(text, fontSize) {
  if (!text) return 0;
  let ems = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ' || ch === 'i' || ch === 'l' || ch === 'I' || ch === '.' || ch === ',') {
      ems += 0.3;
    } else if (ch === 'M' || ch === 'W' || ch === 'm' || ch === 'w') {
      ems += 0.95;
    } else if (ch >= 'A' && ch <= 'Z') {
      ems += 0.72;
    } else if (ch >= '0' && ch <= '9') {
      ems += 0.6;
    } else {
      ems += 0.55;
    }
  }
  return ems * fontSize;
}

// ============================================================================
// 2. SPAYD STRING BUILDER (ČBA Standard 1.0)
// ============================================================================

/**
 * Builds a validated SPAYD (Short Payment Descriptor) string according to ČBA specifications.
 * 
 * @param {object|string} options
 * @returns {string} Standard SPAYD string (e.g. "SPD*1.0*ACC:CZ...*AM:200.00*CC:CZK...")
 */
function buildSpayd(options) {
  if (typeof options === 'string') {
    const trimmed = options.trim();
    if (trimmed.startsWith('SPD*1.0*')) return trimmed;
    throw new Error('Raw SPAYD string must begin with "SPD*1.0*"');
  }

  if (!options || typeof options !== 'object') {
    throw new Error('buildSpayd expects an options object or a raw SPAYD string');
  }

  // 1. Resolve IBAN & BIC
  let iban = options.iban || options.IBAN;
  if (!iban && options.account) {
    iban = czechAccountToIban(options.account);
  }

  if (!iban) {
    throw new Error('Missing payment account. Provide either "iban" or Czech "account" (e.g. "19-2000145399/0800")');
  }

  iban = iban.replace(/[\s-]/g, '').toUpperCase();
  if (!validateIban(iban)) {
    throw new Error(`Invalid IBAN: "${iban}". Check sum / length failed.`);
  }

  let accValue = iban;
  const bic = options.bic || options.BIC || options.swift || options.SWIFT;
  if (bic) {
    const cleanBic = bic.replace(/[\s-]/g, '').toUpperCase();
    if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(cleanBic)) {
      throw new Error(`Invalid BIC/SWIFT code: "${bic}"`);
    }
    accValue += `+${cleanBic}`;
  }

  const parts = ['SPD', '1.0', `ACC:${accValue}`];

  // 2. Amount
  if (options.amount !== undefined && options.amount !== null && options.amount !== '') {
    const num = typeof options.amount === 'number' ? options.amount : parseFloat(String(options.amount).replace(',', '.'));
    if (isNaN(num) || num < 0) {
      throw new Error(`Invalid amount "${options.amount}". Must be a non-negative number.`);
    }
    parts.push(`AM:${num.toFixed(2)}`);
  }

  // 3. Currency (ISO 4217)
  const currency = (options.currency || 'CZK').toString().trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error(`Invalid currency code "${currency}". Must be a 3-letter ISO 4217 code (e.g. CZK, EUR, USD).`);
  }
  parts.push(`CC:${currency}`);

  // 4. Variable Symbol (X-VS: max 10 digits)
  const vs = options.vs ?? options.variableSymbol ?? options.variable_symbol;
  if (vs !== undefined && vs !== null && vs !== '') {
    const vsStr = String(vs).trim().replace(/\D/g, '');
    if (vsStr.length > 10) {
      throw new Error(`Variable symbol (X-VS) exceeds maximum length of 10 digits: "${vs}"`);
    }
    if (vsStr.length > 0) {
      parts.push(`X-VS:${vsStr}`);
    }
  }

  // 5. Specific Symbol (X-SS: max 10 digits)
  const ss = options.ss ?? options.specificSymbol ?? options.specific_symbol;
  if (ss !== undefined && ss !== null && ss !== '') {
    const ssStr = String(ss).trim().replace(/\D/g, '');
    if (ssStr.length > 10) {
      throw new Error(`Specific symbol (X-SS) exceeds maximum length of 10 digits: "${ss}"`);
    }
    if (ssStr.length > 0) {
      parts.push(`X-SS:${ssStr}`);
    }
  }

  // 6. Constant Symbol (X-KS: max 4 digits)
  const ks = options.ks ?? options.constantSymbol ?? options.constant_symbol;
  if (ks !== undefined && ks !== null && ks !== '') {
    const ksStr = String(ks).trim().replace(/\D/g, '');
    if (ksStr.length > 4) {
      throw new Error(`Constant symbol (X-KS) exceeds maximum length of 4 digits: "${ks}"`);
    }
    if (ksStr.length > 0) {
      parts.push(`X-KS:${ksStr}`);
    }
  }

  // 7. Message for recipient (MSG: max 60 chars, ASCII uppercase without diacritics)
  const msg = options.message ?? options.msg ?? options.remittanceInformation;
  if (msg !== undefined && msg !== null && msg !== '') {
    let cleanMsg = removeDiacritics(String(msg))
      .replace(/[*%]/g, ' ') // Strip SPAYD delimiters
      .replace(/\s+/g, ' ')
      .trim();
    if (cleanMsg.length > 60) {
      cleanMsg = cleanMsg.slice(0, 60).trim();
    }
    if (cleanMsg.length > 0) {
      parts.push(`MSG:${cleanMsg}`);
    }
  }

  // 8. Recipient Name (RN: max 35 chars, ASCII uppercase)
  const rn = options.recipientName ?? options.recipient ?? options.rn;
  if (rn !== undefined && rn !== null && rn !== '') {
    let cleanRn = removeDiacritics(String(rn))
      .replace(/[*%]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleanRn.length > 35) {
      cleanRn = cleanRn.slice(0, 35).trim();
    }
    if (cleanRn.length > 0) {
      parts.push(`RN:${cleanRn}`);
    }
  }

  // 9. Due Date (DT: 8 digits YYYYMMDD)
  const dt = options.dueDate ?? options.due_date ?? options.dt;
  if (dt) {
    let dtStr = '';
    if (dt instanceof Date) {
      const year = dt.getFullYear();
      const month = String(dt.getMonth() + 1).padStart(2, '0');
      const day = String(dt.getDate()).padStart(2, '0');
      dtStr = `${year}${month}${day}`;
    } else {
      dtStr = String(dt).replace(/\D/g, '');
    }
    if (dtStr.length === 8) {
      parts.push(`DT:${dtStr}`);
    }
  }

  // 10. Payment Type (PT: max 3 chars)
  const pt = options.paymentType ?? options.pt;
  if (pt) {
    const cleanPt = removeDiacritics(String(pt)).slice(0, 3).toUpperCase();
    parts.push(`PT:${cleanPt}`);
  }

  // 11. Payment Reference (RF: max 16 chars)
  const rf = options.reference ?? options.rf;
  if (rf) {
    const cleanRf = String(rf).replace(/[*]/g, '').slice(0, 16);
    parts.push(`RF:${cleanRf}`);
  }

  // 12. Custom attributes (e.g. custom: { 'X-URL': 'https://example.com' })
  if (options.custom && typeof options.custom === 'object') {
    for (const [key, val] of Object.entries(options.custom)) {
      if (val !== undefined && val !== null) {
        const cleanKey = key.toUpperCase().trim();
        const cleanVal = String(val).replace(/[*]/g, '').trim();
        parts.push(`${cleanKey}:${cleanVal}`);
      }
    }
  }

  let spaydString = parts.join('*');

  // 13. Optional CRC32 checksum
  if (options.includeCrc32 || options.crc32) {
    const hash = crc32(spaydString + '*');
    spaydString += `*CRC32:${hash}`;
  }

  return spaydString;
}

// ============================================================================
// 3. SVG BUILDER
// ============================================================================

/**
 * Resolves a logo source (file path, Buffer, base64 data URL, or SVG markup)
 * into an SVG-embeddable representation.
 * @param {object|string|Buffer} logoOpt
 * @returns {{ href?: string, rawSvg?: string }}
 */
function resolveLogoAsset(logoOpt) {
  if (!logoOpt) return null;
  const src = typeof logoOpt === 'object' && logoOpt.src ? logoOpt.src : logoOpt;

  if (Buffer.isBuffer(src)) {
    // Check if buffer is SVG
    const snippet = src.slice(0, 64).toString('utf8').trim().toLowerCase();
    if (snippet.startsWith('<svg') || snippet.startsWith('<?xml')) {
      return { rawSvg: src.toString('utf8') };
    }
    // Inspect magic bytes for image type
    let mime = 'image/png';
    if (src[0] === 0xff && src[1] === 0xd8) mime = 'image/jpeg';
    else if (src[0] === 0x52 && src[1] === 0x49 && src[2] === 0x46 && src[3] === 0x46) mime = 'image/webp';
    return { href: `data:${mime};base64,${src.toString('base64')}` };
  }

  if (typeof src === 'string') {
    const trimmed = src.trim();
    if (trimmed.startsWith('data:image/')) {
      return { href: trimmed };
    }
    if (trimmed.startsWith('<svg') || trimmed.startsWith('<?xml')) {
      return { rawSvg: trimmed };
    }
    // Assume file path
    if (fs.existsSync(trimmed)) {
      const ext = path.extname(trimmed).toLowerCase();
      const fileBuf = fs.readFileSync(trimmed);
      if (ext === '.svg') {
        return { rawSvg: fileBuf.toString('utf8') };
      }
      let mime = 'image/png';
      if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
      else if (ext === '.webp') mime = 'image/webp';
      return { href: `data:${mime};base64,${fileBuf.toString('base64')}` };
    }
  }

  return null;
}

/**
 * Generates the complete SVG string for the payment QR code.
 * Replicates the authentic ČBA "QR Platba" visual appearance with broken frame and custom text.
 * 
 * @param {object} options
 * @returns {string} XML SVG string
 */
function generateSvg(options) {
  const spaydString = buildSpayd(options);

  // General sizing
  const canvasSize = Math.max(100, options.size || 500);
  const bgColor = options.backgroundColor ?? '#ffffff';

  // Frame settings
  const frameOpt = options.frame ?? {};
  const showFrame = frameOpt.show !== false;
  const frameColor = frameOpt.color || '#000000';
  const strokeWidth = frameOpt.strokeWidth !== undefined ? frameOpt.strokeWidth : Math.max(1.5, Math.round(canvasSize * 0.0035 * 10) / 10);
  const frameText = frameOpt.text !== undefined ? frameOpt.text : 'QR Platba';
  const hasFrameText = showFrame && frameText && String(frameText).trim().length > 0;
  const textColor = frameOpt.textColor || frameColor;
  const fontFamily = frameOpt.fontFamily || 'Arial, Helvetica, sans-serif';
  const fontWeight = frameOpt.fontWeight || 'bold';
  const fontSize = frameOpt.fontSize || Math.round(canvasSize * 0.068);

  // Margins and paddings
  const outerMargin = options.margin !== undefined ? options.margin : Math.round(canvasSize * 0.095);
  const frameSize = canvasSize - outerMargin * 2;
  const frameX = outerMargin;
  const frameY = outerMargin;

  const qrPadding = options.qr?.padding !== undefined ? options.qr.padding : Math.round(canvasSize * 0.105);
  const qrSize = Math.max(50, frameSize - qrPadding * 2);
  const qrX = frameX + qrPadding;
  const qrY = frameY + qrPadding;

  // Logo settings
  const logoOpt = options.logo;
  const logoAsset = logoOpt ? resolveLogoAsset(logoOpt) : null;
  const hasLogo = !!logoAsset;

  // QR error correction level: default to 'M' (15%), or 'Q' (25%) / 'H' (30%) if logo is present
  const ecl = options.qr?.errorCorrectionLevel || (hasLogo ? 'Q' : 'M');

  // Generate QR matrix using qrcode
  const qrData = QRCode.create(spaydString, { errorCorrectionLevel: ecl });
  const moduleCount = qrData.modules.size;
  const moduleSize = qrSize / moduleCount;

  const darkColor = options.qr?.color?.dark || '#000000';
  const lightColor = options.qr?.color?.light || null;

  // Build SVG path for dark modules for crisp rendering
  let qrPath = '';
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (qrData.modules.get(r, c)) {
        const x = qrX + c * moduleSize;
        const y = qrY + r * moduleSize;
        qrPath += `M${x.toFixed(2)},${y.toFixed(2)}h${(moduleSize + 0.04).toFixed(2)}v${(moduleSize + 0.04).toFixed(2)}h-${(moduleSize + 0.04).toFixed(2)}z `;
      }
    }
  }

  // Compute frame path
  let frameSvg = '';
  if (showFrame) {
    const pTopLeftX = frameX;
    const pTopLeftY = frameY;
    const pTopRightX = frameX + frameSize;
    const pTopRightY = frameY;
    const pBottomRightX = frameX + frameSize;
    const pBottomRightY = frameY + frameSize;
    const pBottomLeftX = frameX;
    const pBottomLeftY = frameY + frameSize;

    if (hasFrameText) {
      const textOffset = frameOpt.textOffset !== undefined ? frameOpt.textOffset : Math.round(frameSize * 0.08);
      const textGap = frameOpt.textGap !== undefined ? frameOpt.textGap : Math.round(fontSize * 0.28);
      const textWidth = frameOpt.textWidth || estimateTextWidth(String(frameText), fontSize);

      const p1x = pBottomLeftX;
      const p1y = pBottomLeftY;
      const p2x = pBottomLeftX + textOffset;
      const p2y = pBottomLeftY;

      const textX = p2x + textGap;
      const textY = pBottomLeftY + Math.round(fontSize * 0.22); // Baseline aligns with the bottom border

      const p3x = textX + textWidth + textGap;
      const p3y = pBottomLeftY;
      const p4x = pBottomRightX;
      const p4y = pBottomRightY;

      // Draw border as two connected segments leaving a gap for the text:
      // Segment 1: from p3x -> p4x (bottom right) -> top right -> top left -> bottom left (p1x) -> p2x
      const pathD = `M ${p3x} ${p3y} L ${p4x} ${p4y} L ${pTopRightX} ${pTopRightY} L ${pTopLeftX} ${pTopLeftY} L ${p1x} ${p1y} L ${p2x} ${p2y}`;

      frameSvg = `
    <!-- CBA QR Platba Frame with Break -->
    <path d="${pathD}" fill="none" stroke="${escapeXml(frameColor)}" stroke-width="${strokeWidth}" stroke-linecap="square" />
    <text x="${textX}" y="${textY}" font-family="${escapeXml(fontFamily)}" font-size="${fontSize}" font-weight="${escapeXml(fontWeight)}" fill="${escapeXml(textColor)}">${escapeXml(frameText)}</text>`;
    } else {
      // Solid continuous frame without text break
      frameSvg = `
    <!-- Solid Frame -->
    <rect x="${frameX}" y="${frameY}" width="${frameSize}" height="${frameSize}" fill="none" stroke="${escapeXml(frameColor)}" stroke-width="${strokeWidth}" />`;
    }
  }

  // Build logo SVG element if present
  let logoSvg = '';
  if (hasLogo) {
    const rawLogoSize = logoOpt.size || logoOpt.width || 0.22;
    const logoPx = rawLogoSize <= 1 ? qrSize * rawLogoSize : Math.min(rawLogoSize, qrSize * 0.35);
    const logoBg = logoOpt.background !== false;
    const logoBgColor = typeof logoOpt.background === 'string' ? logoOpt.background : '#ffffff';
    const logoShape = logoOpt.backgroundShape || 'rounded-rect';
    const logoPadding = logoOpt.backgroundPadding !== undefined ? logoOpt.backgroundPadding : Math.round(logoPx * 0.14);
    const borderRadius = logoOpt.borderRadius !== undefined ? logoOpt.borderRadius : Math.round(logoPx * 0.18);

    const centerX = qrX + qrSize / 2;
    const centerY = qrY + qrSize / 2;
    const bgTotalSize = logoPx + logoPadding * 2;
    const bgX = centerX - bgTotalSize / 2;
    const bgY = centerY - bgTotalSize / 2;
    const imgX = centerX - logoPx / 2;
    const imgY = centerY - logoPx / 2;

    let badgeSvg = '';
    if (logoBg) {
      if (logoShape === 'circle') {
        badgeSvg = `<circle cx="${centerX}" cy="${centerY}" r="${(bgTotalSize / 2).toFixed(2)}" fill="${escapeXml(logoBgColor)}" />`;
      } else {
        badgeSvg = `<rect x="${bgX.toFixed(2)}" y="${bgY.toFixed(2)}" width="${bgTotalSize.toFixed(2)}" height="${bgTotalSize.toFixed(2)}" rx="${borderRadius}" ry="${borderRadius}" fill="${escapeXml(logoBgColor)}" />`;
      }
    }

    let assetSvg = '';
    if (logoAsset.href) {
      assetSvg = `<image href="${logoAsset.href}" x="${imgX.toFixed(2)}" y="${imgY.toFixed(2)}" width="${logoPx.toFixed(2)}" height="${logoPx.toFixed(2)}" preserveAspectRatio="xMidYMid meet" />`;
    } else if (logoAsset.rawSvg) {
      // Strip outer <svg ...> tag or wrap in inner SVG viewBox
      assetSvg = `<svg x="${imgX.toFixed(2)}" y="${imgY.toFixed(2)}" width="${logoPx.toFixed(2)}" height="${logoPx.toFixed(2)}" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">${logoAsset.rawSvg}</svg>`;
    }

    logoSvg = `
    <!-- Center Logo Badge -->
    ${badgeSvg}
    ${assetSvg}`;
  }

  // Light background rect for QR modules if lightColor specified
  const qrBgSvg = lightColor && lightColor !== 'transparent'
    ? `<rect x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" fill="${escapeXml(lightColor)}" />`
    : '';

  // Background rect for entire canvas
  const canvasBgSvg = bgColor && bgColor !== 'transparent'
    ? `<rect width="100%" height="100%" fill="${escapeXml(bgColor)}" />`
    : '';

  return `<svg width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision">
  ${canvasBgSvg}
  ${qrBgSvg}
  <!-- QR Code Modules -->
  <path d="${qrPath.trim()}" fill="${escapeXml(darkColor)}" />
  ${frameSvg}
  ${logoSvg}
</svg>`;
}

// ============================================================================
// 4. MAIN EXPORTED API
// ============================================================================

/**
 * Generates a payment QR code image in the specified format (PNG, SVG, or WebP).
 * 
 * @param {object} options Payment and design configuration options
 * @returns {Promise<Buffer|string>} Buffer for PNG/WebP, string for SVG
 */
async function generatePaymentQR(options = {}) {
  const format = (options.format || 'png').toLowerCase();
  const svg = generateSvg(options);

  if (format === 'svg') {
    if (options.asBuffer) {
      return Buffer.from(svg, 'utf8');
    }
    return svg;
  }

  const sharp = getSharp();
  const image = sharp(Buffer.from(svg, 'utf8'));

  if (format === 'png') {
    return await image.png().toBuffer();
  }

  if (format === 'webp') {
    return await image.webp({ quality: options.quality || 95 }).toBuffer();
  }

  throw new Error(`Unsupported format "${format}". Supported formats: 'png', 'svg', 'webp'.`);
}

/**
 * Generates an SVG string synchronously.
 * Does not require "sharp" to be installed.
 * 
 * @param {object} options
 * @returns {string} SVG XML markup
 */
function toSvg(options = {}) {
  return generateSvg(options);
}

/**
 * Generates an image Buffer in the requested format ('png' by default).
 * 
 * @param {object} options
 * @returns {Promise<Buffer>}
 */
async function toBuffer(options = {}) {
  const format = options.format || 'png';
  return await generatePaymentQR({ ...options, format, asBuffer: true });
}

/**
 * Generates a base64 Data URL (e.g. "data:image/png;base64,...").
 * Ideal for direct embedding in HTML <img> tags or React/Vue/Svelte components.
 * 
 * @param {object} options
 * @returns {Promise<string>}
 */
async function toDataUrl(options = {}) {
  const format = (options.format || 'png').toLowerCase();
  if (format === 'svg') {
    const svg = generateSvg(options);
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  const buffer = await toBuffer(options);
  const mime = format === 'webp' ? 'image/webp' : 'image/png';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

/**
 * Generates and saves the QR code directly to a file on disk.
 * 
 * @param {string} filePath Target destination path (e.g. "./qr-platba.png")
 * @param {object} options
 * @returns {Promise<string>} The resolved file path
 */
async function toFile(filePath, options = {}) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('toFile requires a valid file path string');
  }

  let format = options.format;
  if (!format) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.svg') format = 'svg';
    else if (ext === '.webp') format = 'webp';
    else format = 'png';
  }

  const result = await generatePaymentQR({ ...options, format });
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (typeof result === 'string') {
    fs.writeFileSync(filePath, result, 'utf8');
  } else {
    fs.writeFileSync(filePath, result);
  }

  return filePath;
}

// Attach sub-methods directly to the main function
generatePaymentQR.generatePaymentQR = generatePaymentQR;
generatePaymentQR.toSvg = toSvg;
generatePaymentQR.toBuffer = toBuffer;
generatePaymentQR.toDataUrl = toDataUrl;
generatePaymentQR.toFile = toFile;
generatePaymentQR.buildSpayd = buildSpayd;
generatePaymentQR.czechAccountToIban = czechAccountToIban;
generatePaymentQR.validateIban = validateIban;
generatePaymentQR.removeDiacritics = removeDiacritics;

module.exports = generatePaymentQR;
module.exports.default = generatePaymentQR;

// CLI runner when executed directly (e.g. `npx qr-paygen --iban CZ... --amount 200 --out qr.png`)
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
qr-paygen - Czech & Slovak SPAYD Payment QR Code Generator
Usage:
  qr-paygen --iban <IBAN> --amount <NUM> [options]
  qr-paygen --account <PREFIX-NUM/BANK> --amount <NUM> [options]

Options:
  --iban <str>       IBAN (e.g. CZ7603000000000076327632)
  --account <str>    Czech national account (e.g. 19-2000145399/0800)
  --amount <num>     Payment amount (e.g. 200.00)
  --currency <str>   Currency code (default: CZK)
  --vs <str>         Variable symbol (max 10 digits)
  --ss <str>         Specific symbol (max 10 digits)
  --ks <str>         Constant symbol (max 4 digits)
  --msg <str>        Message for recipient
  --rn <str>         Recipient name
  --text <str>       Border frame text (default: 'QR Platba')
  --format <fmt>     Output format: png, svg, webp (default: png)
  --size <num>       Image dimensions in px (default: 500)
  --out <path>       Target output file path (default: ./qr-payment.<format>)

Example:
  qr-paygen --iban CZ7603000000000076327632 --amount 200 --vs 1234567890 --msg "CLOVEK V TISNI" --out ./qr.png
`);
    process.exit(0);
  }

  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i].replace(/^--/, '');
    const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    opts[key] = val;
  }

  const outPath = opts.out || `./qr-payment.${opts.format || 'png'}`;
  toFile(outPath, {
    iban: opts.iban,
    account: opts.account,
    amount: opts.amount,
    currency: opts.currency,
    vs: opts.vs,
    ss: opts.ss,
    ks: opts.ks,
    message: opts.msg || opts.message,
    recipientName: opts.rn || opts.recipient,
    format: opts.format,
    size: opts.size ? parseInt(opts.size, 10) : undefined,
    frame: opts.text ? { text: opts.text } : undefined
  })
    .then((saved) => console.log(`✔ Payment QR code saved to ${saved}`))
    .catch((err) => {
      console.error('❌ Error generating QR code:', err.message);
      process.exit(1);
    });
}

