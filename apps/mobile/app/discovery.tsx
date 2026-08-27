import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Category, WalkCuriosity } from '@amble/shared';
import { FloatingCard } from '../src/components/Card';
import { PhotoBlock } from '../src/components/PhotoBlock';
import { Mono, Overline, Serif } from '../src/components/typography';
import { useMarkFound, useWalk } from '../src/api/hooks';
import { formatMetres } from '../src/lib/format';

const HEADLINE: Record<Category, (name: string) => string> = {
  hidden: () => 'Look up — a hidden corner just around the way.',
  niche: () => 'Just ahead — a little place most people walk past.',
  scenic: () => 'Slow down — something worth seeing is close.',
};

/** 07 · Discovery moment — a curiosity revealed as you approach. */
export default function Discovery() {
  const router = useRouter();
  const { id, cid } = useLocalSearchParams<{ id: string; cid: string }>();
  const { data: walk } = useWalk(id);
  const markFound = useMarkFound();

  const curiosity = walk?.curiosities.find((c) => c.id === cid) as WalkCuriosity | undefined;
  if (!curiosity) {
    return <View className="flex-1 bg-sage" />;
  }

  const acknowledge = (then?: () => void) => {
    markFound.mutate({ walkId: id, curiosityId: cid });
    router.back();
    then?.();
  };

  return (
    <View className="flex-1 bg-sage">
      <SafeAreaView className="flex-1 px-6" edges={['top', 'bottom']}>
        <View className="flex-1 justify-center">
          <Overline tint="light">A curiosity ahead</Overline>
          <Serif className="mt-4 text-[33px] leading-[38px] text-paper-raised">
            {HEADLINE[curiosity.category](curiosity.name)}
          </Serif>

          <FloatingCard className="mt-6" style={{ shadowOpacity: 0.2, shadowRadius: 40 }}>
            <PhotoBlock height={132} caption={`photo · ${curiosity.name.toLowerCase()}`} />
            <View className="px-4 pb-[18px] pt-4">
              <View className="flex-row items-baseline justify-between">
                <Serif className="text-[21px]">{curiosity.name}</Serif>
                <Mono className="text-sage-dark">{formatMetres(curiosity.distanceM)} away</Mono>
              </View>
              <Text className="mt-1.5 font-sans text-[14px] leading-[21px] text-ink/60">
                {curiosity.blurb}
              </Text>
            </View>
          </FloatingCard>
        </View>

        <View className="flex-row gap-3">
          <Pressable
            onPress={() => acknowledge()}
            className="flex-1 items-center rounded-panel border border-paper/40 py-4"
          >
            <Text className="font-sans-medium text-[15px] text-paper-raised">Not now</Text>
          </Pressable>
          <Pressable
            onPress={() => acknowledge(() => router.push(`/curiosity/${cid}`))}
            className="flex-[1.4] items-center rounded-panel bg-paper py-4"
          >
            <Text className="font-sans-semibold text-[15px] text-ink">Take me there</Text>
          </Pressable>
        </View>
        <Text className="mt-3.5 text-center font-sans text-[13px] text-paper/60">or keep wandering →</Text>
      </SafeAreaView>
    </View>
  );
}
