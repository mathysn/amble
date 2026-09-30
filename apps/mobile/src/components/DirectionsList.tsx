import { Text, View } from 'react-native';
import type { RouteStep, Units } from '@amble/shared';
import { ManeuverIcon } from './ManeuverIcon';
import { Mono } from './typography';
import { formatNavDistance } from '../lib/format';
import { maneuverPhrase } from '../lib/nav';
import { colors } from '../theme';

/**
 * A calm, paper-styled turn-by-turn list, in Amble's own wording. On the walk
 * screen it starts at the step being walked (`fromStep`), which is highlighted.
 */
export function DirectionsList({
  steps,
  units = 'km',
  fromStep = 0,
  activeStep,
  roundTrip = true,
}: {
  steps: RouteStep[];
  units?: Units;
  /** False for an A→B walk (the last step is "You've arrived", not "Back where you started"). */
  roundTrip?: boolean;
  fromStep?: number;
  activeStep?: number;
}) {
  const shown = steps.slice(fromStep);
  return (
    <View>
      {shown.map((step, i) => {
        const index = fromStep + i;
        const active = index === activeStep;
        return (
          <View
            key={`${index}:${step.startIndex}`}
            className={`flex-row items-center gap-3 py-3 ${i === shown.length - 1 ? '' : 'border-b border-ink/[0.08]'}`}
          >
            <View
              className={`h-9 w-9 items-center justify-center rounded-full ${active ? 'bg-sage' : 'bg-sage/15'}`}
            >
              <ManeuverIcon type={step.type} size={22} color={active ? colors.paper : colors.sageDark} />
            </View>
            <Text
              className={`flex-1 text-[14px] leading-[19px] text-ink ${active ? 'font-sans-semibold' : 'font-sans'}`}
            >
              {maneuverPhrase(step, { first: index === 0, roundTrip })}
            </Text>
            {step.distanceM > 0 ? (
              <Mono className="text-ink/40">{formatNavDistance(step.distanceM, units)}</Mono>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
