import { Pressable, ScrollView, Text, View } from 'react-native';
import type { Pace } from '@amble/shared';
import { WALK_LENGTHS } from '@amble/shared';
import { Screen } from '../../src/components/Screen';
import { ChevronRightIcon } from '../../src/components/icons';
import { Overline, Serif } from '../../src/components/typography';
import { useSettings, useUpdateSettings } from '../../src/api/hooks';

const PACES: Pace[] = ['easy', 'steady', 'brisk'];
const paceLabel: Record<Pace, string> = { easy: 'Easy', steady: 'Steady', brisk: 'Brisk' };

/** 12 · Settings. */
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

  const cycleLength = () => {
    const i = WALK_LENGTHS.indexOf(s.defaultLength as (typeof WALK_LENGTHS)[number]);
    update.mutate({ defaultLength: WALK_LENGTHS[(i + 1) % WALK_LENGTHS.length] });
  };
  const cyclePace = () => update.mutate({ pace: PACES[(PACES.indexOf(s.pace) + 1) % PACES.length] });
  const toggleUnits = () => update.mutate({ units: s.units === 'km' ? 'mi' : 'km' });

  return (
    <Screen edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 16, paddingBottom: 24 }}>
        <Serif className="mb-5 text-[32px]">Settings</Serif>

        <Overline className="mb-2.5 ml-1.5">Your walks</Overline>
        <Group>
          <ValueRow label="Default length" value={`${s.defaultLength} min`} onPress={cycleLength} />
          <ValueRow label="Walking pace" value={paceLabel[s.pace]} onPress={cyclePace} />
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
            <ValueRow label="Units" value={s.units === 'km' ? 'Kilometres' : 'Miles'} onPress={toggleUnits} />
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

function Group({ children }: { children: React.ReactNode }) {
  return (
    <View
      className="overflow-hidden rounded-panel bg-paper-raised"
      style={{ borderWidth: 1, borderColor: 'rgba(46,43,38,0.06)' }}
    >
      {children}
    </View>
  );
}

function ValueRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center border-b border-ink/[0.07] px-4 py-[15px]"
    >
      <Text className="flex-1 font-sans text-[15px] text-ink">{label}</Text>
      <Text className="font-sans-medium text-[14px] text-ink/50">{value}</Text>
    </Pressable>
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
    <View className={`flex-row items-center px-4 py-[15px] ${last ? '' : 'border-b border-ink/[0.07]'}`}>
      <Text className="flex-1 font-sans text-[15px] text-ink">{label}</Text>
      <Toggle value={value} onChange={() => onChange(!value)} />
    </View>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <Pressable
      onPress={onChange}
      className={`h-[26px] w-[44px] justify-center rounded-full px-[3px] ${value ? 'bg-sage' : 'bg-ink/[0.18]'}`}
    >
      <View className={`h-5 w-5 rounded-full bg-white ${value ? 'self-end' : 'self-start'}`} />
    </Pressable>
  );
}
