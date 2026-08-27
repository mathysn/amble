import { useEffect, useMemo, useRef, useState } from 'react';
import { View, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { Coord, RouteGeometry } from '@amble/shared';
import { StylizedMap } from './StylizedMap';
import { buildMapHtml } from '../lib/mapHtml';

type Stop = { lat: number; lng: number; found?: boolean };

type Props = {
  route: RouteGeometry;
  start: Coord;
  stops?: Stop[];
  position?: Coord | null;
  /** fill the parent (flex-1) instead of using a fixed height */
  fill?: boolean;
  height?: number;
  className?: string;
  style?: ViewStyle;
};

const READY_TIMEOUT_MS = 6000;

/**
 * A real, pannable map (MapLibre GL JS + Stadia's Stamen Watercolor basemap)
 * rendered inside a WebView, with the route/stops/walker drawn in the app's
 * palette. Falls back to the abstract `StylizedMap` if the page never loads
 * (no network, WebView error) so the walk screens never show a blank map.
 */
export function WebMap(props: Props) {
  const { route, start, stops = [], position, fill = false, height = 190, className = '', style } = props;
  const webviewRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const html = useMemo(() => buildMapHtml(), []);

  useEffect(() => {
    if (ready || failed) return;
    const t = setTimeout(() => setFailed(true), READY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [ready, failed]);

  useEffect(() => {
    if (!ready) return;
    const payload = JSON.stringify({ route, start, stops, position });
    webviewRef.current?.injectJavaScript(`window.updateData(${payload});true;`);
  }, [ready, route, start, stops, position]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as { type: string };
      if (msg.type === 'ready') setReady(true);
      if (msg.type === 'error') setFailed(true);
    } catch {
      // ignore malformed bridge messages
    }
  };

  if (failed) {
    return (
      <StylizedMap
        route={route}
        start={start}
        stops={stops}
        position={position}
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
      className={`overflow-hidden rounded-panel bg-sand ${fill ? 'flex-1' : ''} ${className}`}
    >
      <WebView
        ref={webviewRef}
        source={{ html }}
        onMessage={onMessage}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
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
