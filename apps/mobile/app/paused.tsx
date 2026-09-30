import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '../src/components/Button';
import { Serif } from '../src/components/typography';
import { useCompleteWalk, usePauseWalk, useResumeWalk, useWalk } from '../src/api/hooks';
import { formatClock } from '../src/lib/format';

/** 16 · Paused — a calm interstitial over the walk. */
export default function Paused() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: walk } = useWalk(id);
  const pause = usePauseWalk();
  const resume = useResumeWalk();
  const complete = useCompleteWalk();
  const paused = useRef(false);

  useEffect(() => {
    if (!paused.current) {
      paused.current = true;
      pause.mutate(id);
    }
  }, [id, pause]);

  const elapsedMs = walk?.startedAt ? Date.now() - new Date(walk.startedAt).getTime() : 0;
  const found = walk?.curiosities.filter((c) => c.found).length ?? 0;
  const left = (walk?.curiosities.length ?? 0) - found;
  const minutesLeft = walk ? Math.max(0, Math.ceil(walk.plannedMinutes - elapsedMs / 60_000)) : 0;

  const onResume = () => resume.mutate(id, { onSuccess: () => router.back() });
  const onEnd = () =>
    complete.mutate(id, {
      onSuccess: () => {
        router.back();
        router.replace(`/walk/complete?id=${id}`);
      },
    });

  return (
    <View className="flex-1 items-center justify-center bg-ink/40 px-6">
      <View
        className="w-full rounded-[26px] bg-paper px-6 py-8"
        style={{ shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 60, shadowOffset: { width: 0, height: 30 } }}
      >
        <View className="mx-auto mb-5 h-14 w-14 items-center justify-center rounded-full bg-sage/15">
          <View className="flex-row gap-1.5">
            <View className="h-5 w-[5px] rounded-[2px] bg-sage" />
            <View className="h-5 w-[5px] rounded-[2px] bg-sage" />
          </View>
        </View>
        <Serif className="text-center text-[28px]">Paused</Serif>
        <Text className="mt-2.5 text-center font-sans text-[14px] text-ink/55">
          {formatClock(elapsedMs)} elapsed · {minutesLeft} min and {left} {left === 1 ? 'curiosity' : 'curiosities'} left
        </Text>
        <Button label="Resume walking" variant="sage" className="mt-6" onPress={onResume} />
        <Button label="End walk here" variant="secondary" className="mt-3" onPress={onEnd} />
      </View>
    </View>
  );
}
