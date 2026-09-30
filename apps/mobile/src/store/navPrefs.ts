import { create } from 'zustand';
import { getNavPrefs, setNavPrefs, type NavPrefs } from '../lib/storage';

/**
 * Voice mute and 2D/3D, remembered across launches. Loaded once from
 * SecureStore; every change is written straight back.
 */
type NavPrefsState = NavPrefs & {
  loaded: boolean;
  load: () => Promise<void>;
  setMuted: (muted: boolean) => void;
  setThreeD: (threeD: boolean) => void;
};

export const useNavPrefs = create<NavPrefsState>((set, get) => {
  const save = () => {
    const { muted, threeD } = get();
    setNavPrefs({ muted, threeD }).catch(() => {});
  };
  return {
    muted: false,
    threeD: true,
    loaded: false,
    load: async () => {
      if (get().loaded) return;
      try {
        set({ ...(await getNavPrefs()), loaded: true });
      } catch {
        set({ loaded: true });
      }
    },
    setMuted: (muted) => {
      set({ muted });
      save();
    },
    setThreeD: (threeD) => {
      set({ threeD });
      save();
    },
  };
});
