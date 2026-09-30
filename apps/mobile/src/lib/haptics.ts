import * as Haptics from 'expo-haptics';
import type { HapticCue } from './nav';

/**
 * Turn cues you can feel with the phone in a pocket: one tap for a left-ish
 * turn, two for a right-ish one, a success buzz on arrival or a discovery, a
 * warning when leaving the route. Best-effort (some devices have no motor).
 */

const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});

export function turnCue(cue: HapticCue): void {
  if (cue === 'left') void tap();
  else if (cue === 'right') {
    void tap();
    setTimeout(() => void tap(), 150);
  } else if (cue === 'arrive') success();
}

export function success(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function warning(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
