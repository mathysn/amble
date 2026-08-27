import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../src/components/Button';
import { Serif } from '../src/components/typography';
import { useCompleteWalk, useWalk } from '../src/api/hooks';

/** 17 · End walk? — a bottom sheet confirming an early finish. */
export default function EndWalk() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: walk } = useWalk(id);
  const complete = useCompleteWalk();

  const found = walk?.curiosities.filter((c) => c.found).length ?? 0;
  const total = walk?.curiosities.length ?? 0;
  const minutesLeft = walk?.startedAt
    ? Math.max(0, Math.ceil(walk.plannedMinutes - (Date.now() - new Date(walk.startedAt).getTime()) / 60_000))
    : (walk?.plannedMinutes ?? 0);

  const onEnd = () =>
    complete.mutate(id, {
      onSuccess: () => {
        router.back();
        router.replace(`/walk/complete?id=${id}`);
      },
    });

  return (
    <View className="flex-1 justify-end bg-ink/40">
      <Pressable className="flex-1" onPress={() => router.back()} />
      <View
        className="rounded-t-[28px] bg-paper px-6 pt-3.5"
        style={{ shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 60, shadowOffset: { width: 0, height: -20 } }}
      >
        <View className="mx-auto mb-5 h-[5px] w-10 rounded-[3px] bg-ink/[0.18]" />
        <Serif className="text-[27px] leading-[31px]">End this wander?</Serif>
        <Text className="mt-3 font-sans text-[15px] leading-[24px] text-ink/60">
          You're {found} of {total} curiosities in, with {minutesLeft} minutes to go. We'll keep it
          in your Wanders either way.
        </Text>
        <Button label="End & save walk" className="mt-6" loading={complete.isPending} onPress={onEnd} />
        <SafeAreaView edges={['bottom']}>
          <Pressable onPress={() => router.back()} className="items-center py-4">
            <Text className="font-sans-semibold text-[15px] text-sage-dark">Keep walking</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </View>
  );
}
