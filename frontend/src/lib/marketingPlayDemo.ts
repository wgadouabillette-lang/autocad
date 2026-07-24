import type { SpotifyTrackCard } from "./connectorsApi";
import { MARKETING_PREVIEW_BLINDING_LIGHTS_COVER_URL } from "./marketingPreview";
import type { PlaySearchSkillResult } from "./playSkill";

const RESULT_COUNT = 8;

function track(
  id: string,
  name: string,
  artists: string,
  album: string,
  imageUrl: string,
  url?: string,
): SpotifyTrackCard {
  return {
    id,
    name,
    artists,
    album,
    imageUrl,
    url: url ?? `https://open.spotify.com/track/${id}`,
  };
}

/** Catalog used for marketing `/play` search ranking (title / artist / album). */
const DEMO_CATALOG: SpotifyTrackCard[] = [
  // The Weeknd
  track(
    "0VjIjW4GlUZAMYd2vXMi3b",
    "Blinding Lights",
    "The Weeknd",
    "After Hours",
    MARKETING_PREVIEW_BLINDING_LIGHTS_COVER_URL,
  ),
  track(
    "5QO79kh1waicX191zhPmgp",
    "Save Your Tears",
    "The Weeknd",
    "After Hours (Deluxe)",
    "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/83/3a/f7/833af71b-2e0c-3303-24f5-8f5c546c073b/20UMGIM21167.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "7MXVkk9YMctZqd1Srtv4MB",
    "Starboy (feat. Daft Punk)",
    "The Weeknd",
    "Starboy",
    "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/b5/92/bb/b592bb72-52e3-e756-9b26-9f56d08f47ab/16UMGIM67864.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "7fBv7CLKzipRk6EC6TWHOB",
    "The Hills",
    "The Weeknd",
    "Beauty Behind the Madness",
    "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/30/05/1e/30051e57-a63a-3acc-4b30-42568293f5f7/15UMGIM36514.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "2LBqCSwhJGcFQeTHMVGwy3",
    "Die For You",
    "The Weeknd",
    "Starboy",
    "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/e2/61/f8/e261f8c1-73db-9a7a-c89e-1068f19970e0/16UMGIM67863.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "22VdIZQfgXJea34mQxlt81",
    "Can't Feel My Face",
    "The Weeknd",
    "Beauty Behind the Madness",
    "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/30/05/1e/30051e57-a63a-3acc-4b30-42568293f5f7/15UMGIM36514.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "5GXAXm5YOmYRZZcLSUy7OJ",
    "I Feel It Coming (feat. Daft Punk)",
    "The Weeknd",
    "Starboy",
    "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/e2/61/f8/e261f8c1-73db-9a7a-c89e-1068f19970e0/16UMGIM67863.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "2p8IUWQDrpfaFRmWi5dCyr",
    "After Hours",
    "The Weeknd",
    "After Hours",
    MARKETING_PREVIEW_BLINDING_LIGHTS_COVER_URL,
  ),
  // Billie
  track(
    "2Fxmhks0bxGSBdJ92vM78m",
    "bad guy",
    "Billie Eilish",
    "WHEN WE ALL FALL ASLEEP, WHERE DO WE GO?",
    "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1a/37/d1/1a37d1b1-8508-54f2-f541-bf4e437dda76/19UMGIM05028.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "4S2uhQE8IfA7YV0E3oC0y1",
    "bury a friend",
    "Billie Eilish",
    "WHEN WE ALL FALL ASLEEP, WHERE DO WE GO?",
    "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1a/37/d1/1a37d1b1-8508-54f2-f541-bf4e437dda76/19UMGIM05028.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "43zdsphuZLzwA9k4DVjP0x",
    "when the party's over",
    "Billie Eilish",
    "WHEN WE ALL FALL ASLEEP, WHERE DO WE GO?",
    "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1a/37/d1/1a37d1b1-8508-54f2-f541-bf4e437dda76/19UMGIM05028.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "3ZCTVFBt2VjqG9s0H1oYjT",
    "everything i wanted",
    "Billie Eilish",
    "everything i wanted - Single",
    "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/c5/6c/b1/c56cb16a-52c3-33b5-5189-6c65028001fb/19UM1IM00404.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "5QOdnG62ylLiF8PXYZkKb3",
    "Therefore I Am",
    "Billie Eilish",
    "Happier Than Ever",
    "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/2d/f3/c9/2df3c9fd-e0eb-257c-c035-b04f05a66580/21UMGIM36691.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "0u2P5u6YogBhlbbUJiS8jL",
    "lovely",
    "Billie Eilish & Khalid",
    "lovely - Single",
    "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/27/94/d4/2794d4fc-c3e2-2373-3e6c-dd82fd5aefe6/18UMGIM18200.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "7hOlEDG6x0d4k5s6z2Z0vY",
    "ocean eyes",
    "Billie Eilish",
    "dont smile at me",
    "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/02/1d/30/021d3036-5503-3ed3-df00-882f2833a6ae/17UM1IM17026.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "4RVwu0g32PAqgUiJoXsd2E",
    "Happier Than Ever",
    "Billie Eilish",
    "Happier Than Ever",
    "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/2d/f3/c9/2df3c9fd-e0eb-257c-c035-b04f05a66580/21UMGIM36691.rgb.jpg/600x600bb.jpg",
  ),
  // Daft Punk
  track(
    "0DiWol3gz17u6dCEFuBKSD",
    "One More Time",
    "Daft Punk",
    "Discovery",
    "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/fd/4a/77/fd4a77db-0ebc-d043-41a2-f32fa1bb0fb4/dj.qrikkdwj.jpg/600x600bb.jpg",
  ),
  track(
    "2Foc5Q5nqNiosCNqttzHof",
    "Get Lucky",
    "Daft Punk, Pharrell Williams & Nile Rodgers",
    "Random Access Memories",
    "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/e8/43/5f/e8435ffa-b6b9-b171-40ab-4ff3959ab661/886443919266.jpg/600x600bb.jpg",
  ),
  track(
    "1IDrOfvod9WPiAXxWxQYJX",
    "Around the World",
    "Daft Punk",
    "Homework",
    "https://is1-ssl.mzstatic.com/image/thumb/Features115/v4/34/8d/c7/348dc71c-d75e-9baf-671a-994e9e74b018/dj.pimdxdmf.jpg/600x600bb.jpg",
  ),
  track(
    "5W3cjX2J3tjhG8pkq6mOow",
    "Harder Better Faster Stronger",
    "Daft Punk",
    "Discovery",
    "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/fd/4a/77/fd4a77db-0ebc-d043-41a2-f32fa1bb0fb4/dj.qrikkdwj.jpg/600x600bb.jpg",
  ),
  track(
    "2cGxRwrMyE2K5q2gOq0GqG",
    "Instant Crush",
    "Daft Punk & Julian Casablancas",
    "Random Access Memories",
    "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/e8/43/5f/e8435ffa-b6b9-b171-40ab-4ff3959ab661/886443919266.jpg/600x600bb.jpg",
  ),
  track(
    "0R7EsPm01pCa3tHD0JQ5jS",
    "Something About Us",
    "Daft Punk",
    "Discovery",
    "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/fd/4a/77/fd4a77db-0ebc-d043-41a2-f32fa1bb0fb4/dj.qrikkdwj.jpg/600x600bb.jpg",
  ),
  track(
    "2cGxRwr9v2u3gF2hVq0GqH",
    "Digital Love",
    "Daft Punk",
    "Discovery",
    "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/fd/4a/77/fd4a77db-0ebc-d043-41a2-f32fa1bb0fb4/dj.qrikkdwj.jpg/600x600bb.jpg",
  ),
  track(
    "5CMjjzwI9VBCSuwEzpndYf",
    "Lose Yourself to Dance",
    "Daft Punk & Pharrell Williams",
    "Random Access Memories",
    "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/e8/43/5f/e8435ffa-b6b9-b171-40ab-4ff3959ab661/886443919266.jpg/600x600bb.jpg",
  ),
  // Killers / Sheeran / M83
  track(
    "3n3Ppam7vgaVa1IA8jrMVf",
    "Mr. Brightside",
    "The Killers",
    "Hot Fuss",
    "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/07/1a/5a/071a5aee-6e42-060c-35b9-6a6e45b9ea59/06UMGIM10441.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "7oK9VyNzrYvRAiOnbU7V0d",
    "Somebody Told Me",
    "The Killers",
    "Hot Fuss",
    "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/07/1a/5a/071a5aee-6e42-060c-35b9-6a6e45b9ea59/06UMGIM10441.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "0eGsygTp906u18L0Oimnem",
    "When You Were Young",
    "The Killers",
    "Sam's Town",
    "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/0d/d8/d7/0dd8d755-2147-9954-8b2e-991b25e49f51/17UM1IM06934.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "7qiZfU4dY1lWllzX7mPBI3",
    "Shape of You",
    "Ed Sheeran",
    "÷ (Deluxe)",
    "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/15/e6/e8/15e6e8a4-4190-6a8b-86c3-ab4a51b88288/190295851286.jpg/600x600bb.jpg",
  ),
  track(
    "0tgVpDi06FyKpA1z0VMD4v",
    "Perfect",
    "Ed Sheeran",
    "÷ (Deluxe)",
    "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/15/e6/e8/15e6e8a4-4190-6a8b-86c3-ab4a51b88288/190295851286.jpg/600x600bb.jpg",
  ),
  track(
    "1mea3bSkSG0x5KTuAYJda5",
    "Midnight City",
    "M83",
    "Hurry Up, We're Dreaming",
    "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/cb/7b/a9/cb7ba903-b5f1-cc21-90db-7a81b7aa0997/724596951057.jpg/600x600bb.jpg",
  ),
  track(
    "m83-wait",
    "Wait",
    "M83",
    "Hurry Up, We're Dreaming",
    "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/cb/7b/a9/cb7ba903-b5f1-cc21-90db-7a81b7aa0997/724596951057.jpg/600x600bb.jpg",
  ),
  // Waves / Heat Waves / related titles
  track(
    "1532427385",
    "Waves",
    "Mr. Probz",
    "Waves - Single",
    "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/61/e3/eb/61e3ebfd-37a6-ebc0-3d75-44ea0e1bbfbb/886444358125.png/600x600bb.jpg",
  ),
  track(
    "1532427206",
    "Waves (Robin Schulz Remix Radio Edit)",
    "Mr. Probz",
    "Waves (Robin Schulz Remix Radio Edit) - Single",
    "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/2c/dd/0d/2cdd0d9b-0838-d30a-8b74-d401c0a565db/886444416252.png/600x600bb.jpg",
  ),
  track(
    "1532426999",
    "Waves (feat. Chris Brown & T.I.) [Robin Schulz Remix]",
    "Mr. Probz",
    "Waves (feat. Chris Brown & T.I.) [Robin Schulz Remix] - Single",
    "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/14/e3/e9/14e3e9aa-6767-3b4a-15f6-5af0e897e825/886444970860.png/600x600bb.jpg",
  ),
  track(
    "1442966493",
    "Waves",
    "Kanye West",
    "The Life of Pablo",
    "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/ec/fd/e0/ecfde04e-6db2-e55e-41fe-83c87a52b16e/00602547908339.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "1005196822",
    "waves",
    "Miguel",
    "Wildheart (Deluxe)",
    "https://is1-ssl.mzstatic.com/image/thumb/Music5/v4/c6/b4/0e/c6b40ee8-53a9-50d4-f51e-9e9cbec171a7/886445204285.jpg/600x600bb.jpg",
  ),
  track(
    "1087077324",
    "Waves (Tame Impala Remix)",
    "Miguel",
    "Rogue Waves - EP",
    "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/2a/3f/2d/2a3f2d3a-037a-06ac-8957-6f1506836abe/886445737837.jpg/600x600bb.jpg",
  ),
  track(
    "1087077327",
    "Waves (feat. Kacey Musgraves) [Remix]",
    "Miguel",
    "Rogue Waves - EP",
    "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/2a/3f/2d/2a3f2d3a-037a-06ac-8957-6f1506836abe/886445737837.jpg/600x600bb.jpg",
  ),
  track(
    "1440887034",
    "Waves",
    "Dean Lewis",
    "Same Kind of Different - EP",
    "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/2b/f7/ae/2bf7ae47-9ee0-0d58-e6ef-cd7b4db004a9/17UMGIM87955.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "1550971621",
    "Waves",
    "Luke Bryan",
    "Born Here Live Here Die Here (Deluxe Edition)",
    "https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/28/3d/dd/283ddd87-9814-a77c-80eb-7545a819e5e4/20UMGIM86979.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "1508562516",
    "Heat Waves",
    "Glass Animals",
    "Dreamland",
    "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/da/8b/77/da8b7731-6f4f-eacf-5e74-8b23389eefa1/20UMGIM03371.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "1686519894",
    "Heat Waves (with iann dior)",
    "Glass Animals & iann dior",
    "Dreamland (Real Life Edition)",
    "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/50/b1/42/50b142aa-5462-d3a8-2d36-e3c0df02ac3c/22UMGIM84423.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "1606901553",
    "Heat Waves (Slowed)",
    "Glass Animals",
    "Heat Waves (Expansion Pack) - Single",
    "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/7e/53/ec/7e53ecbb-faca-a037-eeda-f8067d00bd73/21UMGIM02724.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "1681997981",
    "Heat Waves (Diplo Remix)",
    "Glass Animals",
    "Dreamland (+ Bonus Levels)",
    "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/2c/cd/3e/2ccd3e81-d1d5-e535-06df-b59bfeeaba2e/20UMGIM67087.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "1497226895",
    "Tidal Wave",
    "Tom Misch & Yussef Dayes",
    "What Kinda Music",
    "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/d1/f4/9b/d1f49b90-7f67-faf6-ac75-c522e2ddd3c2/20UMGIM06943.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "1443114987",
    "Tidal Wave (feat. Alpines)",
    "Sub Focus",
    "Torus (Deluxe Version)",
    "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/7c/fd/96/7cfd96ef-e2a3-c02f-cb85-2ba5e4bf28e8/00602537547661.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "1751384130",
    "tidal wave",
    "almost monday",
    "tidal wave - Single",
    "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/70/9f/86/709f867b-1fbc-e23c-1283-f62b34281f70/24UMGIM62605.rgb.jpg/600x600bb.jpg",
  ),
  track(
    "1680065834",
    "Dark Waves (feat. Delhia De France)",
    "Robot Koch",
    "Hypermoment (Bonus Track Version)",
    "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/26/7b/3b/267b3ba6-3faf-b7b5-8910-2732b251f039/cover.jpg/600x600bb.jpg",
  ),
  track(
    "1644220650",
    "Night Waves",
    "The Smashing Pumpkins",
    "ATUM",
    "https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/70/3c/09/703c09bd-b1cc-d7f6-1610-7ce24c02adde/196925534048.jpg/600x600bb.jpg",
  ),
];

