import { create } from 'zustand';
import type { Coord } from '@amble/shared';
import { reverseGeocode } from '../api/hooks';
import { locateOnce } from '../lib/location';

export type PlacePoint = { coord: Coord; label: string; detail: string | null };

/**
 * Where finding the walker has got to:
 * - idle — nothing tried yet
 * - locating — waiting for a GPS fix
 * - naming — have a fix, looking up what the place is called
 * - ready — a start point is set (from GPS or a chosen address)
 * - denied — no location permission: choose an address instead
 * - failed — permission, but no fix in time
 */
export type LocateStatus = 'idle' | 'locating' | 'naming' | 'ready' | 'denied' | 'failed';

type WalkPointsState = {
  /** The walk's starting point — from GPS or a chosen address. */
  coord: Coord | null;
  label: string | null;
  detail: string | null;
  status: LocateStatus;
  /** Where an A→B walk finishes; null = loop back to the start. */
  end: PlacePoint | null;
  setStart: (coord: Coord, label: string, detail?: string | null) => void;
  /** Start from where the walker is now. `ask` requests permission if needed. */
  locate: (opts?: { ask?: boolean }) => Promise<void>;
  setEnd: (end: PlacePoint) => void;
  clearEnd: () => void;
};

/** Bumped by every new start point, so a slow lookup can't overwrite a newer choice. */
let generation = 0;

export const useStartPoint = create<WalkPointsState>((set, get) => ({
  coord: null,
  label: null,
  detail: null,
  status: 'idle',
  end: null,
  setStart: (coord, label, detail = null) => {
    generation++;
    set({ coord, label, detail, status: 'ready' });
  },
  locate: async ({ ask = false } = {}) => {
    const { status } = get();
    if (status === 'locating' || status === 'naming') return;
    const mine = ++generation;
    set({ status: 'locating' });
    const res = await locateOnce({ ask });
    if (mine !== generation) return;
    if (res.status !== 'ok') {
      // Keep an address chosen earlier; otherwise say what went wrong.
      set({ status: get().coord ? 'ready' : res.status });
      return;
    }
    set({ coord: res.coord, label: 'Current location', detail: null, status: 'naming' });
    try {
      const place = await reverseGeocode(res.coord.lat, res.coord.lng);
      if (mine === generation) set({ label: place.label, detail: place.detail, status: 'ready' });
    } catch {
      if (mine === generation) set({ status: 'ready' });
    }
  },
  setEnd: (end) => set({ end }),
  clearEnd: () => set({ end: null }),
}));
