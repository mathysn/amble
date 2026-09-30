import { describe, expect, it } from 'vitest';
import type { RouteGeometry, RouteStep } from '@amble/shared';
import { haversineM, makeProjection } from './geo';
import { alongOfOrdered, buildRouteIndex, MANEUVER } from './routeIndex';
import { initTracker, navView, updateTracker, type Fix, type TrackerState } from './tracker';
import { loopAround, simulateWalk } from './simulator';
import { initAnnouncer, nextAnnouncement, type Announcement } from './announcer';
import { maneuverPhrase, nowPhrase, preparePhrase, spokenDistance } from './phrases';
import { initReroutePolicy, rerouteFinished, rerouteStarted, shouldReroute } from './reroutePolicy';
import { cameraBearing, smoothHeading } from './heading';
import { OFF_ROUTE_MIN_MS, WINDOW_BACK_M } from './constants';

const CENTER = { lat: 51.5129, lng: -0.1224 };

// 400 m square loop, walked east → north → west → south; corners at indices 0,4,8,12,16.
const loop = loopAround(CENTER, 400);
const loopSteps: RouteStep[] = [
  { instruction: '', distanceM: 400, wayName: 'King Street', type: MANEUVER.depart, startIndex: 0 },
  { instruction: '', distanceM: 400, wayName: 'Long Acre', type: MANEUVER.left, startIndex: 4 },
  { instruction: '', distanceM: 400, wayName: 'Bow Street', type: MANEUVER.left, startIndex: 8 },
  { instruction: '', distanceM: 400, wayName: null, type: MANEUVER.left, startIndex: 12 },
  { instruction: '', distanceM: 0, wayName: null, type: MANEUVER.arrive, startIndex: 16 },
];

function run(route: RouteGeometry, steps: RouteStep[], fixes: Fix[], init?: TrackerState) {
  const index = buildRouteIndex(route, steps, 'r');
  let s = init ?? initTracker(index);
  const states: TrackerState[] = [];
  for (const f of fixes) {
    s = updateTracker(index, s, f);
    states.push(s);
  }
  return { index, states, last: s };
}

describe('geo', () => {
  it('flat projection stays within 0.5% of great-circle distance over 1 km', () => {
    const proj = makeProjection(CENTER);
    const b = { lat: CENTER.lat + 0.006, lng: CENTER.lng + 0.009 };
    const [x, y] = proj.toXY(b);
    const flat = Math.hypot(x, y);
    const true_ = haversineM(CENTER, b);
    expect(true_).toBeGreaterThan(900);
    expect(Math.abs(flat - true_) / true_).toBeLessThan(0.005);
  });
});

describe('routeIndex', () => {
  it('places steps along the route and measures it', () => {
    const index = buildRouteIndex(loop, loopSteps);
    expect(index.totalM).toBeCloseTo(1600, -1);
    expect(index.steps.map((s) => Math.round(s.alongM / 10) * 10)).toEqual([0, 400, 800, 1200, 1600]);
    expect(index.real).toBe(true);
  });

  it('adds a virtual arrive step to walks stored without one', () => {
    const index = buildRouteIndex(loop, loopSteps.slice(0, -1));
    expect(index.steps.at(-1)!.type).toBe(MANEUVER.arrive);
    expect(index.steps.at(-1)!.alongM).toBeCloseTo(index.totalM);
  });

  it('leaves synthetic routes (no steps) without steps', () => {
    const index = buildRouteIndex(loop, []);
    expect(index.steps).toEqual([]);
    expect(index.real).toBe(false);
  });

  it('orders points along a loop, so the start counts as the end when listed last', () => {
    const index = buildRouteIndex(loop, loopSteps);
    const [first, last] = loop.coordinates as [number, number][];
    const mid = loop.coordinates[8] as [number, number];
    const alongs = alongOfOrdered(index, [
      { lng: mid[0], lat: mid[1] },
      { lng: first![0], lat: first![1] },
    ]);
    expect(alongs[0]).toBeCloseTo(800, -1);
    expect(alongs[1]).toBeCloseTo(1600, -1);
    expect(last).toBeDefined();
  });
});