const SEED_QUERIES = [
  "Blinding Lights",
  "bad guy",
  "One More Time",
  "Mr. Brightside",
  "Shape of You",
  "Midnight City",
  "Waves",
  "Heat Waves",
];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function wordBoundaryContains(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(haystack);
}

/** Higher score = closer to the typed query (title first, then artist/album). */
function scoreTrack(trackCard: SpotifyTrackCard, query: string): number {
  const q = normalize(query);
  if (!q) return 0;

  const name = normalize(trackCard.name);
  const artists = normalize(trackCard.artists);
  const album = normalize(trackCard.album);
  const nameNoParen = name.replace(/\s*\([^)]*\)/g, "").trim();

  let score = 0;

  if (name === q || nameNoParen === q) score += 1000;
  else if (name.startsWith(q) || nameNoParen.startsWith(q)) score += 850;
  else if (wordBoundaryContains(name, q)) score += 700;
  else if (name.includes(q)) score += 550;

  if (artists === q) score += 220;
  else if (artists.startsWith(q)) score += 160;
  else if (wordBoundaryContains(artists, q)) score += 120;
  else if (artists.includes(q)) score += 80;

  if (album === q) score += 90;
  else if (wordBoundaryContains(album, q) || album.includes(q)) score += 40;

  // Prefer shorter titles when equally matched (closer literal title).
  if (score >= 550) {
    score += Math.max(0, 40 - Math.min(name.length, 40));
  }

  return score;
}

