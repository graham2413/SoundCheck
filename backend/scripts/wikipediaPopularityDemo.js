// ONE-TIME DIAGNOSTIC SCRIPT - not wired into the app. Re-ranks the current
// TMDb "Top 50 Actors" list by real Wikipedia monthly pageviews instead of
// TMDb's volatile `popularity` score, so we can eyeball whether it's actually
// a better "real world fame" signal before building it into the product.
// Run: node scripts/wikipediaPopularityDemo.js
require("dotenv").config({ path: ".env.development" });
const { getTmdbPopularActors, callTmdb } = require("../utils/callTmdb");

const UA = "SoundCheck-Cinewave/1.0 (research script; contact: dev@example.com)";

async function getWikidataId(personId) {
  const res = await callTmdb(`/person/${personId}/external_ids`);
  return res.data?.wikidata_id || null;
}

async function getEnwikiTitle(wikidataId) {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const json = await res.json();
  const entity = json.entities?.[wikidataId];
  return entity?.sitelinks?.enwiki?.title || null;
}

async function getMonthlyPageviews(title) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(
    title
  )}/daily/${fmt(start)}/${fmt(end)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return 0;
  const json = await res.json();
  return (json.items || []).reduce((sum, i) => sum + i.views, 0);
}

async function main() {
  const actors = (await getTmdbPopularActors()).slice(0, 50);
  console.log(`Fetched ${actors.length} actors from TMDb's current Top 50. Looking up Wikipedia pageviews...\n`);

  const results = [];
  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i];
    try {
      const wikidataId = await getWikidataId(actor.id);
      let title = null;
      let views = 0;
      if (wikidataId) {
        title = await getEnwikiTitle(wikidataId);
        if (title) views = await getMonthlyPageviews(title);
      }
      results.push({ tmdbRank: i + 1, name: actor.name, tmdbPopularity: actor.popularity, views });
    } catch (err) {
      results.push({ tmdbRank: i + 1, name: actor.name, tmdbPopularity: actor.popularity, views: 0, error: err.message });
    }
    // Be polite to Wikimedia's API
    await new Promise((r) => setTimeout(r, 150));
  }

  const byViews = [...results].sort((a, b) => b.views - a.views);

  console.log("Rank | Name                     | TMDb Rank | TMDb Pop. | 30-day Wiki Views");
  console.log("-----|--------------------------|-----------|-----------|-------------------");
  byViews.forEach((r, i) => {
    console.log(
      `${String(i + 1).padEnd(4)} | ${r.name.padEnd(24)} | ${String(r.tmdbRank).padEnd(9)} | ${String(
        r.tmdbPopularity.toFixed(1)
      ).padEnd(9)} | ${r.views.toLocaleString()}`
    );
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
