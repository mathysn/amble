import type { ReactNode } from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { MANEUVER } from '../lib/nav';
import { colors } from '../theme';

export type ManeuverKind = number | null | 'rejoin' | 'compass';

type Props = {
  /** ORS maneuver type (0–13), or a pointer: 'rejoin' (back to the route) / 'compass'. */
  type: ManeuverKind;
  size?: number;
  color?: string;
  /** Pointer kinds only: degrees clockwise from screen-up. */
  rotate?: number;
};

const S = { strokeWidth: 2.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

/**
 * Turn arrows in the same hand-drawn stroke style as icons.tsx, drawn on a
 * 32-unit grid: the stem enters from the bottom (where you are) and the head
 * shows where you go.
 */
export function ManeuverIcon({ type, size = 40, color = colors.paper, rotate = 0 }: Props) {
  const faint = { ...S, stroke: color, strokeOpacity: 0.35 };
  const line = { ...S, stroke: color };

  let body: ReactNode;
  switch (type) {
    case MANEUVER.left:
      body = (
        <>
          <Path d="M20 28 V17 a5 5 0 0 0 -5 -5 H7" {...line} />
          <Path d="M12 7 L7 12 L12 17" {...line} />
        </>
      );
      break;
    case MANEUVER.right:
      body = (
        <>
          <Path d="M12 28 V17 a5 5 0 0 1 5 -5 H25" {...line} />
          <Path d="M20 7 L25 12 L20 17" {...line} />
        </>
      );
      break;
    case MANEUVER.slightLeft:
      body = (
        <>
          <Path d="M19 28 V19 L10 10" {...line} />
          <Path d="M10 17 V10 H17" {...line} />
        </>
      );
      break;
    case MANEUVER.slightRight:
      body = (
        <>
          <Path d="M13 28 V19 L22 10" {...line} />
          <Path d="M22 17 V10 H15" {...line} />
        </>
      );
      break;
    case MANEUVER.sharpLeft:
      body = (
        <>
          <Path d="M21 28 V9 L9 21" {...line} />
          <Path d="M9 14 V21 H16" {...line} />
        </>
      );
      break;
    case MANEUVER.sharpRight:
      body = (
        <>
          <Path d="M11 28 V9 L23 21" {...line} />
          <Path d="M23 14 V21 H16" {...line} />
        </>
      );
      break;
    case MANEUVER.uTurn:
      body = (
        <>
          <Path d="M21 28 V13 a6 6 0 0 0 -12 0 V21" {...line} />
          <Path d="M4.5 17 L9 21.5 L13.5 17" {...line} />
        </>
      );
      break;
    case MANEUVER.keepLeft:
      body = (
        <>
          <Path d="M18 28 V19 L12 13 V6" {...line} />
          <Path d="M7.5 10.5 L12 6 L16.5 10.5" {...line} />
          <Path d="M18 19 L24 13 V8" {...faint} />
        </>
      );
      break;
    case MANEUVER.keepRight:
      body = (
        <>
          <Path d="M14 28 V19 L20 13 V6" {...line} />
          <Path d="M15.5 10.5 L20 6 L24.5 10.5" {...line} />
          <Path d="M14 19 L8 13 V8" {...faint} />
        </>
      );
      break;
    case MANEUVER.roundaboutEnter:
    case MANEUVER.roundaboutExit:
      body = (
        <>
          <Circle cx={16} cy={14} r={6} {...line} />
          <Path d="M16 28 V20" {...line} />
          <Path d="M20.3 9.7 L25 5" {...line} />
          <Path d="M19 5 H25 V11" {...line} />
        </>
      );
      break;
    case MANEUVER.arrive:
      body = (
        <>
          <Circle cx={16} cy={13} r={7.5} {...line} />
          <Circle cx={16} cy={13} r={2.6} fill={color} />
          <Path d="M16 20.5 V28" {...line} />
        </>
      );
      break;
    case 'compass':
      body = (
        <G rotation={rotate} origin="16, 16">
          <Path d="M16 4 L22.5 25 L16 20.5 L9.5 25 Z" fill={color} stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
        </G>
      );
      break;
    case 'rejoin':
      body = (
        <G rotation={rotate} origin="16, 16">
          <Path d="M16 27 V6" {...line} />
          <Path d="M9.5 12.5 L16 6 L22.5 12.5" {...line} />
        </G>
      );
      break;
    default: // straight, depart, unknown
      body = (
        <>
          <Path d="M16 28 V6" {...line} />
          <Path d="M9.5 12.5 L16 6 L22.5 12.5" {...line} />
        </>
      );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      {body}
    </Svg>
  );
}
