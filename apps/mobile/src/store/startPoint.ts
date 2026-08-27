import { create } from 'zustand';
import type { Coord } from '@amble/shared';

/** The walk's starting point — from GPS or a chosen address. */
type StartPointState = {
  coord: Coord | null;
  label: string | null;
  detail: string | null;
  setStart: (coord: Coord, label: string, detail?: string | null) => void;
};

export const useStartPoint = create<StartPointState>((set) => ({
  coord: null,
  label: null,
  detail: null,
  setStart: (coord, label, detail = null) => set({ coord, label, detail }),
}));
