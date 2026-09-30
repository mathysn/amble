/**
 * The typed protocol between React Native and the map page inside the WebView.
 *
 * RN → page messages are *state*, not events: each type only ever matters in its
 * latest form (where the walker is now, what the route is now). So the queue
 * keeps the latest message per type and flushes them together, at most once per
 * frame, as a single `injectJavaScript` call — instead of re-sending everything
 * on every React render. It also remembers the latest state so a remounted page
 * (after a WebView crash) can be brought back up to date in one go.
 */

export type LngLat = [number, number];
export type CameraMode = 'follow' | 'overview' | 'free';
export type StopState = 'start' | 'next' | 'unfound' | 'found';

export type MapInMessage =
  | { type: 'insets'; top: number; bottom: number }
  | { type: 'route'; key: string; coords: LngLat[] }
  | { type: 'stops'; items: { lng: number; lat: number; state: StopState }[] }
  /** Where the route is split into walked/remaining; null = nothing walked yet. */
  | { type: 'progress'; at: { seg: number; lng: number; lat: number } | null }
  | { type: 'threeD'; on: boolean }
  | { type: 'camera'; mode: CameraMode }
  | { type: 'puck'; lng: number; lat: number; accuracy: number }
  /** puck = compass heading for the cone (null hides it); camera = map bearing in follow mode. */
  | { type: 'bearing'; puck: number | null; camera: number }
  | { type: 'animating'; on: boolean };

export type MapOutMessage =
  | { type: 'boot' }
  | { type: 'ready' }
  | { type: 'error'; reason: string; message?: string }
  | { type: 'gesture' }
  | { type: 'perf'; fps: number }
  | { type: 'log'; level: 'warn' | 'error'; msg: string };

type InType = MapInMessage['type'];

/** Order the page applies a batch in (route before the things drawn on it). */
export const IN_ORDER: InType[] = [
  'insets',
  'route',
  'stops',
  'progress',
  'threeD',
  'camera',
  'puck',
  'bearing',
  'animating',
];

const OUT_TYPES = new Set<MapOutMessage['type']>(['boot', 'ready', 'error', 'gesture', 'perf', 'log']);

/** Parse a message posted by the page; anything unexpected is dropped. */
export function parseOutMessage(data: string): MapOutMessage | null {
  try {
    const msg = JSON.parse(data) as { type?: unknown };
    if (msg && typeof msg.type === 'string' && OUT_TYPES.has(msg.type as MapOutMessage['type'])) {
      return msg as MapOutMessage;
    }
  } catch {
    // not ours
  }
  return null;
}

/**
 * A cheap content hash (FNV-1a over the rounded coordinates) so a route is only
 * re-sent when it really changed. Endpoints alone won't do: every loop starts
 * and ends at the same place, so a reshuffle would look identical.
 */
export function routeSignature(coords: LngLat[]): string {
  let h = 0x811c9dc5;
  for (const [lng, lat] of coords) {
    for (const v of [Math.round(lng * 1e6), Math.round(lat * 1e6)]) {
      h ^= v & 0xffff;
      h = Math.imul(h, 0x01000193);
      h ^= (v >>> 16) & 0xffff;
      h = Math.imul(h, 0x01000193);
    }
  }
  return `${coords.length}:${(h >>> 0).toString(36)}`;
}

/**
 * JSON for embedding inside a <script> or injected JS: escapes `<` so a string
 * value can never close the script tag. (U+2028/2029 are legal in JS string
 * literals since ES2019, which every engine we target supports.)
 */
export function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export type MapQueue = {
  send: (msg: MapInMessage) => void;
  /** The page finished loading (true) or went away (false). */
  setReady: (ready: boolean) => void;
  /** A fresh page: everything we know must be re-sent once it's ready. */
  resendAll: () => void;
  dispose: () => void;
};

export function createMapQueue(
  inject: (js: string) => void,
  schedule: (fn: () => void) => unknown = (fn) => setTimeout(fn, 16),
  cancel: (handle: unknown) => void = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
): MapQueue {
  const latest = new Map<InType, MapInMessage>();
  const dirty = new Set<InType>();
  let ready = false;
  let scheduled = false;
  let handle: unknown = null;

  const flush = () => {
    scheduled = false;
    handle = null;
    if (!ready || dirty.size === 0) return;
    const batch = IN_ORDER.filter((t) => dirty.has(t)).map((t) => latest.get(t)!);
    dirty.clear();
    inject(`window.__amble && window.__amble.recv(${safeJson(batch)});true;`);
  };

  const flushSoon = () => {
    if (scheduled || !ready) return;
    scheduled = true;
    const h = schedule(flush);
    // A synchronous scheduler has already flushed by now.
    if (scheduled) handle = h;
  };

  return {
    send(msg) {
      latest.set(msg.type, msg);
      dirty.add(msg.type);
      flushSoon();
    },
    setReady(r) {
      ready = r;
      if (r) flushSoon();
    },
    resendAll() {
      for (const t of latest.keys()) dirty.add(t);
      flushSoon();
    },
    dispose() {
      if (scheduled) cancel(handle);
      scheduled = false;
      handle = null;
      ready = false;
    },
  };
}