describe('tracker', () => {
  it('follows a loop monotonically from start to arrival (not snapping start to end)', () => {
    const fixes = simulateWalk(loop, { noiseM: 4 });
    const { states, last, index } = run(loop, loopSteps, fixes);
    expect(states[0]!.joined).toBe(true);
    expect(states[0]!.alongM).toBeLessThan(30); // not ~1600
    for (let i = 1; i < states.length; i++) {
      expect(states[i]!.alongM).toBeGreaterThanOrEqual(states[i - 1]!.alongM - WINDOW_BACK_M);
    }
    expect(states.some((s) => s.offRoute)).toBe(false);
    expect(last.arrived).toBe(true);
    expect(navView(index, last).remainingM).toBeLessThan(30);
  });

  it('keeps progress on an out-and-back street (both legs share the same line)', () => {
    const proj = makeProjection(CENTER);
    const pts = [0, 100, 200, 300, 200, 100, 0].map((x) => proj.toCoord([x, 0]));
    const route: RouteGeometry = { type: 'LineString', coordinates: pts.map((p) => [p.lng, p.lat]) };
    const steps: RouteStep[] = [
      { instruction: '', distanceM: 300, wayName: null, type: MANEUVER.depart, startIndex: 0 },
      { instruction: '', distanceM: 300, wayName: null, type: MANEUVER.uTurn, startIndex: 3 },
      { instruction: '', distanceM: 0, wayName: null, type: MANEUVER.arrive, startIndex: 6 },
    ];
    const { states, last } = run(route, steps, simulateWalk(route, { noiseM: 3 }));
    const onWayBack = states[Math.floor(states.length * 0.75)]!;
    expect(onWayBack.alongM).toBeGreaterThan(330);
    expect(last.alongM).toBeGreaterThan(570);
    expect(last.arrived).toBe(true);
  });

  it('flags off-route only after several fixes over several seconds, and clears on return', () => {
    const fixes = simulateWalk(loop, { detour: { atM: 300, lengthM: 250, offsetM: 90 }, noiseM: 2 });
    const { index, states } = run(loop, loopSteps, fixes);
    const firstFar = states.findIndex((s) => s.offDistM > 35);
    const firstOff = states.findIndex((s) => s.offRoute);
    expect(firstOff).toBeGreaterThan(firstFar);
    expect(fixes[firstOff]!.t - fixes[firstFar]!.t).toBeGreaterThanOrEqual(OFF_ROUTE_MIN_MS);
    // progress freezes while off-route
    const frozen = states[firstOff + 5]!;
    expect(frozen.offRoute).toBe(true);
    expect(frozen.alongM).toBeLessThan(420);
    // back on the route afterwards
    const lastOff = states.map((s) => s.offRoute).lastIndexOf(true);
    expect(lastOff).toBeLessThan(states.length - 1);
    expect(states.at(-1)!.offRoute).toBe(false);
    expect(navView(index, states.at(-1)!).remainingM).toBeLessThan(30);
  });

  it('ignores inaccurate fixes for progress but still moves the puck', () => {
    const fixes = simulateWalk(loop, { untilM: 100 });
    const { index, last } = run(loop, loopSteps, fixes);
    const wild: Fix = { lat: CENTER.lat + 0.003, lng: CENTER.lng, accuracy: 120, t: last.lastFix!.t + 1000 };
    const after = updateTracker(index, last, wild);
    expect(after.alongM).toBe(last.alongM);
    expect(after.offRoute).toBe(false);
    expect(after.display).toEqual({ lat: wild.lat, lng: wild.lng });
  });

  it('re-acquires progress anywhere on the route after a long GPS gap', () => {
    const fixes = simulateWalk(loop, { noiseM: 1 });
    const index = buildRouteIndex(loop, loopSteps);
    let s = initTracker(index);
    for (const f of fixes.slice(0, 60)) s = updateTracker(index, s, f); // ~84 m
    const later = fixes[500]!; // ~700 m along
    s = updateTracker(index, s, { ...later, t: s.lastFix!.t + 60_000 });
    expect(s.alongM).toBeGreaterThan(650);
    expect(s.alongM).toBeLessThan(750);
  });

  it('waits to join a far-away start and asks for an approach route', () => {
    const proj = makeProjection(CENTER);
    const start = loop.coordinates[0] as [number, number];
    const [sx, sy] = proj.toXY({ lng: start[0], lat: start[1] });
    const far = proj.toCoord([sx - 250, sy - 150]);
    const fixes = simulateWalk(loop, { approachFrom: far, untilM: 200, noiseM: 2 });
    const { index, states } = run(loop, loopSteps, fixes);
    expect(states[0]!.joined).toBe(false);
    expect(navView(index, states[1]!).approachNeeded).toBe(true);
    expect(navView(index, states[0]!).toStart!.distM).toBeGreaterThan(250);
    const joinedAt = states.findIndex((s) => s.joined);
    expect(joinedAt).toBeGreaterThan(100);
    expect(states.at(-1)!.alongM).toBeGreaterThan(150);
  });

  it('joins mid-route when the app reloads during a walk', () => {
    const fixes = simulateWalk(loop, { noiseM: 2 }).slice(700, 710); // ~980 m along
    const { states } = run(loop, loopSteps, fixes);
    expect(states[0]!.joined).toBe(true);
    expect(states[0]!.alongM).toBeGreaterThan(930);
    expect(states[0]!.alongM).toBeLessThan(1030);
  });

  it('counts down to the next maneuver along the route', () => {
    const fixes = simulateWalk(loop, { untilM: 100, noiseM: 0 });
    const { index, last } = run(loop, loopSteps, fixes);
    const view = navView(index, last);
    expect(view.stepIndex).toBe(0);
    expect(view.next!.type).toBe(MANEUVER.left);
    expect(view.distToNextM!).toBeGreaterThan(290);
    expect(view.distToNextM!).toBeLessThan(310);
  });

  it('never flags a synthetic route as off-route', () => {
    const fixes = simulateWalk(loop, { detour: { atM: 300, lengthM: 250, offsetM: 90 } });
    const { states } = run(loop, [], fixes);
    expect(states.some((s) => s.offRoute)).toBe(false);
  });
});

