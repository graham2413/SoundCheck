// Builds frontend/public/version.json, including categorized release notes
// derived from recent commit subject lines. Read by the frontend's forced
// PWA update overlay (see frontend/src/app/app.component.ts).
//
// Commit convention this depends on - keep in sync with any commit message
// generation (see /memories/repo/commit-convention.md for the agent-side copy):
//   feat:                                  -> "New features"
//   fix:, perf:, refactor:                 -> "Performance & stability"
//   security: (or subject mentions         -> "Security updates"
//     security/auth/vuln)
//   chore:, docs:, style:, test:, ci:,
//   build:                                 -> excluded from the overlay
//
// Only the commit subject line is used (no commit body bullets).

const { execSync } = require("child_process");

const MAX_COMMITS_SCANNED = 15;
const MAX_ITEMS_PER_SECTION = 3;

const CATEGORY_LABELS = {
  features: "New features",
  stability: "Performance & stability",
  security: "Security updates",
};

const EXCLUDED_PREFIXES = ["chore", "docs", "style", "test", "ci", "build"];

function categorizeSubject(subject) {
  const match = subject.match(/^(\w+)(\([^)]*\))?:\s*(.+)$/);
  if (!match) return null;

  const [, prefix, , rest] = match;
  const type = prefix.toLowerCase();
  const text = rest.charAt(0).toUpperCase() + rest.slice(1);

  if (EXCLUDED_PREFIXES.includes(type)) return null;
  if (type === "security" || /security|auth|vuln/i.test(text)) return { category: "security", text };
  if (type === "feat") return { category: "features", text };
  if (["fix", "perf", "refactor"].includes(type)) return { category: "stability", text };
  return null;
}

function getReleaseNotes() {
  let subjects = [];
  try {
    const log = execSync(`git log -${MAX_COMMITS_SCANNED} --pretty=%s`, { encoding: "utf8" });
    subjects = log.split("\n").filter(Boolean);
  } catch {
    return {}; // no git history available (e.g. shallow clone) - overlay just hides all sections
  }

  const notes = { features: [], stability: [], security: [] };
  for (const subject of subjects) {
    const result = categorizeSubject(subject);
    if (!result) continue;
    if (notes[result.category].length < MAX_ITEMS_PER_SECTION) {
      notes[result.category].push(result.text);
    }
  }

  // Drop empty sections and map to display labels
  const output = {};
  for (const [key, items] of Object.entries(notes)) {
    if (items.length) output[CATEGORY_LABELS[key]] = items;
  }
  return output;
}

const version = (process.env.BUILD_VERSION || "").slice(0, 7);
const buildNumber = process.env.BUILD_NUMBER || "";
const builtAt = new Date().toISOString();

process.stdout.write(
  JSON.stringify({
    version,
    buildNumber,
    builtAt,
    notes: getReleaseNotes(),
  })
);
