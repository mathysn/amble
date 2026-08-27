import { create } from 'zustand';
import type { Coord } from '@amble/shared';

/**
 * Live state for the walk in progress: the walker's current position and which
 * curiosities have already triggered a discovery moment this session. Durable
 * data (found/complete/route) lives on the server; this is the ephemeral part.
 */
type WalkSessionState = {
  walkId: string | null;
  position: Coord | null;
  /** ids whose discovery moment has been shown, so it isn't re-triggered. */
  revealedIds: string[];
  begin: (walkId: string, start: Coord) => void;
  setPosition: (c: Coord) => void;
  markRevealed: (id: string) => void;
  clear: () => void;
};

export const useWalkSession = create<WalkSessionState>((set) => ({
  walkId: null,
  position: null,
  revealedIds: [],
  begin: (walkId, start) => set({ walkId, position: start, revealedIds: [] }),
  setPosition: (position) => set({ position }),
  markRevealed: (id) =>
    set((s) => (s.revealedIds.includes(id) ? s : { revealedIds: [...s.revealedIds, id] })),
  clear: () => set({ walkId: null, position: null, revealedIds: [] }),
}));
