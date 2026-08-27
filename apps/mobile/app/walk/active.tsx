import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Coord, WalkCuriosity } from '@amble/shared';
import { Screen } from '../../src/components/Screen';
import { Button } from '../../src/components/Button';
import { WebMap } from '../../src/components/WebMap';
import { ProgressHeader } from '../../src/components/ProgressHeader';
import { Overline, Serif } from '../../src/components/typography';
import { useWalk } from '../../src/api/hooks';
import { useWalkSession } from '../../src/store/walkSession';
import { watchLocation } from '../../src/lib/location';
import { haversineM } from '../../src/lib/geo';
import { currentManeuver } from '../../src/lib/navigation';
import { formatMetres } from '../../src/lib/format';

const REVEAL_THRESHOLD_M = 60;

/** 06 · Walking — live map, progress, and proximity-triggered discoveries. */
export default function ActiveWalk() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: walk } = useWalk(id, { refetchOnWindowFocus: true });

  const { position, setPosition, begin, markRevealed, revealedIds } = useWalkSession();
  const [now, setNow] = useState(Date.now());
  const navigatingRef = useRef(false);

  const startCoord: Coord | null = walk ? { lat: walk.startLat, lng: walk.startLng } : null;

  // Ensure the session knows this walk (e.g. after an app reload mid-walk).
  useEffect(() => {
    if (walk && useWalkSession.getState().walkId !== walk.id) {
      begin(walk.id, { lat: walk.startLat, lng: walk.startLng });
    }
  }, [walk, begin]);

  // Tick the clock every second for the countdown.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Follow the walker's real position.
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    watchLocation((c) => setPosition(c)).then((fn) => (cleanup = fn));
    return () => cleanup?.();
  }, [setPosition]);

  const nextCuriosity = useMemo(
    () => walk?.curiosities.find((c) => !c.found) ?? null,
    [walk],
  );

  const here = position ?? startCoord;
  const distanceToNext =
    here && nextCuriosity ? haversineM(here, { lat: nextCuriosity.lat, lng: nextCuriosity.lng }) : null;

  const openDiscovery = (c: WalkCuriosity) => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    markRevealed(c.id);
    router.push(`/discovery?id=${id}&cid=${c.id}`);
    setTimeout(() => (navigatingRef.current = false), 800);
  };

  // Auto-reveal when close enough.
  useEffect(() => {
    if (!nextCuriosity || distanceToNext === null) return;
    if (distanceToNext <= REVEAL_THRESHOLD_M && !revealedIds.includes(nextCuriosity.id)) {
      openDiscovery(nextCuriosity);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distanceToNext, nextCuriosity, revealedIds]);

  // Leave for the summary once the walk is finished.
  useEffect(() => {
    if (walk?.status === 'completed') router.replace(`/walk/complete?id=${id}`);
  }, [walk?.status, id, router]);

  if (!walk || !startCoord) {
    return <Screen className="items-center justify-center"><Serif className="text-[20px] text-ink/40">Loading…</Serif></Screen>;
  }

  const found = walk.curiosities.filter((c) => c.found).length;
  const elapsedMin = walk.startedAt ? (now - new Date(walk.startedAt).getTime()) / 60_000 : 0;
  const minutesLeft = Math.ceil(walk.plannedMinutes - elapsedMin);
  const progress = Math.min(1, elapsedMin / walk.plannedMinutes);
  const maneuver = here ? currentManeuver(here, walk.route, walk.steps) : null;

  return (
    <Screen className="px-6">
      <View className="pt-2">
        <ProgressHeader minutesLeft={minutesLeft} found={found} total={walk.curiosities.length} progress={progress} />
      </View>

      <View className="relative mt-5 flex-1 overflow-hidden rounded-panel">
        <WebMap
          route={walk.route}
          start={startCoord}
          stops={walk.curiosities}
          position={here}
          fill
        />

        <View className="absolute left-4 right-4 top-4 rounded-panel bg-paper/90 px-4 py-3.5">
          {maneuver ? (
            <>
              <Overline tint="sage">
                {maneuver.wayName ? maneuver.wayName : 'On your wander'} · {formatMetres(maneuver.distanceToTurnM)}
              </Overline>
              <Serif className="mt-1.5 text-[20px]">{maneuver.instruction}</Serif>
            </>
          ) : (
            <>
              <Overline tint="sage">{directionHint(here, nextCuriosity)}</Overline>
              <Serif className="mt-1.5 text-[20px]">
                {nextCuriosity ? "Keep going — something's near." : 'You’ve found them all — wander on.'}
              </Serif>
            </>
          )}
        </View>

        {nextCuriosity && distanceToNext !== null && (
          <Pressable
            onPress={() => openDiscovery(nextCuriosity)}
            className="absolute bottom-4 left-4 right-4 flex-row items-center gap-3 rounded-panel bg-paper/90 px-4 py-3.5"
          >
            <View className="h-2 w-2 rounded-full bg-sage" />
            <Text className="flex-1 font-sans-medium text-[14px] text-ink">
              Next curiosity · {nextCuriosity.name}
            </Text>
            <Text className="font-sans-semibold text-[12px] text-ink/45">{formatMetres(distanceToNext)}</Text>
          </Pressable>
        )}
      </View>

      <View className="mt-4 flex-row gap-3 pb-1">
        <Button label="Pause" variant="outline" className="flex-1" onPress={() => router.push(`/paused?id=${id}`)} />
        <Button label="End walk" variant="sage" className="flex-1" onPress={() => router.push(`/end-walk?id=${id}`)} />
      </View>
    </Screen>
  );
}

/** A gentle cardinal-direction nudge toward the next curiosity. */
function directionHint(from: Coord | null, to: { lat: number; lng: number } | null): string {
  if (!from || !to) return 'Wander wherever looks good';
  const dLng = to.lng - from.lng;
  const dLat = to.lat - from.lat;
  const angle = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const idx = Math.round(((angle + 360) % 360) / 45) % 8;
  return `Head roughly ${dirs[idx]}`;
}
