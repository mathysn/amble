import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { Screen } from '../../src/components/Screen';
import { Button } from '../../src/components/Button';
import { RouteEmblem } from '../../src/components/RouteEmblem';
import { Serif } from '../../src/components/typography';
import { colors } from '../../src/theme';

/** 01 · Welcome — first launch. */
export default function Welcome() {
  const router = useRouter();
  return (
    <Screen className="px-7 pb-10">
      <View className="flex-row items-center gap-2.5 pt-8">
        <Svg width={26} height={26} viewBox="0 0 26 26">
          <Circle cx={13} cy={13} r={11} stroke={colors.sage} strokeWidth={2} fill="none" />
          <Circle cx={13} cy={13} r={3.5} fill={colors.sage} />
        </Svg>
        <Text className="font-sans-medium text-[15px] text-ink">Amble</Text>
      </View>

      <View className="flex-1 justify-center">
        <RouteEmblem style={{ marginBottom: 34 }} />
        <Serif className="text-[42px] leading-[44px]">Walks that go nowhere in particular.</Serif>
        <Text className="mt-4 font-sans text-[16px] leading-[25px] text-ink/60">
          Tell Amble how long you have. It hands you a route with no destination — just quiet
          streets and things worth noticing.
        </Text>
      </View>

      <Button label="Get started" onPress={() => router.push('/(onboarding)/location')} />
      <Pressable onPress={() => router.push('/(onboarding)/location')} className="mt-4">
        <Text className="text-center font-sans text-[14px] text-ink/50">
          I've walked before · <Text className="font-sans-medium text-sage-dark">Sign in</Text>
        </Text>
      </Pressable>
    </Screen>
  );
}
