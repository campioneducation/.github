// scripts/grade-pr.js
const OpenAI = require("openai");
const TurndownService = require("turndown");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const turndown = new TurndownService();

const {
  CONFLUENCE_BASE_URL,
  CONFLUENCE_EMAIL,
  CONFLUENCE_TOKEN,
  CONFLUENCE_DOTNET_PAGE_ID,
  CONFLUENCE_ANGULAR_PAGE_ID,
  CONFLUENCE_PR_STANDARDS_PAGE_ID,
  GITHUB_TOKEN,
  PR_NUMBER,
  REPO_OWNER,
  REPO_NAME,
} = process.env;

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// ---------- Confluence ----------

async function fetchConfluencePage(pageId) {
  const url = `${CONFLUENCE_BASE_URL}/wiki/rest/api/content/${pageId}?expand=body.storage`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${CONFLUENCE_EMAIL}:${CONFLUENCE_TOKEN}`
      ).toString("base64")}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Confluence fetch failed (page ${pageId}): ${res.status} ${body}`);
  }

  const data = await res.json();
  return turndown.turndown(data.body.storage.value);
}

async function getStandards() {
  const [dotnet, angular, prStandards] = await Promise.all([
    fetchConfluencePage(requireEnv("CONFLUENCE_DOTNET_PAGE_ID", CONFLUENCE_DOTNET_PAGE_ID)),
    fetchConfluencePage(requireEnv("CONFLUENCE_ANGULAR_PAGE_ID", CONFLUENCE_ANGULAR_PAGE_ID)),
    fetchConfluencePage(requireEnv("CONFLUENCE_PR_STANDARDS_PAGE_ID", CONFLUENCE_PR_STANDARDS_PAGE_ID)),
  ]);
  return { dotnet, angular, prStandards };
}

// ---------- GitHub ----------

async function fetchPr() {
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${PR_NUMBER}`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    }
  );
  if (!res.ok) throw new Error(`Failed to fetch PR metadata: ${res.status}`);
  return res.json();
}

async function fetchDiff() {
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${PR_NUMBER}`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3.diff",
      },
    }
  );
  if (!res.ok) throw new Error(`Failed to fetch PR diff: ${res.status}`);
  return res.text();
}

async function postComment(body) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${PR_NUMBER}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    }
  );
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Failed to post PR comment: ${res.status} ${errBody}`);
  }
}

// ---------- Prompt ----------

const HEADING_RE = /^\s{0,3}(#{1,6}\s+.+|\*{1,2}[^*\n]+\*{1,2}:?)\s*$/;
const RISKS_HEADING_RE = /^\s{0,3}(#{1,6}\s*risks?\b.*|\*{1,2}risks?\*{0,2}:?.*)$/i;

// Drops a "Risks" section (heading through the next heading or end of text) from a PR description.
function stripRisksSection(text) {
  if (!text) return text;
  const lines = text.split("\n");
  const kept = [];
  let skipping = false;

  for (const line of lines) {
    if (RISKS_HEADING_RE.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping && HEADING_RE.test(line)) {
      skipping = false;
    }
    if (!skipping) kept.push(line);
  }

  return kept.join("\n").trim();
}

function buildPrompt(standards, pr, diff) {
  return `You are grading a merged pull request against our internal engineering standards.
Apply the same bar every time regardless of author or PR size. Be specific and cite
files/lines from the diff where possible. Only flag genuine violations of the standards
below — do not invent extra stylistic preferences that aren't in the documented standards.

## .NET Standards
${standards.dotnet}

## Angular Standards
${standards.angular}

## PR Standards
${standards.prStandards}

## PR Metadata
Title: ${pr.title}
Description: ${stripRisksSection(pr.body) || "(none)"}
Author: ${pr.user.login}
Files changed: ${pr.changed_files}

## Diff
${diff}

Respond ONLY with valid JSON, no preamble, no markdown fences, in exactly this shape:
{
  "overall_score": <integer 0-100>,
  "categories": {
    "code_standards": {"score": <integer 0-100>, "notes": "<1 sentence>"},
    "pr_description_quality": {"score": <integer 0-100>, "notes": "<1 sentence>"}
  },
  "violations": ["<specific issue, cite file/line where possible>"],
  "summary": "<1-2 sentence overall summary>"
}`;
}

// ---------- OpenAI ----------

async function gradeWithOpenAI(prompt) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini", // cheap tier — good fit for this structured grading task
    temperature: 0,       // most deterministic setting available
    response_format: { type: "json_object" }, // guarantees valid JSON back
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.choices[0].message.content;

  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`Failed to parse OpenAI response as JSON:\n${content}`);
  }
}

// ---------- Comment formatting ----------

const COMMENT_FORMAT_VERSION = "v1";

function formatComment(result) {
  const encoded = Buffer.from(JSON.stringify(result)).toString("base64");

  return `## 📋 PR Standards Report

**Score: ${result.overall_score}/100**

| Category | Score | Notes |
|---|---|---|
| Code Standards | ${result.categories.code_standards.score}/100 | ${result.categories.code_standards.notes} |
| PR Description Quality | ${result.categories.pr_description_quality.score}/100 | ${result.categories.pr_description_quality.notes} |

**Summary:** ${result.summary}

${
  result.violations && result.violations.length > 0
    ? `**Violations:**\n${result.violations.map((v) => `- ${v}`).join("\n")}`
    : "No violations found."
}

<!-- pr-standards-bot:${COMMENT_FORMAT_VERSION} -->
<!-- pr-standards-json:${encoded} -->
`;
}

// ---------- Main ----------

async function main() {
  requireEnv("OPENAI_API_KEY", process.env.OPENAI_API_KEY);
  requireEnv("GITHUB_TOKEN", GITHUB_TOKEN);
  requireEnv("PR_NUMBER", PR_NUMBER);
  requireEnv("REPO_OWNER", REPO_OWNER);
  requireEnv("REPO_NAME", REPO_NAME);
  requireEnv("CONFLUENCE_BASE_URL", CONFLUENCE_BASE_URL);
  requireEnv("CONFLUENCE_EMAIL", CONFLUENCE_EMAIL);
  requireEnv("CONFLUENCE_TOKEN", CONFLUENCE_TOKEN);

  console.log(`Grading PR #${PR_NUMBER} in ${REPO_OWNER}/${REPO_NAME}...`);

  const pr = await fetchPr();

  // Skip bot-authored PRs (Dependabot, etc.) — nothing for a human to be scored on.
  const botLogins = ["dependabot[bot]", "dependabot-preview[bot]"];
  if (pr.user.type === "Bot" || botLogins.includes(pr.user.login)) {
    console.log(`Skipping grading — PR author is a bot (${pr.user.login}).`);
    return;
  }

  const [standards, diff] = await Promise.all([getStandards(), fetchDiff()]);

  const prompt = buildPrompt(standards, pr, diff);
  const result = await gradeWithOpenAI(prompt);

  await postComment(formatComment(result));

  console.log(`Graded PR #${PR_NUMBER}: ${result.overall_score}/100`);
}

main().catch((err) => {
  console.error("Grading failed:", err);
  process.exit(1);
});
