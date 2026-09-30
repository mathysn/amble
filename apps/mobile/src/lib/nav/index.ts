// The navigation engine: pure, platform-free, unit-tested. React wiring lives in
// src/hooks/useNavigation.ts.
export * from './constants';
export * from './routeIndex';
export * from './tracker';
export * from './heading';
export * from './phrases';
export * from './announcer';
export * from './reroutePolicy';
export { simulateWalk, loopAround, type SimOptions } from './simulator';
export { angleDiff, bearingDeg, haversineM, normDeg } from './geo';
