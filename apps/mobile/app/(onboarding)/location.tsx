import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Button } from '../../src/components/Button';
import { PinIcon } from '../../src/components/icons';
import { Serif } from '../../src/components/typography';
import { useStartPoint } from '../../src/store/startPoint';
import { setOnboarded } from '../../src/lib/storage';

/** 02 · Location — ask for permission (or offer manual address). */
export default function LocationPermission() {
  const router = useRouter();
  const locate = useStartPoint((s) => s.locate);

  // Carry on straight away: Set off shows "Finding your location…" while the
  // permission prompt and first fix finish.
  const allow = async () => {
    void locate({ ask: true });
    await setOnboarded();
    router.replace('/(tabs)');
  };

  const manual = async () => {
    await setOnboarded();
    router.replace('/(tabs)');
    router.push('/address');
  };

  return (
    <Screen className="px-7 pb-10">
      <View className="flex-1 justify-center">
        <View className="mb-8 h-[76px] w-[76px] items-center justify-center rounded-[22px] bg-sage/15">
          <PinIcon />
        </View>
        <Serif className="text-[34px] leading-[38px]">Where are you starting?</Serif>
        <Text className="mt-4 font-sans text-[16px] leading-[26px] text-ink/60">
          Amble builds each route out from where you stand right now. We only use your location
          while you're on a walk — never in the background.
        </Text>
      </View>

      <Button label="Allow location" variant="sage" onPress={allow} />
      <Button label="Enter an address instead" variant="secondary" className="mt-3" onPress={manual} />
    </Screen>
  );
}
