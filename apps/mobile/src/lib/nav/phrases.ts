import type { Units } from '@amble/shared';
import { MANEUVER } from './routeIndex';

/**
 * Amble's own wording for maneuvers — built from the ORS type code and street
 * name rather than reading ORS's instruction text, so the voice and banner share
 * one gentle tone ("Bear left onto…", "You're back where you started").
 */

type StepLike = { type: number | null; wayName: string | null; exitNumber?: number };

/** `first`: the walk's opening step. `roundTrip: false`: an A→B walk (arriving isn't "back"). */
export type PhraseOpts = { first?: boolean; roundTrip?: boolean };

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
const ordinal = (n: number) => ORDINALS[n - 1] ?? `${n}th`;

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The maneuver on its own, e.g. "Turn left", "Take the second exit". */
export function maneuverTitle(step: StepLike, opts: PhraseOpts = {}): string {
  switch (step.type) {
    case MANEUVER.left:
      return 'Turn left';
    case MANEUVER.right:
      return 'Turn right';
    case MANEUVER.sharpLeft:
      return 'Turn sharp left';
    case MANEUVER.sharpRight:
      return 'Turn sharp right';
    case MANEUVER.slightLeft:
      return 'Bear left';
    case MANEUVER.slightRight:
      return 'Bear right';
    case MANEUVER.straight:
      return 'Carry straight on';
    case MANEUVER.roundaboutEnter:
      return step.exitNumber ? `Take the ${ordinal(step.exitNumber)} exit` : 'Go round the roundabout';
    case MANEUVER.roundaboutExit:
      return 'Leave the roundabout';
    case MANEUVER.uTurn:
      return 'Turn around';
    case MANEUVER.arrive:
      return opts.roundTrip === false ? "You've arrived" : 'Back where you started';
    case MANEUVER.depart:
      return opts.first ? 'Set off' : 'Carry on';
    case MANEUVER.keepLeft:
      return 'Keep left';
    case MANEUVER.keepRight:
      return 'Keep right';
    default:
      return 'Carry on';
  }
}

/** The street clause: "onto Long Acre" for turns, "along Long Acre" when continuing. */
export function wayClause(step: StepLike): string {
  if (!step.wayName || step.type === MANEUVER.arrive) return '';
  const along = step.type === MANEUVER.straight || step.type === MANEUVER.depart;
  return `${along ? 'along' : 'onto'} ${step.wayName}`;
}

/** Full sentence, e.g. "Turn left onto Long Acre". */
export function maneuverPhrase(step: StepLike, opts: PhraseOpts = {}): string {
  const title = maneuverTitle(step, opts);
  if (step.type === MANEUVER.roundaboutEnter && step.exitNumber) {
    return `At the roundabout, ${lowerFirst(title)}${step.wayName ? ` onto ${step.wayName}` : ''}`;
  }
  const way = wayClause(step);
  return way ? `${title} ${way}` : title;
}

/** Spoken distance, rounded the way people say it: "60 metres", "250 yards". */
export function spokenDistance(m: number, units: Units): string {
  if (units === 'mi') {
    const yd = m * 1.09361;
    const r = yd < 100 ? Math.max(10, Math.round(yd / 10) * 10) : Math.round(yd / 50) * 50;
    return `${r} yards`;
  }
  const r = m < 100 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 50) * 50;
  return `${r} metres`;
}

/** "In 60 metres, turn left onto Long Acre." */
export function preparePhrase(step: StepLike, distM: number, units: Units, opts: PhraseOpts = {}): string {
  if (step.type === MANEUVER.arrive) {
    return opts.roundTrip === false
      ? `In ${spokenDistance(distM, units)}, you'll be there.`
      : `In ${spokenDistance(distM, units)}, you'll be back where you started.`;
  }
  return `In ${spokenDistance(distM, units)}, ${lowerFirst(maneuverPhrase(step))}.`;
}

/** "Turn left onto Long Acre, then bear right." */
export function nowPhrase(step: StepLike, then?: StepLike | null, opts: PhraseOpts = {}): string {
  if (step.type === MANEUVER.arrive) {
    return opts.roundTrip === false
      ? "You've arrived. Lovely wander."
      : "You're back where you started. Lovely wander.";
  }
  const main = maneuverPhrase(step);
  if (!then || then.type === MANEUVER.arrive) return `${main}.`;
  return `${main}, then ${lowerFirst(maneuverTitle(then))}.`;
}
