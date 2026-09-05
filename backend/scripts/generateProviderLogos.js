// ONE-TIME asset-generation script (not part of the app runtime) - downloads
// official high-res streaming service logos from Wikimedia Commons and, for
// wordmark-only logos, composites them onto a solid-color square background
// so they visually match TMDb's colorful icon-tile style used elsewhere.
// Run: node scripts/generateProviderLogos.js
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const OUT_DIR = path.join(__dirname, "..", "..", "frontend", "src", "assets", "providers");
const SIZE = 512;

// { slug, sourceUrl, isIconAlready }. sourceUrl is the real (non-thumbnail)
// Wikimedia Commons/enwiki file URL, found by browsing each service's
// Wikipedia infobox logo and resolving the thumb path to its original file.
const PROVIDERS = [
  { slug: "netflix", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg" },
  { slug: "hulu", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/f/f9/Hulu_logo_%282018%29.svg" },
  { slug: "disney-plus", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/6/64/Disney%2B_2024.svg" },
  { slug: "amazon-prime-video", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/9/90/Prime_Video_logo_%282024%29.svg" },
  { slug: "hbo-max", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/b/b3/HBO_Max_%282025%29.svg" },
  { slug: "apple-tv", sourceUrl: "https://upload.wikimedia.org/wikipedia/en/a/ae/Apple_TV_%28logo%29.svg" },
  { slug: "paramount-plus", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/a/a5/Paramount_Plus.svg" },
  { slug: "peacock", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/2/20/NBCUniversal_Peacock_Logo_%282026%29.svg" },
  { slug: "starz", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/0/03/Starz_2022.svg" },
  { slug: "amc-plus", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/4/4a/AMC%2B_logo.png" },
  { slug: "crunchyroll", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/d/d9/Crunchyroll_2024.svg" },
  { slug: "tubi", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/c/c5/Tubi_logo_2024_purple.svg" },
  { slug: "pluto-tv", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/5/5b/Pluto_TV_logo_2024_black.svg" },
  { slug: "espn-plus", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/8/80/ESPN_Plus.svg" },
  { slug: "mgm-plus", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/4/49/MGM%2B_logo.svg" },
  // Batch 2 - expanding from top 15 to top ~30
  { slug: "youtube", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/2/20/YouTube_2024.svg" },
  { slug: "google-play-movies", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/4/41/Google_TV_logo.svg" },
  { slug: "fandango-at-home", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/2/23/Fandango_2014.svg" },
  { slug: "discovery-plus", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/6/61/Discovery_Plus_logo.svg" },
  { slug: "britbox", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/4/42/BritBox_2026.svg" },
  { slug: "acorn-tv", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/e/ef/Acorn_TV_logo_2024.svg" },
  { slug: "shudder", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/5/51/Shudder_2017.svg" },
  { slug: "mubi", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/5/51/Mubi_logo.svg" },
  { slug: "criterion-channel", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/5/5d/The_Criterion_Collection_Logo.svg" },
  { slug: "philo", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/8/81/Philo_%282024%29.svg" },
  { slug: "fubotv", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/c/cb/Fubo_2023.svg" },
  { slug: "roku-channel", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/6/61/The_Roku_Channel_Logo.svg" },
  { slug: "sling-tv", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/5/53/Sling_TV_logo.svg" },
  { slug: "youtube-tv", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/f/fc/YouTube_TV_logo_2024.svg" },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const provider of PROVIDERS) {
    console.log(`Processing ${provider.slug}...`);
    if (fs.existsSync(path.join(OUT_DIR, `${provider.slug}.png`))) {
      console.log("  already exists, skipping");
      continue;
    }

    let res;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch(provider.sourceUrl, {
        // Wikimedia's upload.wikimedia.org rejects generic/non-browser User-Agents with a 403.
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        },
      });
      if (res.ok) break;
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      break;
    }
    if (!res.ok) {
      console.error(`  FAILED to download (${res.status})`);
      continue;
    }
    const buffer = Buffer.from(await res.arrayBuffer());

    // Rasterize the logo on its own (transparent) at high-res first, so we
    // can inspect its average brightness to pick a background that gives
    // good contrast, without having to hardcode every brand's official color.
    const logoBuffer = await sharp(buffer, { density: 300 })
      .resize(Math.round(SIZE * 0.72), Math.round(SIZE * 0.72), { fit: "inside", withoutEnlargement: false })
      .png()
      .toBuffer();

    const { data, info } = await sharp(logoBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let totalLum = 0;
    let opaquePixels = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const alpha = data[i + 3];
      if (alpha < 10) continue;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      totalLum += lum;
      opaquePixels++;
    }
    const avgLum = opaquePixels ? totalLum / opaquePixels : 128;
    // Logo pixels are themselves dark on average -> put on a light/white
    // background; logo pixels are light -> put on a dark background. Either
    // way this guarantees contrast without needing per-brand color data.
    const background = avgLum < 128 ? { r: 255, g: 255, b: 255, alpha: 1 } : { r: 10, g: 10, b: 12, alpha: 1 };

    const canvas = sharp({
      create: { width: SIZE, height: SIZE, channels: 4, background },
    });

    const composited = await canvas
      .composite([{ input: logoBuffer, gravity: "center" }])
      .png()
      .toBuffer();

    fs.writeFileSync(path.join(OUT_DIR, `${provider.slug}.png`), composited);
    console.log(`  saved ${provider.slug}.png (background: ${avgLum < 128 ? "white" : "dark"})`);
    await new Promise((r) => setTimeout(r, 1500)); // stay polite to Wikimedia between requests
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
