import type { CuriosityDetails } from '@amble/shared';
import { OSM } from '../config.js';

/**
 * The fuller story of a curiosity, shown once the walker reaches it: a photo,
 * an encyclopedia summary and a few facts. Built from the place's OpenStreetMap
 * tags (facts, and links to Wikipedia / Wikidata / Wikimedia Commons), then
 * Wikipedia's page summary for the photo and text. Only well-documented places
 * get a photo or summary; everything fails soft to just the facts.
 *
 * `fetchCuriosityDetails` is the one entry point, so another source (street
 * photos, say) can be added here without touching the route or the app.
 */

/** Fetch JSON, or null on any failure. Injected in tests. */
export type FetchJson = (url: string) => Promise<unknown>;

const TIMEOUT_MS = 6_000;
/** Wikipedia's "original" image is used when it isn't enormous; else its thumbnail. */
const MAX_ORIGINAL_WIDTH = 1600;
const COMMONS_WIDTH = 1000;
const MAX_FACT_CHARS = 220;

export const fetchJson: FetchJson = async (url) => {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': OSM.userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
};

// ── facts from OSM tags ──────────────────────────────────────────────────
const pretty = (v: string) => {
  const s = v.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const clip = (v: string) => (v.length > MAX_FACT_CHARS ? `${v.slice(0, MAX_FACT_CHARS - 1)}…` : v);

/** Small labelled facts worth showing, in a sensible order. Missing tags are skipped. */
export function factsFromTags(tags: Record<string, string>): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value && value.trim()) facts.push({ label, value: clip(value.trim()) });
  };

  const built = tags.start_date ?? tags['building:year'];
  add('Built', built ? (built.match(/\d{4}/)?.[0] ?? built) : null);
  add('Architect', tags.architect);
  add('Artist', tags.artist_name ?? tags.artist);
  if (tags.artwork_type) add('Artwork', pretty(tags.artwork_type));
  if (tags.memorial) add('Memorial', pretty(tags.memorial));
  add('Inscription', tags.inscription);
  add('Listed', tags.listed_status ?? (tags.heritage ? 'Protected heritage' : null));
  add('Material', tags.material ? pretty(tags.material) : null);
  const ele = Number(tags.ele);
  add('Elevation', tags.ele && Number.isFinite(ele) ? `${Math.round(ele)} m` : null);
  add('Open', tags.opening_hours);
  add('Run by', tags.operator);
  add('Website', tags.website ?? tags['contact:website']);
  return facts;
}

// ── links out ────────────────────────────────────────────────────────────
/** OSM `wikipedia=lang:Title` (the language prefix is sometimes left out). */
export function parseWikipediaTag(value: string | undefined): { lang: string; title: string } | null {
  if (!value) return null;
  const m = value.match(/^([a-z]{2,3}(?:-[a-z]+)?):(.+)$/i);
  const lang = m ? m[1]!.toLowerCase() : 'en';
  const title = (m ? m[2]! : value).trim();
  return title ? { lang, title } : null;
}

/** A Wikimedia Commons file name (with or without "File:") → a sized image URL. */
export function commonsImageUrl(file: string, width = COMMONS_WIDTH): string {
  const name = file.replace(/^(File|Image):/i, '').trim().replace(/ /g, '_');
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${width}`;
}

const isImageUrl = (v: string | undefined) =>
  !!v && /^https?:\/\//i.test(v) && /\.(jpe?g|png|webp)(\?.*)?$/i.test(v);

// ── the shapes we read from Wikidata / Wikipedia (only the bits we use) ───
type WikidataEntity = {
  claims?: { P18?: { mainsnak?: { datavalue?: { value?: unknown } } }[] };
  sitelinks?: Record<string, { title?: string }>;
};
type WikiSummary = {
  type?: string;
  extract?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string; width?: number };
  content_urls?: { mobile?: { page?: string }; desktop?: { page?: string } };
};

/** Build a curiosity's details from its OSM tags. Never throws. */
export async function fetchCuriosityDetails(
  tags: Record<string, string>,
  get: FetchJson = fetchJson,
): Promise<CuriosityDetails> {
  const facts = factsFromTags(tags);
  let wiki = parseWikipediaTag(tags.wikipedia);
  let wikidataImage: string | null = null;

  const qid = tags.wikidata?.match(/^Q\d+$/)?.[0];
  if (qid) {
    const data = (await get(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`).catch(
      () => null,
    )) as { entities?: Record<string, WikidataEntity> } | null;
    const entity = data?.entities?.[qid];
    const p18 = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (typeof p18 === 'string') wikidataImage = commonsImageUrl(p18);
    const enTitle = entity?.sitelinks?.enwiki?.title;
    if (!wiki && enTitle) wiki = { lang: 'en', title: enTitle };
  }

  let summary: WikiSummary | null = null;
  if (wiki) {
    const title = encodeURIComponent(wiki.title.replace(/ /g, '_'));
    summary = (await get(
      `https://${wiki.lang}.wikipedia.org/api/rest_v1/page/summary/${title}`,
    ).catch(() => null)) as WikiSummary | null;
    if (summary?.type === 'disambiguation') summary = null;
  }

  const original = summary?.originalimage;
  const wikiImage =
    original?.source && (original.width ?? Infinity) <= MAX_ORIGINAL_WIDTH
      ? original.source
      : (summary?.thumbnail?.source ?? null);

  let imageUrl: string | null = wikiImage ?? wikidataImage;
  let imageCredit: string | null = imageUrl ? 'Wikimedia Commons' : null;
  if (!imageUrl && tags.wikimedia_commons?.match(/^File:/i)) {
    imageUrl = commonsImageUrl(tags.wikimedia_commons);
    imageCredit = 'Wikimedia Commons';
  }
  if (!imageUrl && isImageUrl(tags.image)) {
    imageUrl = tags.image!;
    try {
      imageCredit = new URL(imageUrl).hostname.replace(/^www\./, '');
    } catch {
      imageCredit = null;
    }
  }

  return {
    imageUrl,
    imageCredit,
    summary: summary?.extract?.trim() || null,
    sourceUrl: summary?.content_urls?.mobile?.page ?? summary?.content_urls?.desktop?.page ?? null,
    facts,
  };
}