describe('announcer', () => {
  const index = buildRouteIndex(loop, loopSteps, 'r1');
  const say = (dists: number[], stepIndex = 0, routeKey = 'r1') => {
    let st = initAnnouncer();
    const out: Announcement[] = [];
    for (const d of dists) {
      const r = nextAnnouncement(st, { routeKey, steps: index.steps, stepIndex, distToNextM: d, units: 'km' });
      st = r.state;
      if (r.announcement) out.push(r.announcement);
    }
    return { out, st };
  };

  it('says start, prepare and now once each, with a left haptic at the turn', () => {
    const { out } = say([390, 300, 70, 58, 55, 40, 14, 12, 8]);
    expect(out.map((a) => a.stage)).toEqual(['start', 'prepare', 'now']);
    expect(out[0]!.text).toBe('Set off along King Street.');
    expect(out[1]!.text).toBe('In 60 metres, turn left onto Long Acre.');
    expect(out[2]!.text).toBe('Turn left onto Long Acre.');
    expect(out[2]!.haptic).toBe('left');
  });

  // A straight street with vertices at 0, 60, 200, 230 and 400 m.
  const proj = makeProjection(CENTER);
  const street: RouteGeometry = {
    type: 'LineString',
    coordinates: [0, 60, 200, 230, 400].map((x) => {
      const c = proj.toCoord([x, 0]);
      return [c.lng, c.lat] as [number, number];
    }),
  };

  it('skips "prepare" on short steps', () => {
    const steps: RouteStep[] = [
      loopSteps[0]!,
      { ...loopSteps[1]!, startIndex: 1 }, // 60 m in
      { ...loopSteps[4]!, startIndex: 4 },
    ];
    const idx = buildRouteIndex(street, steps, 'short');
    let st = initAnnouncer();
    const stages: string[] = [];
    for (const d of [50, 30, 10]) {
      const r = nextAnnouncement(st, { routeKey: 'short', steps: idx.steps, stepIndex: 0, distToNextM: d, units: 'km' });
      st = r.state;
      if (r.announcement) stages.push(r.announcement.stage);
    }
    expect(stages).toEqual(['now']);
  });

  it('chains a close following maneuver', () => {
    const steps: RouteStep[] = [
      loopSteps[0]!,
      { ...loopSteps[1]!, startIndex: 2 }, // 200 m
      { ...loopSteps[2]!, startIndex: 3, type: MANEUVER.slightRight }, // 30 m later
      { ...loopSteps[4]!, startIndex: 4 },
    ];
    const idx = buildRouteIndex(street, steps, 'chain');
    const r = nextAnnouncement(initAnnouncer('chain'), {
      routeKey: 'chain',
      steps: idx.steps,
      stepIndex: 0,
      distToNextM: 10,
      units: 'km',
    });
    expect(r.announcement!.text).toBe('Turn left onto Long Acre, then bear right.');
  });

  it('starts over after a reroute', () => {
    const { st } = say([10]);
    const again = nextAnnouncement(st, { routeKey: 'r2', steps: index.steps, stepIndex: 0, distToNextM: 10, units: 'km' });
    expect(again.announcement?.stage).toBe('now');
  });

  it('stays quiet at "carry on" steps', () => {
    const steps: RouteStep[] = [
      loopSteps[0]!,
      { ...loopSteps[1]!, startIndex: 2, type: MANEUVER.straight },
      { ...loopSteps[4]!, startIndex: 4 },
    ];
    const idx = buildRouteIndex(street, steps, 'quiet');
    const r = nextAnnouncement(initAnnouncer('quiet'), {
      routeKey: 'quiet',
      steps: idx.steps,
      stepIndex: 0,
      distToNextM: 10,
      units: 'km',
    });
    expect(r.announcement).toBeNull();
    expect(r.state.done['quiet:1:now']).toBe(true);
  });

  it('only buzzes for a turn already mentioned as "then …" moments ago', () => {
    const steps: RouteStep[] = [
      loopSteps[0]!,
      { ...loopSteps[1]!, startIndex: 2 },
      { ...loopSteps[2]!, startIndex: 3, type: MANEUVER.slightRight },
      { ...loopSteps[4]!, startIndex: 4 },
    ];
    const idx = buildRouteIndex(street, steps, 'm');
    const ctx = { routeKey: 'm', steps: idx.steps, units: 'km' as const };
    const first = nextAnnouncement(initAnnouncer('m'), { ...ctx, stepIndex: 0, distToNextM: 10, now: 1_000 });
    expect(first.announcement!.text).toContain('then bear right');
    const soon = nextAnnouncement(first.state, { ...ctx, stepIndex: 1, distToNextM: 10, now: 5_000 });
    expect(soon.announcement!.text).toBeNull();
    expect(soon.announcement!.haptic).toBe('right');
    const late = nextAnnouncement(first.state, { ...ctx, stepIndex: 1, distToNextM: 10, now: 30_000 });
    expect(late.announcement!.text).toBe('Bear right onto Bow Street.');
  });

  it('announces arrival with a success haptic', () => {
    const { out } = say([10], 3);
    expect(out[0]!.text).toBe("You're back where you started. Lovely wander.");
    expect(out[0]!.haptic).toBe('arrive');
  });
});

