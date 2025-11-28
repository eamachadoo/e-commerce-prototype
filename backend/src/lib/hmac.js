const crypto = require('crypto');

function validateHmac(rawBody, secret, signatureHeader) {
  if (!secret || !signatureHeader) return false;
  try {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

module.exports = { validateHmac };
