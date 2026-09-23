const { requireSession } = require('./_lib/auth');
const { headSha, readFile, commitFiles } = require('./_lib/github');
const { applyToIndex, validate } = require('./_lib/menu');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    requireSession(req);

    if (req.method === 'GET') {
      const sha = await headSha();
      const menu = JSON.parse(await readFile('menu.json', sha));
      return res.status(200).json({ menu, sha });
    }

    if (req.method === 'POST') {
      const { menu: incoming, baseSha } = req.body || {};
      const sha = await headSha();
      if (!baseSha || baseSha !== sha) {
        return res.status(409).json({
          error: 'Meniul a fost modificat intre timp (din alt tab sau de altcineva). Reincarca pagina si refa modificarile.',
        });
      }
      const [menuTxt, indexHtml] = await Promise.all([readFile('menu.json', sha), readFile('index.html', sha)]);
      const menu = validate(incoming, JSON.parse(menuTxt));
      const newIndex = applyToIndex(indexHtml, menu);
      const newMenuTxt = JSON.stringify(menu, null, 2) + '\n';
      if (newMenuTxt === menuTxt) return res.status(200).json({ sha, unchanged: true });
      const newSha = await commitFiles(sha, { 'menu.json': newMenuTxt, 'index.html': newIndex }, 'Actualizare meniu din admin');
      return res.status(200).json({ sha: newSha });
    }

    return res.status(405).json({ error: 'Metoda nepermisa' });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    return res.status(status).json({ error: status === 502 ? 'Nu s-a putut salva in GitHub. Incearca din nou peste un minut.' : e.message });
  }
};
