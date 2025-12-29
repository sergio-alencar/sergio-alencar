import fs from "fs";
import fetch from "node-fetch";

const token = process.env.GITHUB_TOKEN;
const username = "sergio-alencar";

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
};

async function getRepos() {
  let repos = [];
  let page = 1;

  while (true) {
    const res = await fetch(`https://api.github.com/users/${username}/repos?per_page=100&page=${page}`, { headers });
    const data = await res.json();
    if (data.length === 0) break;
    repos.push(...data);
    page++;
  }
  return repos;
}

async function getLanguages(url) {
  const res = await fetch(url, { headers });
  return res.json();
}

(async () => {
  const repos = await getRepos();
  const totals = {};

  for (const repo of repos) {
    if (repo.fork) continue;

    const langs = await getLanguages(repo.languages_url);

    for (const [lang, bytes] of Object.entries(langs)) {
      totals[lang] = (totals[lang] || 0) + bytes;
    }
  }

  const totalBytes = Object.values(totals).reduce((a, b) => a + b, 0);

  const sorted = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, bytes]) => ({
      lang,
      percent: ((bytes / totalBytes) * 100).toFixed(2),
    }));

  let output = "## Most used languages\n\n";

  for (const { lang, percent } of sorted) {
    output += `- **${lang}** – ${percent}%\n`;
  }

  fs.writeFileSync("LANGUAGES.md", output);
})();
