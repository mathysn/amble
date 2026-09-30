import { describe, expect, it } from 'vitest';
import {
  commonsImageUrl,
  factsFromTags,
  fetchCuriosityDetails,
  parseWikipediaTag,
  type FetchJson,
} from './curiosityDetails.js';

describe('factsFromTags', () => {
  it('picks the tags worth showing, formatted and in order', () => {
    const facts = factsFromTags({
      start_date: 'c. 1890',
      artist_name: 'Banksy',
      artwork_type: 'mural',
      opening_hours: 'Mo-Su 09:00-17:00',
      ele: '134.6',
      name: 'Ignored',
    });
    expect(facts).toEqual([
      { label: 'Built', value: '1890' },
      { label: 'Artist', value: 'Banksy' },
      { label: 'Artwork', value: 'Mural' },
      { label: 'Elevation', value: '135 m' },
      { label: 'Open', value: 'Mo-Su 09:00-17:00' },
    ]);
  });

  it('shortens long inscriptions', () => {
    const [fact] = factsFromTags({ inscription: 'x'.repeat(400) });
    expect(fact!.value.length).toBeLessThanOrEqual(220);
    expect(fact!.value.endsWith('…')).toBe(true);
  });
});

describe('links', () => {
  it('reads wikipedia tags with or without a language', () => {
    expect(parseWikipediaTag('fr:Tour Eiffel')).toEqual({ lang: 'fr', title: 'Tour Eiffel' });
    expect(parseWikipediaTag('Covent Garden')).toEqual({ lang: 'en', title: 'Covent Garden' });
    expect(parseWikipediaTag(undefined)).toBeNull();
  });

  it('turns a Commons file into a sized image URL', () => {
    expect(commonsImageUrl('File:Seven Dials.jpg')).toBe(
      'https://commons.wikimedia.org/wiki/Special:FilePath/Seven_Dials.jpg?width=1000',
    );
  });
});

describe('fetchCuriosityDetails', () => {
  const pages: Record<string, unknown> = {
    'https://www.wikidata.org/wiki/Special:EntityData/Q42.json': {
      entities: {
        Q42: {
          claims: { P18: [{ mainsnak: { datavalue: { value: 'Dial.jpg' } } }] },
          sitelinks: { enwiki: { title: 'Seven Dials' } },
        },
      },
    },
    'https://en.wikipedia.org/api/rest_v1/page/summary/Seven_Dials': {
      type: 'standard',
      extract: 'A road junction in Covent Garden.',
      thumbnail: { source: 'https://upload.wikimedia.org/thumb.jpg' },
      originalimage: { source: 'https://upload.wikimedia.org/original.jpg', width: 1200 },
      content_urls: { mobile: { page: 'https://en.m.wikipedia.org/wiki/Seven_Dials' } },
    },
  };
  const fake: FetchJson = async (url) => pages[url] ?? null;

  it('follows Wikidata to the Wikipedia summary and its photo', async () => {
    const d = await fetchCuriosityDetails({ wikidata: 'Q42', start_date: '1694' }, fake);
    expect(d.summary).toBe('A road junction in Covent Garden.');
    expect(d.imageUrl).toBe('https://upload.wikimedia.org/original.jpg');
    expect(d.imageCredit).toBe('Wikimedia Commons');
    expect(d.sourceUrl).toBe('https://en.m.wikipedia.org/wiki/Seven_Dials');
    expect(d.facts).toEqual([{ label: 'Built', value: '1694' }]);
  });

  it('falls back to the Wikidata photo, then OSM image tags', async () => {
    const onlyWikidata: FetchJson = async (url) => (url.includes('wikidata') ? pages[url] : null);
    expect((await fetchCuriosityDetails({ wikidata: 'Q42' }, onlyWikidata)).imageUrl).toBe(
      commonsImageUrl('Dial.jpg'),
    );
    const d = await fetchCuriosityDetails({ image: 'https://example.org/photos/well.jpg' }, fake);
    expect(d.imageUrl).toBe('https://example.org/photos/well.jpg');
    expect(d.imageCredit).toBe('example.org');
  });

  it('still returns the facts when every lookup fails', async () => {
    const failing: FetchJson = async () => {
      throw new Error('offline');
    };
    const d = await fetchCuriosityDetails({ wikipedia: 'en:Anything', architect: 'Wren' }, failing);
    expect(d).toEqual({
      imageUrl: null,
      imageCredit: null,
      summary: null,
      sourceUrl: null,
      facts: [{ label: 'Architect', value: 'Wren' }],
    });
  });
});
