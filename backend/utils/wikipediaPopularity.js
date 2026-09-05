// Real-world "fame" signal for actors, based on actual Wikipedia readership
// instead of TMDb's volatile popularity score (which can be skewed by minor
// credits on high-traffic shows - see cinema-popularity research notes).
const redis = require("./redisClient");
const { getTmdbExternalIds } = require("./callTmdb");

const UA = "SoundCheck-Cinewave/1.0 (popularity ranking; contact: dev@example.com)";
const VIEWS_CACHE_TTL = 604800; // 7 days - pageview trends don't shift hour to hour
const PAGEVIEW_WINDOW_DAYS = 90; // smooths one-off news/meme spikes vs a 30-day window

async function getEnwikiTitle(wikidataId) {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;

  const json = await res.json();
  return json.entities?.[wikidataId]?.sitelinks?.enwiki?.title || null;
}

async function getMonthlyPageviews(title) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - PAGEVIEW_WINDOW_DAYS);
  const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");

  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(
    title
  )}/daily/${fmt(start)}/${fmt(end)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return 0;

  const json = await res.json();
  return (json.items || []).reduce((sum, i) => sum + i.views, 0);
}

// Returns { views, isFallback } - isFallback true means no Wikidata entry/
// enwiki article/tracked pageviews were found, so `views` is just TMDb's
// popularity passed through unchanged (caller decides how to blend/label it).
async function getPersonWikipediaPopularity(personId, tmdbPopularityFallback = 0) {
  const cacheKey = `wiki:popularity:${personId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  let result = { views: tmdbPopularityFallback, isFallback: true };

  try {
    const externalIds = await getTmdbExternalIds(personId);
    const wikidataId = externalIds?.wikidata_id;

    if (wikidataId) {
      const title = await getEnwikiTitle(wikidataId);
      if (title) {
        const views = await getMonthlyPageviews(title);
        if (views > 0) {
          result = { views, isFallback: false };
        }
      }
    }
  } catch (err) {
    console.error(`Wikipedia popularity lookup failed for person ${personId}:`, err.message);
  }

  await redis.set(cacheKey, JSON.stringify(result), "EX", VIEWS_CACHE_TTL);
  return result;
}

module.exports = { getPersonWikipediaPopularity };
