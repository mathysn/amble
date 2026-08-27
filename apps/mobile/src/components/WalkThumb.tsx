import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { RouteGeometry } from '@amble/shared';
import { projectRoute, smoothPath } from '../lib/mapProjection';
import { colors } from '../theme';

/** A tiny sand thumbnail of a walk's route, for the Wanders list. */
export function WalkThumb({ route, size = 58 }: { route: RouteGeometry; size?: number }) {
  const { project } = projectRoute(route, size, size, 10);
  const d = smoothPath(route.coordinates.map((c) => project({ lng: c[0]!, lat: c[1]! })));
  return (
    <View style={{ width: size, height: size }} className="overflow-hidden rounded-[12px] bg-sand">
      <Svg width={size} height={size}>
        <Path d={d} fill="none" stroke={colors.sage} strokeWidth={2.4} strokeLinecap="round" />
      </Svg>
    </View>
  );
}
