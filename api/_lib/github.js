// Minimal GitHub client: read files at the branch head and commit several files at once.
const REPO = process.env.GITHUB_REPO || 'Razvanc16/Zori';
const BRANCH = process.env.GITHUB_BRANCH || 'main';

async function gh(path, { method = 'GET', body, raw = false } = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'zori-admin',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const e = new Error(`GitHub ${method} ${path}: ${res.status} ${detail.slice(0, 200)}`);
    e.status = 502;
    throw e;
  }
  return raw ? res.text() : res.json();
}

async function headSha() {
  const ref = await gh(`/git/ref/heads/${BRANCH}`);
  return ref.object.sha;
}

function readFile(path, sha) {
  return gh(`/contents/${encodeURIComponent(path)}?ref=${sha}`, { raw: true });
}

// files: { 'path': 'utf-8 content' }. Fails if the branch moved past `parentSha`.
async function commitFiles(parentSha, files, message) {
  const parent = await gh(`/git/commits/${parentSha}`);
  const tree = await gh('/git/trees', {
    method: 'POST',
    body: {
      base_tree: parent.tree.sha,
      tree: Object.entries(files).map(([path, content]) => ({ path, mode: '100644', type: 'blob', content })),
    },
  });
  const commit = await gh('/git/commits', {
    method: 'POST',
    body: {
      message,
      tree: tree.sha,
      parents: [parentSha], // author defaults to the token owner, so Vercel accepts the deploy
    },
  });
  // force: false rejects the update if someone else pushed in the meantime
  await gh(`/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: { sha: commit.sha, force: false } });
  return commit.sha;
}

module.exports = { headSha, readFile, commitFiles };
