import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'amble.deviceToken';
const ONBOARDED_KEY = 'amble.onboarded';
const NAV_MUTED_KEY = 'amble.navMuted';
const NAV_3D_KEY = 'amble.nav3d';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getOnboarded(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ONBOARDED_KEY)) === '1';
}

export async function setOnboarded(): Promise<void> {
  await SecureStore.setItemAsync(ONBOARDED_KEY, '1');
}

export type NavPrefs = { muted: boolean; threeD: boolean };

/** Navigation preferences; defaults: voice on, 3D on. */
export async function getNavPrefs(): Promise<NavPrefs> {
  const [muted, threeD] = await Promise.all([
    SecureStore.getItemAsync(NAV_MUTED_KEY),
    SecureStore.getItemAsync(NAV_3D_KEY),
  ]);
  return { muted: muted === '1', threeD: threeD !== '0' };
}

export async function setNavPrefs(prefs: NavPrefs): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(NAV_MUTED_KEY, prefs.muted ? '1' : '0'),
    SecureStore.setItemAsync(NAV_3D_KEY, prefs.threeD ? '1' : '0'),
  ]);
}
