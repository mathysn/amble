import type { Category, Coord, Place } from '@amble/shared';
import { OSM } from '../config.js';

/**
 * Talks to OpenStreetMap: Overpass for nearby curiosities, Nominatim for
 * geocoding. Both are public, rate-limited services, so every call sends a
 * descriptive User-Agent and results are cached in-process for a short while.
 */

/** Thrown when Nominatim itself rejects us with 429 — a distinct, expected
 *  condition the route layer maps to a friendly response, not a 500. */
export class NominatimBusyError extends Error {
  constructor() {
    super('Search is busy right now — try again in a moment.');
  }
}

// ── tiny TTL cache ─────────────────────────────────────────────────────────
const cache = new Map<string, { expires: number; value: unknown }>();

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value as T);
  return fn().then((value) => {
    cache.set(key, { value, expires: Date.now() + ttlMs });
    return value;
  });
}

// ── category → OSM tag filters ─────────────────────────────────────────────
// Each entry becomes an Overpass tag clause. `v: null` means "tag exists".
type Filter = { k: string; v: string | null };

const CATEGORY_FILTERS: Record<Category, Filter[]> = {
  niche: [
    { k: 'shop', v: 'books' },
    { k: 'shop', v: 'art' },
    { k: 'shop', v: 'music' },
    { k: 'amenity', v: 'arts_centre' },
    { k: 'craft', v: null },
  ],
  hidden: [
    { k: 'historic', v: null },
    { k: 'amenity', v: 'fountain' },
    { k: 'man_made', v: 'water_well' },
    { k: 'tourism', v: 'artwork' },
  ],
  scenic: [
    { k: 'tourism', v: 'viewpoint' },
    { k: 'leisure', v: 'park' },
    { k: 'leisure', v: 'garden' },
    { k: 'natural', v: 'peak' },
  ],
};

// ── public shape ───────────────────────────────────────────────────────────
export type OsmCuriosity = {
  osmId: string;
  name: string;
  category: Category;
  blurb: string;
  lat: number;
  lng: number;
  era: string | null;
  neighbourhood: string | null;
  meta: Record<string, string>;
};

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function buildOverpassQuery(center: Coord, radiusM: number, categories: Category[]): string {
  const clauses: string[] = [];
  for (const category of categories) {
    for (const f of CATEGORY_FILTERS[category]) {
      const sel = f.v === null ? `["${f.k}"]` : `["${f.k}"="${f.v}"]`;
      // `nwr` (node/way/relation combined) halves the clause count vs querying
      // node and way separately — meaningfully cheaper for Overpass to run,
      // which matters since a 3-category search issues a dozen-plus filters.
      clauses.push(`nwr${sel}(around:${radiusM},${center.lat},${center.lng});`);
    }
  }
  return `[out:json][timeout:20];(${clauses.join('')});out center 80;`;
}

/** Which category does this element best belong to? First match wins. */
function classify(tags: Record<string, string>, categories: Category[]): Category | null {
  for (const category of categories) {
    for (const f of CATEGORY_FILTERS[category]) {
      if (f.v === null ? f.k in tags : tags[f.k] === f.v) return category;
    }
  }
  return null;
}

function extractEra(tags: Record<string, string>): string | null {
  const raw = tags.start_date ?? tags['building:year'] ?? tags.year ?? tags.inscription_date;
  const year = raw?.match(/\d{4}/)?.[0];
  return year ?? null;
}

function blurbFor(tags: Record<string, string>, category: Category): string {
  if (tags.description) return tags.description;
  const kind =
    tags.historic ??
    tags.tourism ??
    tags.leisure ??
    tags.shop ??
    tags.craft ??
    tags.amenity ??
    tags.natural ??
    'place';
  const pretty = kind.replace(/_/g, ' ');
  const era = extractEra(tags);
  const templates: Record<Category, string> = {
    niche: `A small ${pretty} worth a look — the kind of place most people walk straight past.`,
    hidden: era
      ? `A ${pretty} from ${era}, tucked away where almost nobody thinks to look.`
      : `A quiet ${pretty}, tucked away where almost nobody thinks to look.`,
    scenic: `A ${pretty} to slow down for — a good spot to just stand and take it in.`,
  };
  return templates[category];
}

