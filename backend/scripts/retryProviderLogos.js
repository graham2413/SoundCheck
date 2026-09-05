// Retries just the 4 provider logos that hit persistent Wikimedia 429s during
// the main batch run, after waiting out the rate-limit window.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const OUT_DIR = path.join(__dirname, "..", "..", "frontend", "src", "assets", "providers");
const SIZE = 512;

const PROVIDERS = [
  { slug: "criterion-channel", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/5/5d/The_Criterion_Collection_Logo.svg" },
  { slug: "philo", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/8/81/Philo_%282024%29.svg" },
  { slug: "roku-channel", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/6/61/The_Roku_Channel_Logo.svg" },
  { slug: "youtube-tv", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/f/fc/YouTube_TV_logo_2024.svg" },
];

async function main() {
  console.log("Waiting 60s for Wikimedia rate limit to clear...");
  await new Promise((r) => setTimeout(r, 60000));

  for (const provider of PROVIDERS) {
    console.log(`Processing ${provider.slug}...`);
    let res;
    for (let attempt = 0; attempt < 6; attempt++) {
      res = await fetch(provider.sourceUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        },
      });
      if (res.ok) break;
      console.log(`  attempt ${attempt + 1} failed (${res.status}), waiting...`);
      await new Promise((r) => setTimeout(r, 8000 * (attempt + 1)));
    }
    if (!res.ok) {
      console.error(`  FAILED to download (${res.status})`);
      continue;
    }
    const buffer = Buffer.from(await res.arrayBuffer());

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
    const background = avgLum < 128 ? { r: 255, g: 255, b: 255, alpha: 1 } : { r: 10, g: 10, b: 12, alpha: 1 };

    const composited = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background } })
      .composite([{ input: logoBuffer, gravity: "center" }])
      .png()
      .toBuffer();

    fs.writeFileSync(path.join(OUT_DIR, `${provider.slug}.png`), composited);
    console.log(`  saved ${provider.slug}.png`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
