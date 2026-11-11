const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const jsQR = require('jsqr');
const qrPaygen = require('../qr-paygen');

async function decodeQrBuffer(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  return decoded ? decoded.data : null;
}

async function runTests() {
  console.log('🧪 Starting qr-paygen test suite...\n');

  // Test 1: buildSpayd with exact user prompt inputs
  console.log('▶ Test 1: SPAYD string construction (exact prompt case)');
  const promptSpayd = qrPaygen.buildSpayd({
    iban: 'CZ7603000000000076327632',
    amount: 200,
    currency: 'CZK',
    vs: '1234567890',
    message: 'CLOVEK V TISNI'
  });
  const expectedPromptSpayd = 'SPD*1.0*ACC:CZ7603000000000076327632*AM:200.00*CC:CZK*X-VS:1234567890*MSG:CLOVEK V TISNI';
  assert.strictEqual(promptSpayd, expectedPromptSpayd, 'SPAYD string should match exact user prompt format');
  console.log('  ✔ Match:', promptSpayd);

  // Test 2: Czech diacritics stripping
  console.log('\n▶ Test 2: Diacritics stripping (Czech characters)');
  const diacriticsSpayd = qrPaygen.buildSpayd({
    iban: 'CZ7603000000000076327632',
    amount: '450.50',
    currency: 'CZK',
    vs: '9876543210',
    message: 'Člověk v tísni - Příliš žluťoučký kůň',
    recipientName: 'Nadace Člověk v tísni'
  });
  assert.ok(diacriticsSpayd.includes('MSG:CLOVEK V TISNI - PRILIS ZLUTOUCKY KUN'));
  assert.ok(diacriticsSpayd.includes('RN:NADACE CLOVEK V TISNI'));
  console.log('  ✔ Diacritics stripped properly:', diacriticsSpayd);

  // Test 3: Czech account to IBAN conversion
  console.log('\n▶ Test 3: Czech national account conversion to IBAN');
  const ibanFromAccount = qrPaygen.czechAccountToIban('76327632/0300');
  assert.strictEqual(ibanFromAccount, 'CZ7603000000000076327632', 'Account 76327632/0300 must convert to CZ7603000000000076327632');
  
  const ibanWithPrefix = qrPaygen.czechAccountToIban('19-2000145399/0800');
  assert.strictEqual(qrPaygen.validateIban(ibanWithPrefix), true, 'Prefix account must produce valid IBAN');
  console.log('  ✔ 76327632/0300 ->', ibanFromAccount);
  console.log('  ✔ 19-2000145399/0800 ->', ibanWithPrefix);

  // Test 4: IBAN validation
  console.log('\n▶ Test 4: IBAN checksum validation');
  assert.strictEqual(qrPaygen.validateIban('CZ7603000000000076327632'), true);
  assert.strictEqual(qrPaygen.validateIban('CZ7603000000000076327633'), false); // Corrupted check digit
  console.log('  ✔ Validated correctly');

  // Test 5: PNG Generation & Scan Verification
  console.log('\n▶ Test 5: PNG format generation and QR scan verification');
  const pngBuffer = await qrPaygen({
    iban: 'CZ7603000000000076327632',
    amount: 200,
    currency: 'CZK',
    vs: '1234567890',
    message: 'CLOVEK V TISNI',
    format: 'png',
    size: 544
  });
  assert.ok(Buffer.isBuffer(pngBuffer), 'Result must be a Buffer');
  // Check PNG header
  assert.strictEqual(pngBuffer[0], 0x89);
  assert.strictEqual(pngBuffer[1], 0x50); // P
  assert.strictEqual(pngBuffer[2], 0x4e); // N
  assert.strictEqual(pngBuffer[3], 0x47); // G
  const decodedPng = await decodeQrBuffer(pngBuffer);
  assert.strictEqual(decodedPng, expectedPromptSpayd, 'Decoded QR content must equal prompt SPAYD');
  console.log('  ✔ PNG verified & decoded successfully:', decodedPng);

  // Test 6: SVG Generation
  console.log('\n▶ Test 6: SVG format generation (synchronous & asynchronous)');
  const svgString = qrPaygen.toSvg({
    iban: 'CZ7603000000000076327632',
    amount: 200,
    currency: 'CZK',
    frame: { text: 'QR Platba' }
  });
  assert.ok(typeof svgString === 'string', 'SVG should return XML string');
  assert.ok(svgString.startsWith('<svg'), 'SVG string should start with <svg');
  assert.ok(svgString.includes('QR Platba'), 'SVG should contain frame text');
  console.log('  ✔ SVG generated properly (length:', svgString.length, 'chars)');

  // Test 7: WebP Generation & Scan Verification
  console.log('\n▶ Test 7: WebP format generation and QR scan verification');
  const webpBuffer = await qrPaygen({
    iban: 'CZ7603000000000076327632',
    amount: 200,
    currency: 'CZK',
    vs: '1234567890',
    message: 'CLOVEK V TISNI',
    format: 'webp',
    size: 500
  });
  assert.ok(Buffer.isBuffer(webpBuffer), 'Result must be a Buffer');
  // Check WebP header: 'RIFF....WEBP'
  assert.strictEqual(webpBuffer.toString('utf8', 0, 4), 'RIFF');
  assert.strictEqual(webpBuffer.toString('utf8', 8, 12), 'WEBP');
  const decodedWebp = await decodeQrBuffer(webpBuffer);
  assert.strictEqual(decodedWebp, expectedPromptSpayd, 'Decoded WebP QR content must equal prompt SPAYD');
  console.log('  ✔ WebP verified & decoded successfully:', decodedWebp);

  // Test 8: Custom Border Text
  console.log('\n▶ Test 8: Custom border text customization');
  const customText = 'DAR PRO CHARITU';
  const customSvg = qrPaygen.toSvg({
    iban: 'CZ7603000000000076327632',
    amount: 500,
    frame: { text: customText, color: '#1e40af' }
  });
  assert.ok(customSvg.includes(customText), 'SVG must include custom text');
  assert.ok(customSvg.includes('#1e40af'), 'SVG must include custom frame color');
  console.log('  ✔ Custom border text verified');

  // Test 9: Center Logo with High Error Correction & Scan Verification
  console.log('\n▶ Test 9: Center logo overlay & QR decoding verification');
  // Create a sample SVG logo
  const sampleLogoSvg = '<circle cx="50" cy="50" r="45" fill="#e11d48"/><rect x="25" y="45" width="50" height="10" fill="#ffffff"/>';
  const logoPngBuffer = await qrPaygen({
    iban: 'CZ7603000000000076327632',
    amount: 200,
    currency: 'CZK',
    vs: '1234567890',
    message: 'CLOVEK V TISNI',
    format: 'png',
    size: 544,
    logo: {
      src: sampleLogoSvg,
      size: 0.22,
      background: '#ffffff',
      backgroundShape: 'rounded-rect'
    }
  });
  const decodedLogoQr = await decodeQrBuffer(logoPngBuffer);
  assert.strictEqual(decodedLogoQr, expectedPromptSpayd, 'QR with center logo must decode 100% reliably');
  console.log('  ✔ Center logo QR decoded successfully:', decodedLogoQr);

  // Test 10: Data URL generation
  console.log('\n▶ Test 10: Data URL generation (PNG and SVG)');
  const pngDataUrl = await qrPaygen.toDataUrl({
    iban: 'CZ7603000000000076327632',
    amount: 100
  });
  assert.ok(pngDataUrl.startsWith('data:image/png;base64,'), 'Should return base64 PNG Data URL');

  const svgDataUrl = await qrPaygen.toDataUrl({
    iban: 'CZ7603000000000076327632',
    amount: 100,
    format: 'svg'
  });
  assert.ok(svgDataUrl.startsWith('data:image/svg+xml'), 'Should return SVG Data URL');
  console.log('  ✔ Data URLs generated properly');

  // Test 11: File output helper
  console.log('\n▶ Test 11: Direct file write helper (toFile)');
  const testFileOut = path.join(__dirname, 'output-test.png');
  await qrPaygen.toFile(testFileOut, {
    iban: 'CZ7603000000000076327632',
    amount: 200,
    message: 'TEST WRITE'
  });
  assert.ok(fs.existsSync(testFileOut), 'File should exist');
  const fileStats = fs.statSync(testFileOut);
  assert.ok(fileStats.size > 1000, 'File size should be reasonable');
  fs.unlinkSync(testFileOut); // Clean up
  console.log('  ✔ File written and cleaned up successfully');

  console.log('\n🎉 ALL 11 TESTS PASSED PERFECTLY!\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
