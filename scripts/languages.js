import fs from "node:fs";

const LANGUAGE_EMOJIS = {
  JavaScript: "🟨",
  TypeScript: "🔷",
  Python: "🐍",
  PHP: "🐘",
  HTML: "📄",
  CSS: "🎨",
  Shell: "🐚",
  Dockerfile: "🐳",
  "C#": "🎯",
  SQL: "🗄️",
  PowerShell: "💠",
  Go: "🐹",
  Rust: "🦀",
  Java: "☕",
  Others: "📦",
};

const README_PATH = "README.md";
const START_MARKER = "<!-- LANGUAGES:START -->";
const END_MARKER = "<!-- LANGUAGES:END -->";
const OTHERS_THRESHOLD = 1;

const token = process.env.GH_TOKEN;
if (!token) throw new Error("GH_TOKEN is not set");

const QUERY = `
  query ($cursor: String) {
    viewer {
      repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, isFork: false) {
        nodes {
          languages(first: 20, orderBy: { field: SIZE, direction: DESC }) {
            edges { size node { name } }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

async function graphql(variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables }),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);

  const body = await res.json();
  if (body.errors?.length) throw new Error(`GraphQL error: ${JSON.stringify(body.errors)}`);
  return body.data.viewer.repositories;
}

async function getLanguageTotals() {
  const totals = {};
  let cursor = null;

  do {
    const { nodes, pageInfo } = await graphql({ cursor });

    for (const repo of nodes) {
      for (const { size, node } of repo.languages.edges) {
        totals[node.name] = (totals[node.name] ?? 0) + size;
      }
    }

    cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (cursor);

  return totals;
}

function groupSmallLanguages(totals) {
  const totalBytes = Object.values(totals).reduce((a, b) => a + b, 0);
  if (totalBytes === 0) throw new Error("No language data returned");

  const main = [];
  let othersPercent = 0;

  for (const [lang, bytes] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
    const percent = (bytes / totalBytes) * 100;
    if (percent < OTHERS_THRESHOLD) othersPercent += percent;
    else main.push({ lang, percent });
  }

  if (othersPercent > 0) main.push({ lang: "Others", percent: othersPercent });
  return main;
}

// Largest remainder method: rounded values always add up to 100.
function roundPercentages(items) {
  const rounded = items.map((item) => ({ ...item, value: Math.floor(item.percent) }));
  let missing = 100 - rounded.reduce((sum, item) => sum + item.value, 0);

  const byRemainder = [...rounded].sort(
    (a, b) => b.percent - b.value - (a.percent - a.value)
  );
  for (const item of byRemainder) {
    if (missing-- <= 0) break;
    item.value++;
  }

  return rounded.filter((item) => item.value > 0);
}

function render(items) {
  const lines = items.map(({ lang, value }) => {
    const emoji = LANGUAGE_EMOJIS[lang] ?? "📌";
    return `- ${emoji} **${lang}** – ${value}%`;
  });
  return `## Most used languages\n\n${lines.join("\n")}`;
}

function updateReadme(section) {
  const readme = fs.readFileSync(README_PATH, "utf8");
  const start = readme.indexOf(START_MARKER);
  const end = readme.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${START_MARKER} / ${END_MARKER} markers not found in ${README_PATH}`);
  }

  const updated =
    readme.slice(0, start + START_MARKER.length) + "\n" + section + "\n" + readme.slice(end);
  fs.writeFileSync(README_PATH, updated);
}

const totals = await getLanguageTotals();
updateReadme(render(roundPercentages(groupSmallLanguages(totals))));
