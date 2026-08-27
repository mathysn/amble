import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Button } from '../../src/components/Button';
import { WebMap } from '../../src/components/WebMap';
import { LandmarkRow } from '../../src/components/LandmarkRow';
import { DirectionsList } from '../../src/components/DirectionsList';
import { ChevronRightIcon } from '../../src/components/icons';
import { Overline, Serif } from '../../src/components/typography';
import { useReshuffle, useSettings, useStartWalk, useWalk } from '../../src/api/hooks';
import { useWalkSession } from '../../src/store/walkSession';
import { formatDistance } from '../../src/lib/format';

/** 05 · Your route — the wander preview before setting off. */
export default function RoutePreview() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: walk, refetch } = useWalk(id);
  const { data: settings } = useSettings();
  const reshuffle = useReshuffle();
  const start = useStartWalk();
  const begin = useWalkSession((s) => s.begin);
  const units = settings?.units ?? 'km';
  const [showDirections, setShowDirections] = useState(false);

  if (!walk) {
    return <Screen className="items-center justify-center"><Serif className="text-[20px] text-ink/40">Loading…</Serif></Screen>;
  }

  const startCoord = { lat: walk.startLat, lng: walk.startLng };

  const onStart = () => {
    begin(walk.id, startCoord);
    start.mutate(walk.id, { onSuccess: () => router.replace(`/walk/active?id=${walk.id}`) });
  };

  const onReshuffle = () => reshuffle.mutate(walk.id, { onSuccess: () => refetch() });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 16, flexGrow: 1 }}>
        <Overline tint="sage" className="px-1">Your wander</Overline>
        <Serif className="mb-4 mt-3 px-1 text-[30px]">{walk.plannedMinutes} minutes on foot</Serif>

        <View>
          <WebMap
            route={walk.route}
            start={startCoord}
            stops={walk.curiosities}
            height={190}
          />
          <View className="absolute bottom-3 right-3 rounded-[10px] bg-paper/90 px-3 py-1.5">
            <Text className="font-sans-semibold text-[13px] text-ink">
              ~{formatDistance(walk.distanceKm, units)} · loops home
            </Text>
          </View>
        </View>

        {walk.curiosities.length > 0 ? (
          <>
            <Serif className="mx-1 mb-1 mt-6 text-[19px]">
              {walk.curiosities.length}{' '}
              {walk.curiosities.length === 1 ? 'curiosity' : 'curiosities'} on your path
            </Serif>
            <Text className="px-1 font-sans text-[13px] text-ink/45">
              Revealed one at a time as you get close.
            </Text>
            <View className="mt-4">
              {walk.curiosities.map((c, i) => (
                <LandmarkRow
                  key={c.id}
                  order={c.order}
                  name={c.name}
                  category={c.category}
                  last={i === walk.curiosities.length - 1}
                  onPress={() => router.push(`/curiosity/${c.id}`)}
                />
              ))}
            </View>
          </>
        ) : (
          <>
            <Serif className="mx-1 mb-1 mt-6 text-[19px]">A quiet loop</Serif>
            <Text className="px-1 font-sans text-[13px] text-ink/45">
              No curiosities on this one — just the walk itself. Keep an eye out anyway.
            </Text>
          </>
        )}

        {walk.steps.length > 0 && (
          <View className="mt-5">
            <Pressable
              onPress={() => setShowDirections((v) => !v)}
              className="flex-row items-center py-2"
            >
              <Overline className="flex-1">Directions · {walk.steps.length} steps</Overline>
              <View style={{ transform: [{ rotate: showDirections ? '90deg' : '0deg' }] }}>
                <ChevronRightIcon />
              </View>
            </Pressable>
            {showDirections && <DirectionsList steps={walk.steps} />}
          </View>
        )}

        <View className="flex-1" />
        <View className="mt-6 flex-row gap-3">
          <View className="justify-center">
            <Button
              label={reshuffle.isPending ? '…' : 'Reshuffle'}
              variant="outline"
              onPress={onReshuffle}
              style={{ paddingHorizontal: 22 }}
            />
          </View>
          <Button label="Start walking" className="flex-1" loading={start.isPending} onPress={onStart} />
        </View>
      </ScrollView>
    </Screen>
  );
}
