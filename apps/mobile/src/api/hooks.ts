import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type {
  Curiosity,
  GeoSearchResponse,
  PlanWalkRequest,
  Place,
  SavedCuriosity,
  Settings,
  UpdateSettings,
  Walk,
  WalkListResponse,
} from '@amble/shared';
import { api } from './client';

export const qk = {
  settings: ['settings'] as const,
  walks: ['walks'] as const,
  walk: (id: string) => ['walk', id] as const,
  saved: ['saved'] as const,
  curiosity: (id: string) => ['curiosity', id] as const,
  geo: (q: string) => ['geo', q] as const,
};

// ── Settings ─────────────────────────────────────────────────────────────
export const useSettings = () =>
  useQuery({ queryKey: qk.settings, queryFn: () => api.get<Settings>('/settings') });

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateSettings) => api.patch<Settings>('/settings', patch),
    onSuccess: (data) => qc.setQueryData(qk.settings, data),
  });
}

// ── Walks ────────────────────────────────────────────────────────────────
export function usePlanWalk() {
  return useMutation({ mutationFn: (req: PlanWalkRequest) => api.post<Walk>('/walks/plan', req) });
}

export function useReshuffle() {
  return useMutation({ mutationFn: (id: string) => api.post<Walk>(`/walks/${id}/reshuffle`) });
}

export const useWalk = (id: string, options?: Partial<UseQueryOptions<Walk>>) =>
  useQuery({ queryKey: qk.walk(id), queryFn: () => api.get<Walk>(`/walks/${id}`), ...options });

export const useWalks = () =>
  useQuery({ queryKey: qk.walks, queryFn: () => api.get<WalkListResponse>('/walks') });

function useWalkLifecycle(action: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Walk>(`/walks/${id}/${action}`),
    onSuccess: (walk) => {
      qc.setQueryData(qk.walk(walk.id), walk);
      qc.invalidateQueries({ queryKey: qk.walks });
    },
  });
}

export const useStartWalk = () => useWalkLifecycle('start');
export const usePauseWalk = () => useWalkLifecycle('pause');
export const useResumeWalk = () => useWalkLifecycle('resume');
export const useCompleteWalk = () => useWalkLifecycle('complete');

export function useMarkFound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ walkId, curiosityId }: { walkId: string; curiosityId: string }) =>
      api.post<Walk>(`/walks/${walkId}/curiosities/${curiosityId}/found`),
    onSuccess: (walk) => qc.setQueryData(qk.walk(walk.id), walk),
  });
}

// ── Curiosities & saved ──────────────────────────────────────────────────
export const useCuriosity = (id: string) =>
  useQuery({ queryKey: qk.curiosity(id), queryFn: () => api.get<Curiosity>(`/curiosities/${id}`) });

export const useSaved = () =>
  useQuery({ queryKey: qk.saved, queryFn: () => api.get<SavedCuriosity[]>('/saved') });

export function useSaveCuriosity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (curiosityId: string) =>
      api.post<SavedCuriosity>('/saved', { curiosityId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.saved }),
  });
}

export function useUnsaveCuriosity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (curiosityId: string) => api.del(`/saved/${curiosityId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.saved }),
  });
}

// ── Geocoding ────────────────────────────────────────────────────────────
export const useGeoSearch = (q: string) =>
  useQuery({
    queryKey: qk.geo(q),
    queryFn: () => api.get<GeoSearchResponse>(`/geo/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 3,
  });

export const reverseGeocode = (lat: number, lng: number) =>
  api.get<Place>(`/geo/reverse?lat=${lat}&lng=${lng}`);
