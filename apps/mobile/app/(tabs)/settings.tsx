import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { Pace, Units } from '@amble/shared';
import { lengthFor, PACE_METRES_PER_MIN, WALK_LENGTHS } from '@amble/shared';
import { Screen } from '../../src/components/Screen';
import { Segmented } from '../../src/components/Segmented';
import { ChevronRightIcon } from '../../src/components/icons';
import { Overline, Serif } from '../../src/components/typography';
import { useSettings, useUpdateSettings } from '../../src/api/hooks';

const LENGTH_OPTIONS = WALK_LENGTHS.map((l) => ({ value: l.id, label: l.label }));
const PACE_OPTIONS: { value: Pace; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'steady', label: 'Steady' },
  { value: 'brisk', label: 'Brisk' },
];
const UNIT_OPTIONS: { value: Units; label: string }[] = [
  { value: 'km', label: 'Kilometres' },
  { value: 'mi', label: 'Miles' },
];

/** Walking speed for a pace, as the walker would say it. */
function paceSpeed(pace: Pace, units: Units): string {
  const kmh = (PACE_METRES_PER_MIN[pace] * 60) / 1000;
  return units === 'km' ? `about ${kmh.toFixed(1)} km/h` : `about ${(kmh * 0.621).toFixed(1)} mph`;
}

/** 12 · Settings — every choice visible and one tap away. */
export default function Settings() {
  const { data: s } = useSettings();
  const update = useUpdateSettings();

  if (!s) {
    return (
      <Screen edges={['top']} className="px-[22px]">
        <Serif className="pt-4 text-[32px]">Settings</Serif>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 16, paddingBottom: 24 }}>
        <Serif className="mb-5 text-[32px]">Settings</Serif>

        <Overline className="mb-2.5 ml-1.5">Your walks</Overline>
        <Group>
          <ChoiceRow label="Usual length" hint="What Set off starts on">
            <Segmented
              options={LENGTH_OPTIONS}
              value={lengthFor(s.defaultLength).id}
              onChange={(id) =>
                update.mutate({ defaultLength: WALK_LENGTHS.find((l) => l.id === id)!.minutes })
              }
            />
          </ChoiceRow>
          <ChoiceRow label="Walking pace" hint={paceSpeed(s.pace, s.units)}>
            <Segmented options={PACE_OPTIONS} value={s.pace} onChange={(pace) => update.mutate({ pace })} />
          </ChoiceRow>
          <ToggleRow
            label="Avoid busy roads"
            value={s.avoidBusyRoads}
            onChange={(v) => update.mutate({ avoidBusyRoads: v })}
            last
          />
        </Group>

        <Overline className="mb-2.5 ml-1.5 mt-6">Surprises to include</Overline>
        <Group>
          <ToggleRow
            label="Niche places"
            value={s.includeNiche}
            onChange={(v) => update.mutate({ includeNiche: v })}
          />
          <ToggleRow
            label="Hidden spots"
            value={s.includeHidden}
            onChange={(v) => update.mutate({ includeHidden: v })}
          />
          <ToggleRow
            label="Scenic views"
            value={s.includeScenic}
            onChange={(v) => update.mutate({ includeScenic: v })}
            last
          />
        </Group>

        <View className="mt-6">
          <Group>
            <ChoiceRow label="Distances in">
              <Segmented options={UNIT_OPTIONS} value={s.units} onChange={(units) => update.mutate({ units })} />
            </ChoiceRow>
            <Pressable className="flex-row items-center px-4 py-[15px]">
              <Text className="flex-1 font-sans text-[15px] text-ink">About Amble</Text>
              <ChevronRightIcon />
            </Pressable>
          </Group>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Group({ children }: { children: ReactNode }) {
  return (
    <View
      className="overflow-hidden rounded-panel bg-paper-raised"
      style={{ borderWidth: 1, borderColor: 'rgba(46,43,38,0.06)' }}
    >
      {children}
    </View>
  );
}

/** A setting with a few named options: its label (and a hint), then the choices below. */
function ChoiceRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View className="border-b border-ink/[0.07] px-4 pb-3.5 pt-[14px]">
      <View className="mb-2.5 flex-row items-baseline justify-between">
        <Text className="font-sans text-[15px] text-ink">{label}</Text>
        {hint ? <Text className="font-sans text-[12px] text-ink/45">{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  last = false,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      className={`flex-row items-center px-4 py-[15px] ${last ? '' : 'border-b border-ink/[0.07]'}`}
    >
      <Text className="flex-1 font-sans text-[15px] text-ink">{label}</Text>
      <View
        className={`h-[26px] w-[44px] justify-center rounded-full px-[3px] ${value ? 'bg-sage' : 'bg-ink/[0.18]'}`}
      >
        <View className={`h-5 w-5 rounded-full bg-white ${value ? 'self-end' : 'self-start'}`} />
      </View>
    </Pressable>
  );
}
