// Maps TMDb's normalized provider names (see backend's MAJOR_WATCH_PROVIDERS/
// normalizeProviderName) to locally-bundled logo assets. These are official
// logos sourced from Wikimedia Commons at their native/max resolution -
// TMDb's own provider logos are capped at 332x332 regardless of size
// requested, which is often lower quality than what's available elsewhere.
// Wordmark-only logos (no separate app-icon mark exists) were composited
// onto a plain background to match the colorful icon-tile look of the rest.
// Not every TMDb provider has an override here - anything missing just
// falls back to TMDb's own logo, unaffected.
export const PROVIDER_LOGO_OVERRIDES: Record<string, string> = {
  Netflix: 'assets/providers/netflix.png',
  Hulu: 'assets/providers/hulu.png',
  'Disney Plus': 'assets/providers/disney-plus.png',
  'Amazon Prime Video': 'assets/providers/amazon-prime-video.png',
  'Prime Video': 'assets/providers/amazon-prime-video.png',
  Max: 'assets/providers/hbo-max.png',
  'HBO Max': 'assets/providers/hbo-max.png',
  'Apple TV': 'assets/providers/apple-tv.png',
  'Apple TV Plus': 'assets/providers/apple-tv.png',
  'Paramount Plus': 'assets/providers/paramount-plus.png',
  Peacock: 'assets/providers/peacock.png',
  Starz: 'assets/providers/starz.png',
  'AMC+': 'assets/providers/amc-plus.png',
  Crunchyroll: 'assets/providers/crunchyroll.png',
  'ESPN Plus': 'assets/providers/espn-plus.png',
  Tubi: 'assets/providers/tubi.png',
  'Pluto TV': 'assets/providers/pluto-tv.png',
  'MGM Plus': 'assets/providers/mgm-plus.png',
  YouTube: 'assets/providers/youtube.png',
  'Google Play Movies': 'assets/providers/google-play-movies.png',
  Vudu: 'assets/providers/fandango-at-home.png',
  'Fandango At Home': 'assets/providers/fandango-at-home.png',
  'Discovery Plus': 'assets/providers/discovery-plus.png',
  'Discovery+': 'assets/providers/discovery-plus.png',
  BritBox: 'assets/providers/britbox.png',
  'Acorn TV': 'assets/providers/acorn-tv.png',
  Shudder: 'assets/providers/shudder.png',
  MUBI: 'assets/providers/mubi.png',
  'Criterion Channel': 'assets/providers/criterion-channel.png',
  Philo: 'assets/providers/philo.png',
  fuboTV: 'assets/providers/fubotv.png',
  'The Roku Channel': 'assets/providers/roku-channel.png',
  'Sling TV Orange': 'assets/providers/sling-tv.png',
  'Sling TV Orange and Blue': 'assets/providers/sling-tv.png',
  'YouTube TV': 'assets/providers/youtube-tv.png',
};
