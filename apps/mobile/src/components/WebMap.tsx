import { useEffect, useMemo, useRef, useState } from 'react';
import { View, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { Coord, RouteGeometry } from '@amble/shared';
import { StylizedMap } from './StylizedMap';
import { buildAmbleStyle } from '../lib/map/style';
import { buildMapHtml, type MapPageMode } from '../lib/map/html';
import {
  createMapQueue,
  parseOutMessage,
  routeSignature,
  type CameraMode,
  type LngLat,
  type MapQueue,
  type StopState,
} from '../lib/map/bridge';

export type WebMapStop = { lat: number; lng: number; found?: boolean; next?: boolean };
export type WebMapPuck = { lat: number; lng: number; accuracy: number };

type Props = {
  route: RouteGeometry;
  /** Changes whenever the route itself changes (e.g. after a reroute). */
  routeKey?: string;
  start: Coord;
  /** Where an A→B walk finishes (null/omitted: it loops back to `start`). */
  end?: Coord | null;
  stops?: WebMapStop[];
  /** 'preview': static north-up overview. 'nav': rotatable, pitchable, follow camera. */
  mode?: MapPageMode;
  /** Simple position dot (no accuracy) — used when `puck` isn't given. */
  position?: Coord | null;
  puck?: WebMapPuck | null;
  /** puck = compass heading for the cone (null hides it); camera = follow-mode bearing. */
  bearing?: { puck: number | null; camera: number } | null;
  /** Where the route splits into walked / remaining. */
  progress?: { seg: number; lat: number; lng: number } | null;
  camera?: CameraMode;
  threeD?: boolean;
  /** Screen space covered by overlays (banner / sheet), so the camera avoids it. */
  insets?: { top: number; bottom: number };
  /** Pause the page's animation loop (e.g. while another screen covers the map). */
  animating?: boolean;
  onGesture?: () => void;
  onPerfLow?: (fps: number) => void;
  /** fill the parent (flex-1) instead of using a fixed height */
  fill?: boolean;
  /** Rounded panel corners (default); false for a full-bleed map. */
  rounded?: boolean;
  height?: number;
  className?: string;
  style?: ViewStyle;
};

/** The page must boot (script loaded, map constructed) within this long… */
const BOOT_TIMEOUT_MS = 10_000;
/** …and finish loading the style/tiles within this long after booting. */
const LOAD_TIMEOUT_MS = 20_000;
/** WebView renderer crashes we recover from by remounting before giving up. */
const MAX_REMOUNTS = 2;

/**
 * A real map (MapLibre GL JS + Amble's OpenFreeMap style) inside a WebView.
 * React Native state is pushed in through a coalescing message queue (see
 * lib/map/bridge.ts). Falls back to the abstract `StylizedMap` when the page
 * can't load (offline, CDN/WebGL failure, timeouts) or keeps crashing, so the
 * walk screens never show a blank map.
 */
export function WebMap(props: Props) {
  const {
    route,
    routeKey,
    start,
    end = null,
    stops = [],
    mode = 'preview',
    position,
    puck,
    bearing,
    progress,
    camera,
    threeD,
    insets,
    animating = true,
    onGesture,
    onPerfLow,
    fill = false,
    rounded = true,
    height = 190,
    className = '',
    style,
  } = props;

  const webviewRef = useRef<WebView>(null);
  const [failed, setFailed] = useState(false);
  const [pageKey, setPageKey] = useState(0);
  const [phase, setPhase] = useState<'booting' | 'loading' | 'ready'>('booting');

  const queueRef = useRef<MapQueue | null>(null);
  if (!queueRef.current) {
    queueRef.current = createMapQueue((js) => webviewRef.current?.injectJavaScript(js));
  }
  const queue = queueRef.current;
  useEffect(() => () => queue.dispose(), [queue]);

  // Latest callbacks without re-subscribing anything.
  const handlers = useRef({ onGesture, onPerfLow });
  handlers.current = { onGesture, onPerfLow };

  // Built once per mode: the page gets the starting camera baked in.
  const initialStart = useRef(start).current;
  const source = useMemo(
    () => ({
      html: buildMapHtml({
        style: buildAmbleStyle(),
        center: [initialStart.lng, initialStart.lat],
        zoom: mode === 'nav' ? 16 : 14,
        mode,
      }),
    }),
    [mode, initialStart],
  );

  // ── fallback timers (restart for every fresh page) ─────────────────────
  useEffect(() => {
    if (failed || phase === 'ready') return;
    const t = setTimeout(
      () => setFailed(true),
      phase === 'booting' ? BOOT_TIMEOUT_MS : LOAD_TIMEOUT_MS,
    );
    return () => clearTimeout(t);
  }, [failed, phase, pageKey]);

  // Mirrors `phase === 'ready'` for callbacks that must not wait for a render.
  const readyRef = useRef(false);

  const remount = () => {
    readyRef.current = false;
    queue.setReady(false);
    setPhase('booting');
    if (pageKey >= MAX_REMOUNTS) setFailed(true);
    else setPageKey((k) => k + 1);
  };

  const onMessage = (e: WebViewMessageEvent) => {
    const msg = parseOutMessage(e.nativeEvent.data);
    if (!msg) return;
    switch (msg.type) {
      case 'boot':
        setPhase('loading');
        break;
      case 'ready':
        if (readyRef.current) break;
        readyRef.current = true;
        setPhase('ready');
        queue.resendAll();
        queue.setReady(true);
        break;
      case 'error':
        if (!readyRef.current) setFailed(true);
        break;
      case 'gesture':
        handlers.current.onGesture?.();
        break;
      case 'perf':
        handlers.current.onPerfLow?.(msg.fps);
        break;
      case 'log':
        if (__DEV__) console.warn(`[map] ${msg.msg}`);
        break;
    }
  };

  // ── state → page ───────────────────────────────────────────────────────
  const coords = route.coordinates as LngLat[];
  const autoKey = useMemo(() => routeSignature(coords), [coords]);
  const key = routeKey ?? autoKey;
  useEffect(() => {
    queue.send({ type: 'route', key, coords });
    // coords identity changes with `key`; keying on it avoids re-sending ~40 KB per render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, key]);

  const stopItems = useMemo(
    () => [
      { lng: start.lng, lat: start.lat, state: 'start' as StopState },
      ...(end ? [{ lng: end.lng, lat: end.lat, state: 'end' as StopState }] : []),
      ...stops.map((s) => ({
        lng: s.lng,
        lat: s.lat,
        state: (s.found ? 'found' : s.next ? 'next' : 'unfound') as StopState,
      })),
    ],
    [start.lng, start.lat, end?.lng, end?.lat, stops],
  );
  // Callers often rebuild the stops array every render; only send real changes.
  const stopsSig = JSON.stringify(stopItems);
  useEffect(() => {
    queue.send({ type: 'stops', items: stopItems });
  }, [queue, stopsSig]); // eslint-disable-line react-hooks/exhaustive-deps

  const dot = puck ?? (position ? { ...position, accuracy: 0 } : null);
  useEffect(() => {
    if (dot) queue.send({ type: 'puck', lng: dot.lng, lat: dot.lat, accuracy: dot.accuracy });
  }, [queue, dot?.lat, dot?.lng, dot?.accuracy]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (bearing) queue.send({ type: 'bearing', puck: bearing.puck, camera: bearing.camera });
  }, [queue, bearing?.puck, bearing?.camera]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (progress === undefined) return;
    queue.send({
      type: 'progress',
      at: progress ? { seg: progress.seg, lng: progress.lng, lat: progress.lat } : null,
    });
  }, [queue, progress?.seg, progress?.lat, progress?.lng, progress === null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (camera) queue.send({ type: 'camera', mode: camera });
  }, [queue, camera]);

  useEffect(() => {
    if (threeD !== undefined) queue.send({ type: 'threeD', on: threeD });
  }, [queue, threeD]);

  useEffect(() => {
    if (insets) queue.send({ type: 'insets', top: insets.top, bottom: insets.bottom });
  }, [queue, insets?.top, insets?.bottom]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    queue.send({ type: 'animating', on: animating });
  }, [queue, animating]);

  if (failed) {
    return (
      <StylizedMap
        route={route}
        start={start}
        end={end}
        stops={stops}
        position={dot}
        fill={fill}
        height={height}
        className={className}
        style={style}
      />
    );
  }

  return (
    <View
      style={style}
      className={`overflow-hidden bg-sand ${rounded ? 'rounded-panel' : ''} ${fill ? 'flex-1' : ''} ${className}`}
    >
      <WebView
        key={pageKey}
        ref={webviewRef}
        source={source}
        onMessage={onMessage}
        onError={() => !readyRef.current && setFailed(true)}
        onHttpError={() => !readyRef.current && setFailed(true)}
        onContentProcessDidTerminate={remount}
        onRenderProcessGone={remount}
        style={fill ? { flex: 1 } : { height }}
        originWhitelist={['*']}
        javaScriptEnabled
        // scrollEnabled must stay true — on iOS it shares the same underlying
        // scroll view as the pinch-zoom gesture recognizer, so disabling it
        // silently kills MapLibre's zoom along with it. bounces=false removes
        // the rubber-band overscroll without touching zoom.
        bounces={false}
        overScrollMode="never"
      />
    </View>
  );
}