function searchCatalog(query: string): SpotifyTrackCard[] {
  const ranked = DEMO_CATALOG.map((item, index) => ({
    item,
    index,
    score: scoreTrack(item, query),
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);

  if (ranked.length >= RESULT_COUNT) {
    return ranked.slice(0, RESULT_COUNT);
  }

  // Fill to 8 with same-artist neighbors of the best match, then catalog order.
  const fill: SpotifyTrackCard[] = [...ranked];
  const seen = new Set(fill.map((item) => item.id));
  const bestArtist = normalize(ranked[0]?.artists ?? "");

  for (const item of DEMO_CATALOG) {
    if (fill.length >= RESULT_COUNT) break;
    if (seen.has(item.id)) continue;
    if (bestArtist && normalize(item.artists).includes(bestArtist.split(",")[0]!.trim())) {
      fill.push(item);
      seen.add(item.id);
    }
  }

  for (const item of DEMO_CATALOG) {
    if (fill.length >= RESULT_COUNT) break;
    if (seen.has(item.id)) continue;
    fill.push(item);
    seen.add(item.id);
  }

  return fill.slice(0, RESULT_COUNT);
}

export function pickMarketingPlayQuery(): string {
  return SEED_QUERIES[Math.floor(Math.random() * SEED_QUERIES.length)]!;
}

export function marketingPlaySearchResult(query: string): PlaySearchSkillResult {
  const tracks = searchCatalog(query);
  return {
    query,
    tracks,
    summary: `${tracks.length} résultat${tracks.length > 1 ? "s" : ""} trouvé${tracks.length > 1 ? "s" : ""} pour « ${query} ».`,
  };
}
