const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, '..', 'src', 'gen', 'shopping_cart.js');

if (fs.existsSync(out)) {
  console.log('OK: proto artifact exists:', out);
  process.exit(0);
} else {
  console.error('ERROR: proto artifact missing:', out);
  process.exit(2);
}
