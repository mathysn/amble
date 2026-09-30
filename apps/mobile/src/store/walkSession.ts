import { create } from 'zustand';
import type { Fix } from '../lib/nav';

/**
 * Live state for the walk in progress: the walker's latest real GPS fix and
 * which curiosities have already triggered a discovery moment this session.
 * Durable data (found/complete/route) lives on the server; this is the
 * ephemeral part. There is deliberately no "assumed" position: until a real fix
 * arrives the walker's location is unknown (an address-chosen start may be far away).
 */
type WalkSessionState = {
  walkId: string | null;
  fix: Fix | null;
  /** ids whose discovery moment has been shown, so it isn't re-triggered. */
  revealedIds: string[];
  begin: (walkId: string) => void;
  setFix: (f: Fix) => void;
  markRevealed: (id: string) => void;
  clear: () => void;
};

export const useWalkSession = create<WalkSessionState>((set) => ({
  walkId: null,
  fix: null,
  revealedIds: [],
  begin: (walkId) => set({ walkId, fix: null, revealedIds: [] }),
  setFix: (fix) => set({ fix }),
  markRevealed: (id) =>
    set((s) => (s.revealedIds.includes(id) ? s : { revealedIds: [...s.revealedIds, id] })),
  clear: () => set({ walkId: null, fix: null, revealedIds: [] }),
}));
