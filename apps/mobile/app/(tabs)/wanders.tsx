import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import type { WalkSummary } from '@amble/shared';
import { Screen } from '../../src/components/Screen';
import { Button } from '../../src/components/Button';
import { WalkThumb } from '../../src/components/WalkThumb';
import { Mono, Overline, Serif } from '../../src/components/typography';
import { useWalks } from '../../src/api/hooks';
import { useSettings } from '../../src/api/hooks';
import { formatDistance } from '../../src/lib/format';
import { colors } from '../../src/theme';

/** 11 · Past wanders (with the 15 · first-run empty state). */
export default function Wanders() {
  const router = useRouter();
  const { data, isLoading } = useWalks();
  const { data: settings } = useSettings();
  const units = settings?.units ?? 'km';

  const walks = data?.walks ?? [];

  if (!isLoading && walks.length === 0) {
    return (
      <Screen edges={['top']} className="px-7">
        <View className="pt-4">
          <Serif className="text-[32px]">Wanders</Serif>
          <Text className="font-sans text-[13px] text-ink/50">No walks yet</Text>
        </View>
        <View className="flex-1 items-center justify-center pb-5">
          <View className="mb-6 h-[120px] w-[120px] items-center justify-center rounded-full border border-dashed border-sage/40">
            <Svg width={120} height={120} viewBox="0 0 120 120" style={{ position: 'absolute' }}>
              <Path
                d="M32 84 C50 62 44 44 66 50 C86 55 80 34 90 40"
                fill="none"
                stroke={colors.sage}
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeDasharray="0.5 8"
              />
              <Circle cx={32} cy={84} r={5} fill={colors.ink} />
            </Svg>
          </View>
          <Serif className="text-center text-[25px]">Your first wander awaits</Serif>
          <Text className="mb-7 mt-3 text-center font-sans text-[15px] leading-[23px] text-ink/55">
            Every walk you finish is kept here — the route, the time, and the curiosities you found
            along the way.
          </Text>
          <Button
            label="Start your first walk"
            className="self-stretch"
            onPress={() => router.push('/(tabs)')}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 16, paddingBottom: 24 }}>
        <Overline tint="sage">Where you've been</Overline>
        <Serif className="mt-3 text-[32px]">Wanders</Serif>
        <Text className="mb-5 font-sans text-[13px] text-ink/50">
          {data ? `${data.totals.walks} walks · ${formatDistance(data.totals.distanceKm, units)} · ${data.totals.curiosities} curiosities` : ''}
        </Text>
        <View className="gap-3">
          {walks.map((w) => (
            <WanderRow key={w.id} walk={w} units={units} onPress={() => router.push(`/walk/complete?id=${w.id}`)} />
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

function WanderRow({
  walk,
  units,
  onPress,
}: {
  walk: WalkSummary;
  units: 'km' | 'mi';
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3.5 rounded-panel bg-paper-raised p-3"
      style={{ borderWidth: 1, borderColor: 'rgba(46,43,38,0.06)' }}
    >
      <WalkThumb route={walk.route} />
      <View className="flex-1">
        <Serif className="text-[18px]">{walk.label}</Serif>
        <Mono className="mt-1 text-ink/45">
          {walk.durationMin} min · {formatDistance(walk.distanceKm, units)} · {walk.found} found
        </Mono>
      </View>
    </Pressable>
  );
}
