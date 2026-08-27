import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { RouteStep } from '@amble/shared';
import { Text } from 'react-native';
import { Mono } from './typography';
import { formatMetres } from '../lib/format';
import { colors } from '../theme';

/** A calm, paper-styled turn-by-turn list. */
export function DirectionsList({ steps }: { steps: RouteStep[] }) {
  return (
    <View>
      {steps.map((step, i) => (
        <View
          key={i}
          className={`flex-row items-center gap-3 py-3 ${i === steps.length - 1 ? '' : 'border-b border-ink/[0.08]'}`}
        >
          <Svg width={10} height={10} viewBox="0 0 10 10">
            <Circle cx={5} cy={5} r={3.5} fill="none" stroke={colors.sage} strokeWidth={2} />
          </Svg>
          <Text className="flex-1 font-sans text-[14px] leading-[19px] text-ink">
            {step.instruction}
          </Text>
          {step.distanceM > 0 ? <Mono className="text-ink/40">{formatMetres(step.distanceM)}</Mono> : null}
        </View>
      ))}
    </View>
  );
}