/** Fetch nearby curiosities from Overpass, normalised and de-duplicated by name. */
export async function findCuriosities(
  center: Coord,
  radiusM: number,
  categories: Category[],
): Promise<OsmCuriosity[]> {
  if (categories.length === 0) return [];
  const key = `overpass:${center.lat.toFixed(3)},${center.lng.toFixed(3)}:${radiusM}:${categories
    .slice()
    .sort()
    .join(',')}`;

  return cached(key, 10 * 60_000, async () => {
    const query = buildOverpassQuery(center, radiusM, categories);
    // The public Overpass instance is shared and occasionally times out (504)
    // under load — one retry clears most of those without much added latency.
    let res: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      res = await fetch(OSM.overpassUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'User-Agent': OSM.userAgent },
        body: query,
      });
      if (res.ok) break;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 800));
    }
    if (!res!.ok) throw new Error(`Overpass ${res!.status}`);
    const data = (await res!.json()) as { elements: OverpassElement[] };

    const seen = new Set<string>();
    const out: OsmCuriosity[] = [];
    for (const el of data.elements) {
      const tags = el.tags ?? {};
      const name = tags.name;
      if (!name) continue;
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (lat === undefined || lng === undefined) continue;
      const dedup = name.toLowerCase();
      if (seen.has(dedup)) continue;
      const category = classify(tags, categories);
      if (!category) continue;
      seen.add(dedup);
      out.push({
        osmId: `${el.type}/${el.id}`,
        name,
        category,
        blurb: blurbFor(tags, category),
        lat,
        lng,
        era: extractEra(tags),
        neighbourhood: tags['addr:suburb'] ?? tags['addr:neighbourhood'] ?? null,
        meta: tags,
      });
    }
    return out;
  });
}

// ── Nominatim geocoding ────────────────────────────────────────────────────
// Nominatim's usage policy caps public-instance traffic at 1 request/second.
// Every call — geocode and reverse alike — funnels through this queue so we
// never exceed that, regardless of how quickly the client fires requests.
let nominatimQueue: Promise<void> = Promise.resolve();
const NOMINATIM_MIN_INTERVAL_MS = 1100;
let lastNominatimCallAt = 0;

function throttledNominatim<T>(fn: () => Promise<T>): Promise<T> {
  const run = nominatimQueue.then(async () => {
    const wait = Math.max(0, lastNominatimCallAt + NOMINATIM_MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastNominatimCallAt = Date.now();
  });
  nominatimQueue = run.catch(() => {});
  return run.then(fn);
}

type NominatimPlace = {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: Record<string, string>;
};

function labelParts(p: NominatimPlace): { label: string; detail: string } {
  const a = p.address ?? {};
  const line1 =
    p.name ||
    [a.house_number, a.road].filter(Boolean).join(' ') ||
    p.display_name.split(',')[0] ||
    'Location';
  const detail =
    a.suburb ?? a.neighbourhood ?? a.city ?? a.town ?? a.village ?? a.state ?? '';
  return { label: line1, detail };
}

export async function geocode(query: string): Promise<Place[]> {
  const key = `geocode:${query.toLowerCase()}`;
  return cached(key, 60 * 60_000, () =>
    throttledNominatim(async () => {
      const url = new URL(`${OSM.nominatimUrl}/search`);
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('limit', '6');
      const res = await fetch(url, { headers: { 'User-Agent': OSM.userAgent } });
      if (res.status === 429) throw new NominatimBusyError();
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);
      const data = (await res.json()) as NominatimPlace[];
      return data.map((p) => ({
        ...labelParts(p),
        lat: Number(p.lat),
        lng: Number(p.lon),
      }));
    }),
  );
}

export async function reverseGeocode(center: Coord): Promise<Place> {
  const key = `reverse:${center.lat.toFixed(4)},${center.lng.toFixed(4)}`;
  return cached(key, 60 * 60_000, () =>
    throttledNominatim(async () => {
      const url = new URL(`${OSM.nominatimUrl}/reverse`);
      url.searchParams.set('lat', String(center.lat));
      url.searchParams.set('lon', String(center.lng));
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('addressdetails', '1');
      const res = await fetch(url, { headers: { 'User-Agent': OSM.userAgent } });
      if (res.status === 429) throw new NominatimBusyError();
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);
      const p = (await res.json()) as NominatimPlace;
      return { ...labelParts(p), lat: center.lat, lng: center.lng };
    }),
  );
}
