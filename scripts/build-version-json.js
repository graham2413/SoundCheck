// Builds frontend/public/version.json, including release notes shown in the
// forced PWA update overlay (see frontend/src/app/app.component.ts).
//
// Release notes come from ./release-notes.json (repo root) - a short,
// user-friendly, hand-written summary kept up to date alongside each commit
// (see /memories/git-workflow.md for the authoring convention). This is
// intentionally NOT auto-derived from raw commit messages, which read as
// too technical for end users. Falls back to auto-deriving from recent git
// commits only if that file is missing/empty, as a safety net.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const MAX_COMMITS_SCANNED = 15;
const MAX_ITEMS_PER_SECTION = 3;

const CATEGORY_LABELS = {
  features: "New features",
  stability: "Performance & stability",
  security: "Security updates",
};

const EXCLUDED_SUBJECT_PREFIXES = ["chore", "docs", "style", "test", "ci", "build"];

const SECURITY_PATTERN = /\b(security|auth|vuln|token|credential|csrf|xss|injection|sanitiz\w*|harden\w*|unauthorized|private\w*|permission)\b/i;
const STABILITY_PATTERN = /\b(fix\w*|correct\w*|resolv\w*|bug|patch\w*|prevent\w*|stale|hang\w*|leak\w*|race|refactor\w*|optimi[sz]\w*|cache\w*|perf\w*|faster|speed\w*|stutter\w*|hesitat\w*|parallel\w*|regression)\b/i;
const FEATURE_PATTERN = /^(add\w*|introduc\w*|implement\w*|creat\w*|new|support\w*|enable\w*|allow\w*|display\w*|show\w*|renam\w*|switch\w*)\b/i;

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Returns a category for one bullet/subject's text, or null if unclassified
function categorizeText(text) {
  if (SECURITY_PATTERN.test(text)) return "security";
  if (STABILITY_PATTERN.test(text)) return "stability";
  if (FEATURE_PATTERN.test(text)) return "features";
  return null;
}

function categorizeSubjectFallback(subject) {
  const match = subject.match(/^(\w+)(\([^)]*\))?:\s*(.+)$/);
  if (!match) return null;

  const [, prefix, , rest] = match;
  const type = prefix.toLowerCase();
  const text = capitalize(rest);

  if (EXCLUDED_SUBJECT_PREFIXES.includes(type)) return null;
  if (type === "security") return { category: "security", text };
  if (type === "feat") return { category: "features", text };
  if (["fix", "perf", "refactor"].includes(type)) return { category: "stability", text };
  return categorizeText(text) && { category: categorizeText(text), text };
}

function getReleaseNotes() {
  let commits = [];
  try {
    // %x1f separates subject/body within a commit, %x1e separates commits
    const log = execSync(`git log -${MAX_COMMITS_SCANNED} --pretty=format:%s%x1f%b%x1e`, { encoding: "utf8" });
    commits = log
      .split("\x1e")
      .filter((chunk) => chunk.trim())
      .map((chunk) => {
        const [subject = "", body = ""] = chunk.split("\x1f");
        return { subject: subject.trim(), body };
      });
  } catch {
    return {}; // no git history available (e.g. shallow clone) - overlay just hides all sections
  }

  const notes = { features: [], stability: [], security: [] };
  const addNote = (category, text) => {
    if (category && notes[category].length < MAX_ITEMS_PER_SECTION) notes[category].push(text);
  };

  for (const { subject, body } of commits) {
    const subjectType = (subject.match(/^(\w+)(\([^)]*\))?:/) || [])[1]?.toLowerCase();
    if (subjectType && EXCLUDED_SUBJECT_PREFIXES.includes(subjectType)) continue;

    const bullets = [...body.matchAll(/^-\s+(.+)$/gm)]
      .map((m) => m[1].trim())
      .filter((line) => !/^minor:/i.test(line));

    if (bullets.length === 0) {
      const fallback = categorizeSubjectFallback(subject);
      if (fallback) addNote(fallback.category, fallback.text);
      continue;
    }

    for (const bullet of bullets) {
      addNote(categorizeText(bullet), capitalize(bullet));
    }
  }

  // Drop empty sections and map to display labels
  const output = {};
  for (const [key, items] of Object.entries(notes)) {
    if (items.length) output[CATEGORY_LABELS[key]] = items;
  }
  return output;
}

// Reads the hand-written, user-friendly release notes file if present and
// non-empty; returns null otherwise so the caller can fall back.
function getHandWrittenReleaseNotes() {
  try {
    const filePath = path.resolve(__dirname, "../release-notes.json");
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Object.keys(parsed).length ? parsed : null;
  } catch {
    return null;
  }
}

const version = (process.env.BUILD_VERSION || "").slice(0, 7);
const buildNumber = process.env.BUILD_NUMBER || "";
const builtAt = new Date().toISOString();

process.stdout.write(
  JSON.stringify({
    version,
    buildNumber,
    builtAt,
    notes: getHandWrittenReleaseNotes() || getReleaseNotes(),
  })
);
