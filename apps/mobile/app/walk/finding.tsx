import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Category } from '@amble/shared';
import { Screen } from '../../src/components/Screen';
import { Button } from '../../src/components/Button';
import { Overline, Serif } from '../../src/components/typography';
import { usePlanWalk } from '../../src/api/hooks';
import { colors } from '../../src/theme';

/** 04 · Finding your route — runs the plan request behind a calm loader. */
export default function Finding() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    lat: string;
    lng: string;
    minutes: string;
    categories: string;
    endLat?: string;
    endLng?: string;
    endLabel?: string;
  }>();
  const plan = usePlanWalk();
  const started = useRef(false);

  const minutes = Number(params.minutes) || 30;
  const radiusKm = Math.max(1, Math.round((minutes * 70) / 2 / 1000));

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    plan.mutate(
      {
        lat: Number(params.lat),
        lng: Number(params.lng),
        minutes,
        categories: (params.categories?.split(',') as Category[]) ?? ['niche', 'hidden'],
        ...(params.endLat && params.endLng
          ? {
              end: {
                lat: Number(params.endLat),
                lng: Number(params.endLng),
                ...(params.endLabel ? { label: params.endLabel } : {}),
              },
            }
          : {}),
      },
      {
        onSuccess: (walk) => router.replace(`/walk/route?id=${walk.id}`),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen className="items-center justify-center px-9">
      {plan.isError ? (
        <View className="items-center">
          <Serif className="text-center text-[26px]">No wander nearby, yet</Serif>
          <Text className="mt-3 text-center font-sans text-[15px] leading-[22px] text-ink/55">
            {plan.error?.message ?? 'We couldn’t find enough curiosities around here right now.'}
          </Text>
          <Button label="Go back" variant="secondary" className="mt-7 self-stretch" onPress={() => router.back()} />
        </View>
      ) : (
        <>
          <View className="mb-10 h-[150px] w-[150px] items-center justify-center">
            <Ring size={150} opacity={0.3} />
            <Ring size={102} opacity={0.4} />
            <Ring size={54} opacity={0.55} />
            <View
              className="h-4 w-4 rounded-full bg-sage"
              style={{ shadowColor: colors.sage, shadowOpacity: 0.4, shadowRadius: 8 }}
            />
          </View>
          <Serif className="text-center text-[30px] leading-[35px]">Finding your wander…</Serif>
          <Overline className="mt-4 text-center">Scouting curiosities within {radiusKm} km</Overline>
        </>
      )}
    </Screen>
  );
}

function Ring({ size, opacity }: { size: number; opacity: number }) {
  return (
    <View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: `rgba(122,139,111,${opacity})`,
      }}
    />
  );
}
