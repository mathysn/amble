import { describe, expect, it, vi } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { buildAmbleStyle, MAP_LAYERS, MAP_SOURCES } from './style';
import { buildMapHtml, PAGE_SCRIPT } from './html';
import { createMapQueue, parseOutMessage, routeSignature, safeJson, type LngLat } from './bridge';

describe('buildAmbleStyle', () => {
  const style = buildAmbleStyle();

  it('is a valid MapLibre style', () => {
    expect(validateStyleMin(style)).toEqual([]);
  });

  it('only uses fonts OpenFreeMap serves, one per stack', () => {
    const served = new Set(['Noto Sans Regular', 'Noto Sans Bold', 'Noto Sans Italic']);
    for (const layer of style.layers) {
      const font = (layer.layout as { 'text-font'?: unknown } | undefined)?.['text-font'];
      if (font === undefined) continue;
      expect(Array.isArray(font) && font.length === 1 && served.has(font[0] as string)).toBe(true);
    }
  });

  it('has the layers and sources the page runtime drives', () => {
    const ids = style.layers.map((l) => l.id);
    expect(ids).toContain(MAP_LAYERS.buildingFlat);
    expect(ids).toContain(MAP_LAYERS.building3d);
    for (const s of Object.values(MAP_SOURCES)) expect(style.sources[s]).toBeDefined();
    // Route and stops draw above the 3D buildings.
    expect(ids.indexOf('route-remaining')).toBeGreaterThan(ids.indexOf(MAP_LAYERS.building3d));
    expect(ids.indexOf('stops')).toBeGreaterThan(ids.indexOf('route-remaining'));
  });
});

describe('map page', () => {
  it('runtime script is syntactically valid', () => {
    expect(() => new Function(PAGE_SCRIPT.replace('__AMBLE_CONFIG__', '{}'))).not.toThrow();
  });

  it('embeds the config and pins maplibre', () => {
    const html = buildMapHtml({ style: buildAmbleStyle(), center: [-0.12, 51.51], zoom: 15, mode: 'nav' });
    expect(html).toContain('maplibre-gl@5.24.0/dist/maplibre-gl.js');
    expect(html).not.toContain('__AMBLE_CONFIG__');
    const inline = html.split('<script>')[1]!.split('</script>')[0]!;
    expect(() => new Function(inline)).not.toThrow();
  });
});

describe('bridge', () => {
  it('keeps only the latest message per type and flushes in page order', () => {
    const injected: string[] = [];
    let run: (() => void) | null = null;
    const q = createMapQueue(
      (js) => injected.push(js),
      (fn) => (run = fn),
      () => {},
    );
    q.send({ type: 'puck', lng: 1, lat: 1, accuracy: 5 });
    q.send({ type: 'puck', lng: 2, lat: 2, accuracy: 5 });
    q.send({ type: 'route', key: 'a', coords: [[0, 0], [1, 1]] });
    expect(run).toBeNull(); // nothing before ready
    q.setReady(true);
    run!();
    expect(injected).toHaveLength(1);
    const batch = JSON.parse(injected[0]!.match(/recv\((.*)\);true;$/)![1]!);
    expect(batch.map((m: { type: string }) => m.type)).toEqual(['route', 'puck']);
    expect(batch[1].lng).toBe(2);
  });

  it('re-sends everything after a page remount', () => {
    const injected: string[] = [];
    const q = createMapQueue((js) => injected.push(js), (fn) => fn(), () => {});
    q.setReady(true);
    q.send({ type: 'threeD', on: true });
    q.setReady(false);
    q.resendAll();
    q.setReady(true);
    expect(injected).toHaveLength(2);
    expect(injected[1]).toContain('"threeD"');
  });

  it('flushes at most once per scheduled tick', () => {
    const inject = vi.fn();
    const pending: (() => void)[] = [];
    const q = createMapQueue(inject, (fn) => pending.push(fn), () => {});
    q.setReady(true);
    q.send({ type: 'animating', on: true });
    q.send({ type: 'animating', on: false });
    expect(pending).toHaveLength(1);
  });

  it('parses only known page messages', () => {
    expect(parseOutMessage('{"type":"ready"}')).toEqual({ type: 'ready' });
    expect(parseOutMessage('{"type":"nope"}')).toBeNull();
    expect(parseOutMessage('not json')).toBeNull();
  });

  it('escapes script-breaking characters', () => {
    expect(safeJson({ a: '</script>' })).not.toContain('</script>');
  });

  it('signs routes by content, not just endpoints', () => {
    const a: LngLat[] = [[0, 0], [1, 1], [0, 0]];
    const b: LngLat[] = [[0, 0], [1, 2], [0, 0]];
    expect(routeSignature(a)).not.toBe(routeSignature(b));
    expect(routeSignature(a)).toBe(routeSignature([...a]));
  });
});
