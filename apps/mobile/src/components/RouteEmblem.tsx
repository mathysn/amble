import { View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Line, Path, Pattern, Rect } from 'react-native-svg';
import { colors } from '../theme';

/**
 * A decorative sand panel with a wandering dashed path — used on the welcome
 * screen and empty states, where there's no real route to draw yet.
 */
export function RouteEmblem({ height = 210, style }: { height?: number; style?: ViewStyle }) {
  return (
    <View style={[{ height }, style]} className="overflow-hidden rounded-[24px] bg-sand">
      <Svg width="100%" height="100%" viewBox="0 0 340 210" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <Pattern id="emblem-hatch" width={22} height={22} patternUnits="userSpaceOnUse" patternTransform="rotate(115)">
            <Line x1={0} y1={0} x2={0} y2={22} stroke={colors.sage} strokeWidth={1} strokeOpacity={0.12} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width={340} height={210} fill="url(#emblem-hatch)" />
        <Path
          d="M44 176 C 100 150, 70 90, 150 100 C 236 112, 210 40, 300 54"
          fill="none"
          stroke={colors.sage}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeDasharray="0.5 11"
        />
        <Circle cx={44} cy={176} r={8} fill={colors.ink} />
        <Circle cx={300} cy={54} r={7} fill="none" stroke={colors.sage} strokeWidth={3} />
      </Svg>
    </View>
  );
}
