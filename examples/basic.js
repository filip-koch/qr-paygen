const qrPaygen = require('../qr-paygen');

async function main() {
  // Generate payment QR code matching the SPAYD prompt:
  // SPD*1.0*ACC:CZ7603000000000076327632*AM:200.00*CC:CZK*X-VS:1234567890*MSG:CLOVEK V TISNI
  const pngBuffer = await qrPaygen({
    iban: 'CZ7603000000000076327632',
    amount: 200,
    currency: 'CZK',
    vs: '1234567890',
    message: 'Člověk v tísni', // Diacritics will be automatically converted to "CLOVEK V TISNI"
    format: 'png' // 'png', 'svg', or 'webp'
  });

  // Save to file
  await qrPaygen.toFile('./qr-platba.png', {
    iban: 'CZ7603000000000076327632',
    amount: 200,
    currency: 'CZK',
    vs: '1234567890',
    message: 'Člověk v tísni'
  });

  console.log('✔ QR code generated successfully: ./qr-platba.png (Buffer size:', pngBuffer.length, 'bytes)');
}

main().catch(console.error);
