import { useState } from 'react';
import { View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Line, Path, Pattern, Rect } from 'react-native-svg';
import type { Coord, RouteGeometry } from '@amble/shared';
import { projectRoute, smoothPath } from '../lib/mapProjection';
import { colors } from '../theme';

type Stop = { lat: number; lng: number; found?: boolean };

type Props = {
  route: RouteGeometry;
  start: Coord;
  /** Where an A→B walk finishes; omitted for a loop. */
  end?: Coord | null;
  stops?: Stop[];
  position?: Coord | null;
  /** fill the parent (flex-1) instead of using a fixed height */
  fill?: boolean;
  height?: number;
  className?: string;
  style?: ViewStyle;
};

/**
 * The paper map: a warm sand field with a faint hatch and the wander drawn as a
 * dashed sage line, its start, curiosity stops and (optionally) the walker.
 */
export function StylizedMap({
  route,
  start,
  end = null,
  stops = [],
  position,
  fill = false,
  height = 190,
  className = '',
  style,
}: Props) {
  const [size, setSize] = useState({ w: 0, h: fill ? 0 : height });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    setSize({ w: width, h: fill ? h : height });
  };

  const ready = size.w > 0 && size.h > 0;
  const { project } = ready
    ? projectRoute(route, size.w, size.h, 26)
    : { project: (_: Coord) => ({ x: 0, y: 0 }) };
  const d = ready ? smoothPath(route.coordinates.map((c) => project({ lng: c[0]!, lat: c[1]! }))) : '';
  const startPt = project(start);
  const endPt = end ? project(end) : null;
  const posPt = position ? project(position) : null;

  return (
    <View
      onLayout={onLayout}
      style={style}
      className={`overflow-hidden rounded-panel bg-sand ${fill ? 'flex-1' : ''} ${className}`}
    >
      {ready && (
        <Svg width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
          <Defs>
            <Pattern id="hatch" width={22} height={22} patternUnits="userSpaceOnUse" patternTransform="rotate(25)">
              <Line x1={0} y1={0} x2={0} y2={22} stroke={colors.sage} strokeWidth={1} strokeOpacity={0.12} />
            </Pattern>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill="url(#hatch)" />

          <Path d={d} fill="none" stroke={colors.sage} strokeWidth={3.5} strokeLinecap="round" strokeDasharray="0.5 11" />

          {/* start / home */}
          <Circle cx={startPt.x} cy={startPt.y} r={7} fill={colors.ink} />

          {/* finish, for an A→B walk */}
          {endPt && (
            <Circle
              cx={endPt.x}
              cy={endPt.y}
              r={7}
              fill={colors.sageDark}
              stroke={colors.paperRaised}
              strokeWidth={3}
            />
          )}

          {/* curiosity stops */}
          {stops.map((s, i) => {
            const p = project(s);
            return (
              <Circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={5}
                fill={s.found ? colors.sage : colors.paper}
                stroke={colors.sage}
                strokeWidth={2.5}
              />
            );
          })}

          {/* live position */}
          {posPt && (
            <>
              <Circle cx={posPt.x} cy={posPt.y} r={13} fill={colors.ink} opacity={0.15} />
              <Circle cx={posPt.x} cy={posPt.y} r={7} fill={colors.ink} />
            </>
          )}
        </Svg>
      )}
    </View>
  );
}
