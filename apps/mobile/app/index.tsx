import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { getOnboarded } from '../src/lib/storage';

/** Entry gate: send returning walkers to the tabs, newcomers to onboarding. */
export default function Index() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    getOnboarded().then(setOnboarded);
  }, []);

  if (onboarded === null) return <View className="flex-1 bg-paper" />;
  return <Redirect href={onboarded ? '/(tabs)' : '/(onboarding)/welcome'} />;
}
