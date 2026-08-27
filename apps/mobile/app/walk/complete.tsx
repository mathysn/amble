import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Button } from '../../src/components/Button';
import { StylizedMap } from '../../src/components/StylizedMap';
import { BookmarkIcon } from '../../src/components/icons';
import { Mono, Overline, Serif } from '../../src/components/typography';
import { useSettings, useWalk } from '../../src/api/hooks';
import { useWalkSession } from '../../src/store/walkSession';
import { formatDistance } from '../../src/lib/format';

/** 09 · Walk complete — the summary of a finished wander. */
export default function Complete() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: walk } = useWalk(id);
  const { data: settings } = useSettings();
  const clear = useWalkSession((s) => s.clear);
  const units = settings?.units ?? 'km';

  if (!walk) {
    return <Screen className="items-center justify-center"><Serif className="text-[20px] text-ink/40">Loading…</Serif></Screen>;
  }

  const found = walk.curiosities.filter((c) => c.found).length;
  const durationMin =
    walk.startedAt && walk.completedAt
      ? Math.max(1, Math.round((new Date(walk.completedAt).getTime() - new Date(walk.startedAt).getTime()) / 60_000))
      : walk.plannedMinutes;
  const steps = (walk.distanceKm * 1350).toFixed(0);

  const done = () => {
    clear();
    router.replace('/(tabs)');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: 16 }}>
        <Overline tint="sage">Home again</Overline>
        <Serif className="mb-5 mt-3.5 text-[32px] leading-[36px]">
          A lovely {durationMin}-minute wander.
        </Serif>

        <View className="mb-4 flex-row gap-2.5">
          <StatTile value={formatDistance(walk.distanceKm, units).split(' ')[0]!} unit={units} label="walked" />
          <StatTile value={String(found)} unit={`/ ${walk.curiosities.length}`} label="found" />
          <StatTile value={(Number(steps) / 1000).toFixed(1)} unit="k" label="steps" />
        </View>

        <View className="my-5">
          <StylizedMap route={walk.route} start={{ lat: walk.startLat, lng: walk.startLng }} stops={walk.curiosities} height={120} />
        </View>

        <Overline className="mb-3 ml-0.5">What you found</Overline>
        <View>
          {walk.curiosities.map((c, i) => (
            <View
              key={c.id}
              className={`flex-row items-center gap-3 py-2.5 ${i === walk.curiosities.length - 1 ? '' : 'border-b border-ink/[0.09]'}`}
            >
              <View className="h-[34px] w-[34px] rounded-[9px] bg-sand-deep" />
              <Text className="flex-1 font-sans-medium text-[14px] text-ink">{c.name}</Text>
              <BookmarkIcon size={18} filled={c.found} color={c.found ? '#7A8B6F' : 'rgba(46,43,38,0.3)'} />
            </View>
          ))}
        </View>

        <View className="mt-6 flex-row gap-3">
          <Button label="Done" variant="outline" className="flex-1" onPress={done} />
          <Button label="See all wanders" className="flex-[1.3]" onPress={() => { clear(); router.replace('/(tabs)/wanders'); }} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function StatTile({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <View
      className="flex-1 rounded-panel bg-paper-raised px-3.5 py-4"
      style={{ borderWidth: 1, borderColor: 'rgba(46,43,38,0.06)' }}
    >
      <Text className="font-spectral text-[26px] text-ink-strong">
        {value}
        <Text className="text-[13px] text-ink/45"> {unit}</Text>
      </Text>
      <Mono className="mt-0.5 text-ink/45">{label}</Mono>
    </View>
  );
}
