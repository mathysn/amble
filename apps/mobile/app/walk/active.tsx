import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { isRoundTrip, type WalkCuriosity } from '@amble/shared';
import { Screen } from '../../src/components/Screen';
import { Button } from '../../src/components/Button';
import { WebMap } from '../../src/components/WebMap';
import { DirectionsList } from '../../src/components/DirectionsList';
import { CuriosityThumb } from '../../src/components/CuriosityView';
import { ChevronRightIcon } from '../../src/components/icons';
import { ManeuverBanner, SimBadge } from '../../src/components/nav/ManeuverBanner';
import { MapControls } from '../../src/components/nav/MapControls';
import { NavSheet } from '../../src/components/nav/NavSheet';
import { Mono, Overline, Serif } from '../../src/components/typography';
import { useCompleteWalk, useResumeWalk, useSettings, useWalk } from '../../src/api/hooks';
import { useWalkSession } from '../../src/store/walkSession';
import { useNavPrefs } from '../../src/store/navPrefs';
import { useLiveLocation } from '../../src/hooks/useLiveLocation';
import { useNavigation } from '../../src/hooks/useNavigation';
import { prepareVoice } from '../../src/lib/voice';
import { success } from '../../src/lib/haptics';
import { formatArrival, formatDuration, formatNavDistance } from '../../src/lib/format';
import type { CameraMode } from '../../src/lib/map/bridge';

/** After panning the map, follow the walker again once they've left it alone this long. */
const IDLE_RECENTER_MS = 15_000;
/** Height of the collapsed sheet's content (summary, next curiosity, Pause / End),
 *  above the bottom safe area. */
const SHEET_PEEK = 242;
/** Show the "then …" chip when the maneuver after next comes this soon after it. */
const THEN_CHIP_M = 60;

/**
 * 06 · Walking — full-screen turn-by-turn in Amble's palette: a heading-up map
 * that follows the walker, the next maneuver up top, and a sheet with time,
 * distance, Pause / End and the directions left. Curiosities reveal themselves
 * only by proximity (nothing here opens one early); the Discovery / Paused / End-walk modals open over this screen,
 * which keeps tracking underneath but goes quiet while covered.
 */
