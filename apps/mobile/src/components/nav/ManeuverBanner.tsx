import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native';
import type { Units } from '@amble/shared';
import { ManeuverIcon, type ManeuverKind } from '../ManeuverIcon';
import { Overline, Serif } from '../typography';
import { formatNavDistance } from '../../lib/format';
import { maneuverTitle, wayClause, type IndexedStep } from '../../lib/nav';
import type { NavStatus } from '../../hooks/useNavigation';
import { colors } from '../../theme';

type Props = {
  status: NavStatus;
  /** The upcoming maneuver and the one after it. */
  next: IndexedStep | null;
  then: IndexedStep | null;
  distToNextM: number | null;
  /** First step of the walk (says "Set off" rather than "Carry on"). */
  first: boolean;
  pointer: { bearing: number; distM: number } | null;
  /** Current map bearing: pointer arrows are drawn relative to it. */
  cameraBearing: number;
  hasNextCuriosity: boolean;
  /** False for an A→B walk: "the finish" rather than "home". */
  roundTrip: boolean;
  units: Units;
  onResume?: () => void;
  onFinish?: () => void;
  style?: ViewStyle;
};

const shadow: ViewStyle = {
  shadowColor: colors.ink,
  shadowOpacity: 0.22,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 6,
};

/**
 * The big instruction card at the top of the walk screen — Amble's take on a
 * nav banner: sage-dark for "follow this", ink for "something's different"
 * (finding you, rerouting, off the route, paused).
 */
export function ManeuverBanner(p: Props) {
  const { status, units } = p;
  const pointerRotate = p.pointer ? p.pointer.bearing - p.cameraBearing : 0;

  if (status === 'finding') {
    return (
      <Card tone="ink" style={p.style}>
        <IconBox>
          <ActivityIndicator color={colors.paper} />
        </IconBox>
        <Lines title="Finding you…" sub="Waiting for a GPS fix — step outside if you're indoors." />
      </Card>
    );
  }

  if (status === 'rerouting') {
    return (
      <Card tone="ink" style={p.style}>
        <IconBox>
          <ActivityIndicator color={colors.paper} />
        </IconBox>
        <Lines
          title="Finding a new way…"
          sub={p.roundTrip ? "Through what's left, back home." : "Through what's left, to your finish."}
        />
      </Card>
    );
  }

  if (status === 'paused') {
    return (
      <Card tone="ink" style={p.style}>
        <IconBox>
          <View className="flex-row gap-1.5">
            <View className="h-5 w-[5px] rounded-[2px] bg-paper" />
            <View className="h-5 w-[5px] rounded-[2px] bg-paper" />
          </View>
        </IconBox>
        <Lines title="Paused" sub="Guidance is resting." />
        {p.onResume && <Pill label="Resume" onPress={p.onResume} />}
      </Card>
    );
  }

  if (status === 'arrived') {
    return (
      <Card tone="sage" style={p.style}>
        <IconBox>
          <ManeuverIcon type={10} />
        </IconBox>
        <Lines
          title={p.roundTrip ? "You're back" : "You're here"}
          sub={p.roundTrip ? 'Right where you started.' : 'That was the interesting way.'}
        />
        {p.onFinish && <Pill label="Finish" onPress={p.onFinish} />}
      </Card>
    );
  }

  if (status === 'approach' || status === 'rejoin' || status === 'compass') {
    const title =
      status === 'approach'
        ? 'Head to the start'
        : status === 'rejoin'
          ? 'Back to your route'
          : p.hasNextCuriosity
            ? "Something's that way"
            : p.roundTrip
              ? 'Head home'
              : 'Head to the finish';
    const sub =
      status === 'approach'
        ? 'Your wander begins there.'
        : status === 'rejoin'
          ? "We'll find you a new way if you'd rather not."
          : 'No street directions on this one — just wander.';
    return (
      <Card tone={status === 'rejoin' ? 'ink' : 'sage'} style={p.style}>
        <IconBox>
          <ManeuverIcon type={(status === 'compass' ? 'compass' : 'rejoin') as ManeuverKind} rotate={pointerRotate} />
        </IconBox>
        <Lines
          distance={p.pointer ? formatNavDistance(p.pointer.distM, units) : undefined}
          title={title}
          sub={sub}
        />
      </Card>
    );
  }

  // navigating
  const next = p.next;
  if (!next) return null;
  const way = wayClause(next);
  return (
    <View style={p.style}>
      <Card tone="sage" flatBottom={!!p.then}>
        <IconBox>
          <ManeuverIcon type={next.type} size={44} />
        </IconBox>
        <Lines
          distance={p.distToNextM !== null ? formatNavDistance(p.distToNextM, units) : undefined}
          title={maneuverTitle(next, { first: p.first, roundTrip: p.roundTrip })}
          sub={way ? way.charAt(0).toUpperCase() + way.slice(1) : undefined}
        />
      </Card>
      {p.then && (
        <View
          className="flex-row items-center gap-2 self-start rounded-b-[14px] bg-sage px-3.5 py-2"
          style={shadow}
        >
          <Text className="font-sans-medium text-[13px] text-paper/85">Then</Text>
          <ManeuverIcon type={p.then.type} size={18} />
        </View>
      )}
    </View>
  );
}

function Card({
  tone,
  flatBottom = false,
  style,
  children,
}: {
  tone: 'sage' | 'ink';
  flatBottom?: boolean;
  style?: ViewStyle;
  children: ReactNode;
}) {
  return (
    <View
      style={[shadow, style]}
      className={`flex-row items-center gap-3.5 px-4 py-4 ${tone === 'sage' ? 'bg-sage-dark' : 'bg-ink'} ${
        flatBottom ? 'rounded-t-panel rounded-br-panel' : 'rounded-panel'
      }`}
    >
      {children}
    </View>
  );
}

function IconBox({ children }: { children: ReactNode }) {
  return <View className="h-[52px] w-[52px] items-center justify-center">{children}</View>;
}

function Lines({ distance, title, sub }: { distance?: string; title: string; sub?: string }) {
  return (
    <View className="flex-1">
      {distance && <Serif className="text-[30px] leading-[34px] text-paper">{distance}</Serif>}
      <Text className="font-sans-semibold text-[17px] leading-[22px] text-paper" numberOfLines={2}>
        {title}
      </Text>
      {sub && (
        <Text className="mt-0.5 font-sans text-[14px] leading-[19px] text-paper/75" numberOfLines={2}>
          {sub}
        </Text>
      )}
    </View>
  );
}

function Pill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="rounded-full bg-paper px-4 py-2.5">
      <Text className="font-sans-semibold text-[14px] text-ink">{label}</Text>
    </Pressable>
  );
}

/** The small caption shown above the banner while simulating (dev builds only). */
export function SimBadge() {
  return (
    <View className="self-center rounded-full bg-ink/80 px-3 py-1">
      <Overline tint="light">Simulated walk</Overline>
    </View>
  );
}
