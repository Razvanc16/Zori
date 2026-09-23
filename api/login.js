const { passwordMatches, issueToken, secret } = require('./_lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metoda nepermisa' });
  try {
    secret(); // fail early with a clear message if env vars are missing
    if (!passwordMatches(req.body && req.body.password)) {
      await new Promise((r) => setTimeout(r, 800)); // slow down guessing
      return res.status(401).json({ error: 'Parola nu e corecta.' });
    }
    return res.status(200).json({ token: issueToken() });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
};