export default function ActiveWalk() {
  useKeepAwake();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: walk } = useWalk(id, { refetchOnWindowFocus: true });
  const { data: settings } = useSettings();
  const resume = useResumeWalk();
  const complete = useCompleteWalk();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const { walkId, begin, markRevealed, revealedIds, setFix } = useWalkSession();
  const { muted, threeD, load, setMuted, setThreeD } = useNavPrefs();
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!muted) void prepareVoice();
  }, [muted]);

  // Ensure the session knows this walk (e.g. after an app reload mid-walk).
  useEffect(() => {
    if (walk && walkId !== walk.id) begin(walk.id);
  }, [walk, walkId, begin]);

  const [simulating, setSimulating] = useState(false);
  const live = useLiveLocation({
    enabled: !!walk,
    simulate: __DEV__ && simulating && walk ? walk.route : null,
  });
  useEffect(() => {
    if (live.fix) setFix(live.fix);
  }, [live.fix, setFix]);

  const onReveal = useCallback(
    (c: WalkCuriosity) => {
      markRevealed(c.id);
      success();
      router.push(`/discovery?id=${id}&cid=${c.id}`);
    },
    [id, markRevealed, router],
  );

  const units = settings?.units ?? 'km';
  const nav = useNavigation({
    walk,
    fix: live.fix,
    compass: live.heading,
    units,
    pace: settings?.pace ?? 'easy',
    focused,
    muted,
    revealedIds,
    onReveal,
  });

  // ── camera: follow, the whole route, or free after a pan ────────────────
  const [camera, setCamera] = useState<CameraMode>('follow');
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearIdle = () => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = null;
  };
  useEffect(() => clearIdle, []);
  const follow = () => {
    clearIdle();
    setCamera('follow');
  };
  const onGesture = useCallback(() => {
    setCamera('free');
    clearIdle();
    idle.current = setTimeout(() => setCamera('follow'), IDLE_RECENTER_MS);
  }, []);
  const toggleOverview = () => {
    clearIdle();
    setCamera((c) => (c === 'overview' ? 'follow' : 'overview'));
  };

  // ── finishing ──────────────────────────────────────────────────────────
  const finishing = useRef(false);
  useEffect(() => {
    // Finished from somewhere other than this screen's own buttons (e.g. a reload).
    if (walk?.status === 'completed' && focused && !finishing.current) {
      finishing.current = true;
      router.replace(`/walk/complete?id=${id}`);
    }
  }, [walk?.status, focused, id, router]);
  const onFinish = () => {
    finishing.current = true;
    complete.mutate(id, {
      onSuccess: () => router.replace(`/walk/complete?id=${id}`),
      // Let the banner's Finish button try again.
      onError: () => {
        finishing.current = false;
      },
    });
  };
  // Back at the start (or at the finish of an A→B walk): that's the walk done —
  // straight to the summary, no button to press. Waits if a curiosity is open
  // on top (focused) and never fires while paused.
  useEffect(() => {
    if (nav.status !== 'arrived' || !focused || walk?.status !== 'active' || finishing.current) return;
    success();
    onFinish();
    // onFinish only closes over stable values (id, router, the mutation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.status, focused, walk?.status]);

  // ── layout ─────────────────────────────────────────────────────────────
  const [bannerBottom, setBannerBottom] = useState(insets.top + 120);
  const collapsed = SHEET_PEEK + insets.bottom;
  const expanded = Math.min(windowHeight * 0.72, windowHeight - insets.top - 48);

  if (!walk) {
    return (
      <Screen className="items-center justify-center">
        <Serif className="text-[20px] text-ink/40">Loading…</Serif>
      </Screen>
    );
  }

  const { tracker, view, index, status } = nav;
  const next = view?.next ?? null;
  const afterNext = index && view ? (index.steps[view.stepIndex + 2] ?? null) : null;
  const then =
    next && afterNext && afterNext.type !== 10 && afterNext.alongM - next.alongM <= THEN_CHIP_M
      ? afterNext
      : null;

  const foundList = walk.curiosities.filter((c) => c.found);
  const found = foundList.length;
  const roundTrip = isRoundTrip(walk);
  const cameraMode: CameraMode = status === 'finding' ? 'overview' : camera;
  const eta = nav.etaMin;
  const progress = index && tracker ? Math.min(1, tracker.alongM / Math.max(1, index.totalM)) : 0;

  return (
    <View className="flex-1 bg-paper">
      <WebMap
        mode="nav"
        fill
        rounded={false}
        style={StyleSheet.absoluteFill}
        route={walk.route}
        routeKey={index?.key}
        start={{ lat: walk.startLat, lng: walk.startLng }}
        end={roundTrip ? null : { lat: walk.endLat!, lng: walk.endLng! }}
        stops={walk.curiosities.map((c) => ({
          lat: c.lat,
          lng: c.lng,
          found: c.found,
          next: c.id === nav.nextCuriosity?.id,
        }))}
        puck={
          tracker?.display
            ? { lat: tracker.display.lat, lng: tracker.display.lng, accuracy: tracker.accuracy }
            : null
        }
        bearing={{ puck: live.heading, camera: nav.cameraBearing }}
        progress={
          tracker?.joined && index?.real
            ? { seg: tracker.seg, lat: tracker.snapped.lat, lng: tracker.snapped.lng }
            : null
        }
        camera={cameraMode}
        threeD={threeD}
        insets={{ top: bannerBottom, bottom: collapsed }}
        animating={focused}
        onGesture={onGesture}
        onPerfLow={() => setThreeD(false)}
      />

      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12 }}
        onLayout={(e) => setBannerBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
      >
        {simulating && <SimBadge />}
        <ManeuverBanner
          status={status}
          next={next}
          then={then}
          distToNextM={view?.distToNextM ?? null}
          first={view?.stepIndex === 0 && next?.type === 11}
          pointer={nav.pointer}
          cameraBearing={nav.cameraBearing}
          hasNextCuriosity={!!nav.nextCuriosity}
          roundTrip={roundTrip}
          units={units}
          onResume={() => resume.mutate(id)}
          onFinish={onFinish}
          style={simulating ? { marginTop: 6 } : undefined}
        />
      </View>

      <MapControls
        style={{ position: 'absolute', right: 12, top: bannerBottom + 12 }}
        following={cameraMode === 'follow'}
        onRecenter={follow}
        threeD={threeD}
        onToggle3D={() => setThreeD(!threeD)}
        muted={muted}
        onToggleMute={() => setMuted(!muted)}
        overview={cameraMode === 'overview'}
        onToggleOverview={toggleOverview}
        simulating={simulating}
        onToggleSimulate={__DEV__ ? () => setSimulating((s) => !s) : undefined}
      />

      <NavSheet
        collapsedHeight={collapsed}
        expandedHeight={expanded}
        bottomInset={insets.bottom}
        grab={
          <View>
            <View className="flex-row items-end justify-between">
              <Serif className="text-[28px] leading-[32px] text-sage-dark">
                {eta !== null ? formatDuration(eta) : '—'}
              </Serif>
              <Overline className="mb-1.5">
                surprise {found} / {walk.curiosities.length}
              </Overline>
            </View>
            <Text className="mt-0.5 font-sans text-[14px] text-ink/60">
              {nav.remainingM !== null ? formatNavDistance(nav.remainingM, units) : '—'}
              {eta !== null
                ? ` · ${roundTrip ? 'back' : 'there'} by ${formatArrival(new Date(Date.now() + eta * 60_000))}`
                : ''}
            </Text>
            <View className="mt-3 h-[3px] overflow-hidden rounded-full bg-ink/10">
              <View className="h-full bg-sage" style={{ width: `${progress * 100}%` }} />
            </View>
          </View>
        }
        peek={
          <View>
            {/* Not tappable: a curiosity only opens when you're actually there. */}
            <View className="mt-3 flex-row items-center gap-3 rounded-panel bg-paper px-4 py-3.5">
              <View className="h-2 w-2 rounded-full bg-sage" />
              <Text className="flex-1 font-sans-medium text-[14px] text-ink" numberOfLines={1}>
                {nav.nextCuriosity
                  ? `Next curiosity · ${nav.nextCuriosity.name}`
                  : walk.curiosities.length
                    ? 'You’ve found them all — wander on.'
                    : 'No curiosities on this one — just wander.'}
              </Text>
              {nav.nextCuriosityM !== null && (
                <Mono className="text-ink/45">{formatNavDistance(nav.nextCuriosityM, units)}</Mono>
              )}
            </View>
            <View className="mt-3 flex-row gap-3">
              <Button
                label="Pause"
                variant="secondary"
                className="flex-1"
                onPress={() => router.push(`/paused?id=${id}`)}
              />
              <Button
                label="End walk"
                variant="sage"
                className="flex-1"
                onPress={() => router.push(`/end-walk?id=${id}`)}
              />
            </View>
          </View>
        }
      >
        {found > 0 && (
          <>
            <Overline className="mb-1 mt-5">Found so far</Overline>
            {foundList.map((c, i) => (
              <Pressable
                key={c.id}
                onPress={() => router.push(`/curiosity/${c.id}`)}
                className={`flex-row items-center gap-3 py-2.5 ${i === foundList.length - 1 ? '' : 'border-b border-ink/[0.08]'}`}
              >
                <CuriosityThumb id={c.id} size={36} />
                <Text className="flex-1 font-sans-medium text-[14px] text-ink" numberOfLines={1}>
                  {c.name}
                </Text>
                <ChevronRightIcon />
              </Pressable>
            ))}
          </>
        )}
        {index?.real && view ? (
          <>
            <Overline className="mb-1 mt-5">Directions</Overline>
            <DirectionsList
              steps={index.steps}
              units={units}
              fromStep={view.stepIndex}
              activeStep={view.stepIndex}
              roundTrip={roundTrip}
            />
          </>
        ) : (
          <Text className="mt-5 font-sans text-[14px] leading-[21px] text-ink/60">
            This wander has no street directions — follow the arrow, or wherever looks good.
          </Text>
        )}
      </NavSheet>
    </View>
  );
}
