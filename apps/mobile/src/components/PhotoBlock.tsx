import { View, type ViewStyle } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { colors } from '../theme';
import { Mono } from './typography';

/**
 * Placeholder for a curiosity photo — a hatched sand panel with an optional
 * caption, matching the design's "photo" blocks. (Real imagery would replace it.)
 */
export function PhotoBlock({
  height,
  caption,
  className = '',
  style,
}: {
  height: number;
  caption?: string;
  className?: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ height }, style]} className={`bg-sand-deep ${className}`}>
      <Svg width="100%" height="100%" style={{ position: 'absolute' }}>
        <Defs>
          <Pattern id="photo-hatch" width={17} height={17} patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
            <Line x1={0} y1={0} x2={0} y2={17} stroke={colors.ink} strokeWidth={8} strokeOpacity={0.05} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#photo-hatch)" />
      </Svg>
      {caption ? (
        <Mono className="absolute bottom-2 left-3 text-ink/40">{caption}</Mono>
      ) : null}
    </View>
  );
}