describe('phrases', () => {
  it('has wording for every ORS maneuver type', () => {
    for (let type = 0; type <= 13; type++) {
      const phrase = maneuverPhrase({ type, wayName: 'Neal Street' });
      expect(phrase.length).toBeGreaterThan(3);
    }
    expect(maneuverPhrase({ type: null, wayName: null })).toBe('Carry on');
  });

  it('handles roundabouts, missing names and units', () => {
    expect(maneuverPhrase({ type: 7, wayName: 'Seven Dials', exitNumber: 2 })).toBe(
      'At the roundabout, take the second exit onto Seven Dials',
    );
    expect(maneuverPhrase({ type: 1, wayName: null })).toBe('Turn right');
    expect(spokenDistance(57, 'km')).toBe('60 metres');
    expect(spokenDistance(57, 'mi')).toBe('60 yards');
    expect(spokenDistance(260, 'km')).toBe('250 metres');
    expect(preparePhrase({ type: 10, wayName: null }, 60, 'km')).toBe("In 60 metres, you'll be back where you started.");
    expect(nowPhrase({ type: 4, wayName: 'Floral Street' }, { type: 1, wayName: null })).toBe(
      'Bear left onto Floral Street, then turn right.',
    );
  });
});

describe('reroutePolicy', () => {
  const ctx = {
    now: 100_000,
    offRoute: true,
    approachNeeded: false,
    arrived: false,
    paused: false,
    focused: true,
    real: true,
    remainingM: 800,
  };

  it('reroutes when off-route, then throttles and backs off after failures', () => {
    let p = initReroutePolicy();
    expect(shouldReroute(p, ctx)).toBe('rejoin');
    p = rerouteStarted(p, ctx.now);
    expect(shouldReroute(p, { ...ctx, now: ctx.now + 30_000 })).toBeNull(); // in flight
    p = rerouteFinished(p, false);
    expect(shouldReroute(p, { ...ctx, now: ctx.now + 15_000 })).toBeNull();
    expect(shouldReroute(p, { ...ctx, now: ctx.now + 21_000 })).toBe('rejoin');
    p = rerouteFinished(rerouteStarted(p, ctx.now + 21_000), false);
    expect(shouldReroute(p, { ...ctx, now: ctx.now + 21_000 + 30_000 })).toBeNull(); // 40 s backoff
    expect(shouldReroute(p, { ...ctx, now: ctx.now + 21_000 + 41_000 })).toBe('rejoin');
  });

  it('asks for an approach route before joining, even on synthetic routes', () => {
    expect(shouldReroute(initReroutePolicy(), { ...ctx, offRoute: false, approachNeeded: true, real: false })).toBe(
      'approach',
    );
  });

  it('never reroutes when it cannot help', () => {
    const p = initReroutePolicy();
    expect(shouldReroute(p, { ...ctx, paused: true })).toBeNull();
    expect(shouldReroute(p, { ...ctx, focused: false })).toBeNull();
    expect(shouldReroute(p, { ...ctx, arrived: true })).toBeNull();
    expect(shouldReroute(p, { ...ctx, real: false })).toBeNull();
    expect(shouldReroute(p, { ...ctx, remainingM: 40 })).toBeNull();
    expect(shouldReroute(p, { ...ctx, offRoute: false })).toBeNull();
  });
});

describe('heading', () => {
  it('smooths across north without swinging through south', () => {
    expect(smoothHeading(350, 10, 0.5)).toBeCloseTo(0);
    expect(smoothHeading(10, 350, 0.5)).toBeCloseTo(0);
    expect(smoothHeading(null, 370)).toBe(10);
  });

  it('faces the route when walking it, the compass when still, ignoring small wobble', () => {
    const base = { onRoute: true, speedMps: 1.3, routeBearing: 90, compass: 180, prev: 0 };
    expect(cameraBearing(base)).toBe(90);
    expect(cameraBearing({ ...base, speedMps: 0.2 })).toBe(180);
    expect(cameraBearing({ ...base, speedMps: 0.2, compass: 5 })).toBe(0);
    expect(cameraBearing({ ...base, onRoute: false })).toBe(180);
  });
});
