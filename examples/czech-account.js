const qrPaygen = require('../qr-paygen');

async function main() {
  // Pass a standard Czech account format: [prefix-]number/bankCode
  // qr-paygen automatically converts it to the proper international IBAN with check digits!
  
  const svgOutput = qrPaygen.toSvg({
    account: '19-2000145399/0800', // Česká spořitelna account
    amount: '1250.00',
    currency: 'CZK',
    vs: '102030',
    message: 'PLATBA ZA ZBOZI',
    recipientName: 'MOJE FIRMA S.R.O.'
  });

  console.log('Converted IBAN:', qrPaygen.czechAccountToIban('19-2000145399/0800'));
  console.log('Generated SVG (length: %d chars)', svgOutput.length);
}

main().catch(console.error);
