const qrPaygen = require('../qr-paygen');

async function main() {
  // Generate a QR code with custom border text and colors
  await qrPaygen.toFile('./qr-custom-text.webp', {
    iban: 'CZ7603000000000076327632',
    amount: 500,
    currency: 'CZK',
    vs: '999888',
    message: 'DAR PRO ZOO PRAHA',
    format: 'webp',
    size: 544,
    frame: {
      text: 'DAR PRO ZOO',       // Custom text replacing "QR Platba"
      color: '#15803d',          // Forest green border
      textColor: '#15803d',
      fontFamily: 'Helvetica, Arial, sans-serif',
      fontSize: 32
    },
    qr: {
      color: {
        dark: '#14532d'          // Dark green QR modules
      }
    }
  });

  console.log('✔ QR with custom text & colors generated: ./qr-custom-text.webp');
}

main().catch(console.error);
