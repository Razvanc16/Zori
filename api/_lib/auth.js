const crypto = require('crypto');

const SESSION_HOURS = 12;

function secret() {
  const { ADMIN_PASSWORD, GITHUB_TOKEN } = process.env;
  if (!ADMIN_PASSWORD || !GITHUB_TOKEN) {
    const e = new Error('Serverul nu e configurat: lipsesc ADMIN_PASSWORD sau GITHUB_TOKEN in Vercel.');
    e.status = 500;
    throw e;
  }
  // Changing the password invalidates every open session.
  return crypto.createHash('sha256').update(`zori-admin:${ADMIN_PASSWORD}:${GITHUB_TOKEN}`).digest();
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function passwordMatches(candidate) {
  const a = crypto.createHash('sha256').update(String(candidate || '')).digest();
  const b = crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD || '').digest();
  return crypto.timingSafeEqual(a, b);
}

function issueToken() {
  const exp = String(Date.now() + SESSION_HOURS * 3600 * 1000);
  return `${exp}.${sign(exp)}`;
}

function requireSession(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const [exp, sig] = token.split('.');
  const expected = exp ? sign(exp) : '';
  const valid = sig && expected.length === sig.length &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) && Number(exp) > Date.now();
  if (!valid) {
    const e = new Error('Sesiunea a expirat. Intra din nou cu parola.');
    e.status = 401;
    throw e;
  }
}

module.exports = { passwordMatches, issueToken, requireSession, secret };
