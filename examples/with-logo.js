const qrPaygen = require('../qr-paygen');

async function main() {
  // Generate a QR code with a tiny custom logo in the center
  // The error correction level is automatically upgraded to 'Q' (25%) so the QR remains 100% scannable!
  
  // Custom tiny SVG logo
  const customSvgLogo = `
    <circle cx="50" cy="50" r="46" fill="#2563eb" />
    <path d="M30 50 L45 65 L72 35" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none" />
  `;

  await qrPaygen.toFile('./qr-with-logo.png', {
    iban: 'CZ7603000000000076327632',
    amount: 1500,
    currency: 'CZK',
    vs: '2024001',
    message: 'FAKTURA 2024001',
    format: 'png',
    size: 544,
    logo: {
      src: customSvgLogo, // Can also be a file path like './logo.png' or base64 data URL
      size: 0.20,         // 20% of QR size
      background: '#ffffff',
      backgroundShape: 'rounded-rect', // 'rounded-rect', 'circle', or 'rect'
      borderRadius: 10
    }
  });

  console.log('✔ QR with custom logo generated: ./qr-with-logo.png');
}

main().catch(console.error);
