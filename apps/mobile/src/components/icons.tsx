import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../theme';

type IconProps = { size?: number; color?: string };

/** The wandering dashed line — Amble's signature mark, used for the Walk tab. */
export function WalkIcon({ size = 22, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M3 16 C7 12 6 7 11 8 S17 5 18 3"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeDasharray="0.5 4"
      />
    </Svg>
  );
}

export function BookmarkIcon({ size = 22, color = colors.ink, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill={filled ? color : 'none'}>
      <Path
        d="M5 3h10v14l-5-3.5L5 17z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ClockIcon({ size = 22, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={7} stroke={color} strokeWidth={1.6} />
      <Path d="M10 6v4l3 2" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

export function SettingsIcon({ size = 22, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M3 6h14M3 10h14M3 14h14" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <Circle cx={7} cy={6} r={2} fill={colors.paper} stroke={color} strokeWidth={1.6} />
      <Circle cx={13} cy={14} r={2} fill={colors.paper} stroke={color} strokeWidth={1.6} />
    </Svg>
  );
}

export function PinIcon({ size = 34, color = colors.sage }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 34 34" fill="none">
      <Path
        d="M17 30c7-8 10-12 10-17A10 10 0 007 13c0 5 3 9 10 17z"
        stroke={color}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <Circle cx={17} cy={13} r={3.4} fill={color} />
    </Svg>
  );
}

export function PinSmallIcon({ size = 16, color = colors.ink40 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M10 18c4-5 6-7.5 6-10a6 6 0 00-12 0c0 2.5 2 5 6 10z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ChevronLeftIcon({ size = 18, color = colors.ink }: IconProps) {
  return (
    <Svg width={(size * 11) / 18} height={size} viewBox="0 0 11 18" fill="none">
      <Path d="M9 2L2 9l7 7" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function SpeakerIcon({ size = 22, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M3 8h3l4-3.5v11L6 12H3z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M13 7.5a3.5 3.5 0 010 5M15.2 5.3a6.6 6.6 0 010 9.4" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

export function SpeakerOffIcon({ size = 22, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M3 8h3l4-3.5v11L6 12H3z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M13 8l4 4M17 8l-4 4" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

/** A navigation arrowhead — "follow me again". */
export function RecenterIcon({ size = 18, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M10 2.5l5.5 14-5.5-3.2-5.5 3.2z" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
    </Svg>
  );
}

/** The whole route at a glance — a small loop. */
export function OverviewIcon({ size = 22, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M5 15c-2-3 0-9 5-10s8 3 6 7-7 5-9 4"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeDasharray="0.5 3.2"
      />
      <Circle cx={5} cy={15} r={1.8} fill={color} />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 14, color = colors.ink40 }: IconProps) {
  return (
    <Svg width={(size * 8) / 14} height={size} viewBox="0 0 8 14" fill="none">
      <Path d="M1 1l6 6-6 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Two crossing arrows — reshuffle the route. */
export function ShuffleIcon({ size = 18, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M3 6.5h2.5c3.5 0 4.5 7 8 7H17M15 11.5l2 2-2 2"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M3 13.5h2.5c1.4 0 2.4-1.2 3.2-2.7M11.3 9.2c.8-1.5 1.8-2.7 3.2-2.7H17M15 4.5l2 2-2 2"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
