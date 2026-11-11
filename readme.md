# qr-paygen

Node.js library for generating Czech and Slovak SPAYD payment QR codes (the standard "QR Platba" format defined by the Czech Banking Association).

Primarily created for [Merchant](https://github.com/filip-koch/merchant), but built as a standalone, single-file module (`qr-paygen.js`) that can be dropped into any project.

## Features

- Generates standard SPAYD strings (`SPD*1.0*...`).
- Renders the official Czech Banking Association frame with the text knockout in the bottom-left corner.
- Supports PNG, SVG, and WebP output formats.
- Allows custom border text (replacing "QR Platba") or disabling the frame entirely.
- Optional center logo overlay with automatic safety badge and higher error correction (`Q` / `H`) to preserve scannability.
- Converts Czech national account numbers (`[prefix-]account/bankCode`) to valid IBAN with modulo-97 check digits.
- Automatically strips Czech/Slovak diacritics from text fields (`ČLOVĚK V TÍSNI` -> `CLOVEK V TISNI`).
- Standalone: full implementation in a single file (`qr-paygen.js`) with TypeScript definitions (`qr-paygen.d.ts`).

## Installation

```bash
npm install qrcode sharp
```

`sharp` is required for PNG and WebP rendering. If you only generate SVG, `qrcode` is the only dependency needed.

## Quick Start

```javascript
const qrPaygen = require('./qr-paygen');

async function main() {
  // Save directly to file
  await qrPaygen.toFile('./qr-platba.png', {
    iban: 'CZ7603000000000076327632',
    amount: 200,
    currency: 'CZK',
    vs: '1234567890',
    message: 'Člověk v tísni', // Diacritics will be automatically stripped to ASCII
    format: 'png'              // 'png' | 'svg' | 'webp'
  });
}

main();
```

## Examples

### 1. Generating Buffers and Formats

```javascript
// PNG Buffer
const png = await qrPaygen({
  iban: 'CZ7603000000000076327632',
  amount: 200,
  format: 'png'
});

// Synchronous SVG string (does not require sharp)
const svg = qrPaygen.toSvg({
  iban: 'CZ7603000000000076327632',
  amount: 200
});

// WebP Buffer
const webp = await qrPaygen({
  iban: 'CZ7603000000000076327632',
  amount: 200,
  format: 'webp',
  quality: 90
});

// Base64 Data URL (for <img src="..."> in HTML / React)
const dataUrl = await qrPaygen.toDataUrl({
  iban: 'CZ7603000000000076327632',
  amount: 200
});
```

### 2. Custom Border Text and Colors

```javascript
await qrPaygen.toFile('./custom-frame.png', {
  iban: 'CZ7603000000000076327632',
  amount: 500,
  vs: '999888',
  message: 'DAR PRO ZOO',
  frame: {
    text: 'DAR PRO ZOO',      // Custom text instead of "QR Platba"
    color: '#15803d',         // Border stroke color
    textColor: '#15803d',
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontSize: 32
  },
  qr: {
    color: {
      dark: '#14532d'         // Module color
    }
  }
});
```

### 3. Center Logo

When `logo` is provided, the QR error correction level automatically upgrades to `'Q'` (25% redundancy) or `'H'` (30% redundancy) and draws a background badge behind the logo so the code remains scannable.

```javascript
await qrPaygen.toFile('./with-logo.png', {
  iban: 'CZ7603000000000076327632',
  amount: 1500,
  vs: '2024001',
  logo: {
    src: './logo.png',               // Path to file, Buffer, data URI, or SVG markup
    size: 0.20,                      // 20% of QR code width
    background: '#ffffff',           // Badge color behind the logo
    backgroundShape: 'rounded-rect', // 'rounded-rect' | 'circle' | 'rect'
    borderRadius: 8
  }
});
```

### 4. Czech Account Number Input

You can pass a standard Czech account number instead of an IBAN. The library converts it to an IBAN with modulo-97 check digits automatically.

```javascript
// Accepts string format:
const svg = qrPaygen.toSvg({
  account: '19-2000145399/0800',
  amount: 250,
  message: 'OBED'
});

// Or structured object:
const png = await qrPaygen({
  account: {
    prefix: '19',
    number: '2000145399',
    bankCode: '0800'
  },
  amount: 250
});
```

## CLI Usage

You can also run the generator from the terminal:

```bash
node qr-paygen.js --iban CZ7603000000000076327632 --amount 200 --vs 1234567890 --msg "CLOVEK V TISNI" --out ./qr.png
```

Supported CLI options:
- `--iban <str>`: IBAN
- `--account <str>`: Czech account (`[prefix-]number/bankCode`)
- `--amount <num>`: Payment amount
- `--currency <str>`: Currency code (default: `CZK`)
- `--vs <str>`: Variable symbol (max 10 digits)
- `--ss <str>`: Specific symbol (max 10 digits)
- `--ks <str>`: Constant symbol (max 4 digits)
- `--msg <str>`: Message for recipient
- `--rn <str>`: Recipient name
- `--text <str>`: Border frame text (default: `QR Platba`)
- `--format <fmt>`: `png`, `svg`, `webp` (default: `png`)
- `--size <num>`: Pixel dimension (default: `500`)
- `--out <path>`: Output file path

## API Reference

### `generatePaymentQR(options)`

Returns a Promise resolving to a `Buffer` (for `png` and `webp`) or a `string` (for `svg`).

#### Payment Options

| Parameter | Type | Default | Description |
|---|---|---|---|
| `iban` | `string` | — | International Bank Account Number |
| `account` | `string \| object` | — | Czech account notation (`"19-2000145399/0800"` or `{ prefix, number, bankCode }`) |
| `bic` / `swift` | `string` | — | Bank identifier code |
| `amount` | `number \| string` | — | Payment amount (formatted to 2 decimal places) |
| `currency` | `string` | `'CZK'` | 3-letter ISO 4217 code |
| `vs` / `variableSymbol` | `string \| number` | — | Variable symbol (max 10 digits) |
| `ss` / `specificSymbol` | `string \| number` | — | Specific symbol (max 10 digits) |
| `ks` / `constantSymbol` | `string \| number` | — | Constant symbol (max 4 digits) |
| `message` / `msg` | `string` | — | Recipient message (max 60 chars, diacritics stripped) |
| `recipientName` / `rn` | `string` | — | Recipient name (max 35 chars, diacritics stripped) |
| `dueDate` / `dt` | `Date \| string` | — | Due date (`YYYYMMDD` string or `Date` object) |
| `custom` | `object` | — | Additional SPAYD key-value pairs (e.g. `{ 'X-URL': 'https://...' }`) |
| `includeCrc32` | `boolean` | `false` | Include 8-character CRC32 checksum |
| `rawSpayd` | `string` | — | Pre-built SPAYD string (bypasses builder) |

#### Render Options

| Parameter | Type | Default | Description |
|---|---|---|---|
| `format` | `'png' \| 'svg' \| 'webp'` | `'png'` | Output format |
| `size` | `number` | `500` | Width and height in pixels |
| `margin` | `number` | `size * 0.095` | Outer margin from edge to frame |
| `backgroundColor` | `string` | `'#ffffff'` | Canvas background color (`'transparent'` supported) |
| `quality` | `number` | `95` | WebP compression quality (1–100) |
| `frame.show` | `boolean` | `true` | Set `false` to omit outer frame |
| `frame.text` | `string \| boolean` | `'QR Platba'` | Frame text. Set `false` or `''` for closed frame |
| `frame.color` | `string` | `'#000000'` | Frame stroke color |
| `frame.textColor` | `string` | `frame.color` | Frame text color |
| `frame.strokeWidth` | `number` | `~2` | Frame stroke width |
| `frame.fontFamily` | `string` | `'Arial, ...'` | Font family for text |
| `frame.fontSize` | `number` | `~34` | Font size in pixels |
| `qr.errorCorrectionLevel` | `'L' \| 'M' \| 'Q' \| 'H'` | `'M'` | Error correction level (defaults to `'Q'` if logo is present) |
| `qr.color.dark` | `string` | `'#000000'` | Color of dark modules |
| `qr.color.light` | `string` | `null` | Color of light modules |
| `logo.src` | `string \| Buffer` | — | File path, Buffer, base64 data URI, or SVG string |
| `logo.size` | `number` | `0.22` | Logo size ratio (`0.20` = 20% of QR size) |
| `logo.background` | `boolean \| string` | `true` | Badge background (`#ffffff` by default) |
| `logo.backgroundShape` | `'rounded-rect' \| 'circle' \| 'rect'` | `'rounded-rect'` | Shape of badge |

### Helper Methods

- `qrPaygen.toSvg(options)`: Generates SVG string synchronously.
- `qrPaygen.toBuffer(options)`: Returns Promise resolving to image Buffer.
- `qrPaygen.toDataUrl(options)`: Returns Promise resolving to base64 Data URL string.
- `qrPaygen.toFile(filePath, options)`: Generates image and writes to file on disk.
- `qrPaygen.buildSpayd(options)`: Returns raw SPAYD string without rendering.
- `qrPaygen.czechAccountToIban(account)`: Converts Czech account format to IBAN.
- `qrPaygen.validateIban(iban)`: Validates IBAN length and modulo-97 checksum.
- `qrPaygen.removeDiacritics(str)`: Converts Czech/Slovak text to uppercase ASCII.

## Tests

Run the test suite:

```bash
npm test
```

Tests cover SPAYD validation, diacritics stripping, Czech account conversion, SVG/PNG/WebP generation, center logo embedding, and verification using `jsQR`.

## License & Disclaimer

MIT License. See `LICENSE` for details.

This software is provided "as is", without warranty of any kind, express or implied. The author assumes no liability for errors, failed payments, or financial discrepancies resulting from the use of this software. Always test generated QR codes with banking apps prior to production use.
