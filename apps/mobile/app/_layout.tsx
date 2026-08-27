import '../global.css';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Spectral_400Regular,
  Spectral_500Medium,
  useFonts,
} from '@expo-google-fonts/spectral';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
} from '@expo-google-fonts/instrument-sans';
import { ensureDevice } from '../src/api/device';
import { setReauthHandler } from '../src/api/client';
import { colors } from '../src/theme';

setReauthHandler(ensureDevice);

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Spectral_400Regular,
    Spectral_500Medium,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
  });
  const [deviceReady, setDeviceReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      for (let attempt = 0; !cancelled; attempt++) {
        try {
          await ensureDevice();
          if (!cancelled) setDeviceReady(true);
          return;
        } catch (e) {
          console.warn('device bootstrap failed, retrying…', e);
          const delay = Math.min(1000 * 2 ** attempt, 8000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = fontsLoaded && deviceReady;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.paper },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(onboarding)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="walk" />
            <Stack.Screen name="curiosity/[id]" />
            <Stack.Screen name="address" options={{ presentation: 'modal' }} />
            <Stack.Screen
              name="discovery"
              options={{ presentation: 'transparentModal', animation: 'fade' }}
            />
            <Stack.Screen
              name="paused"
              options={{ presentation: 'transparentModal', animation: 'fade' }}
            />
            <Stack.Screen
              name="end-walk"
              options={{ presentation: 'transparentModal', animation: 'fade' }}
            />
          </Stack>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
