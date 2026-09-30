import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { Category } from '@amble/shared';
import { lengthFor, WALK_LENGTHS } from '@amble/shared';
import { Screen } from '../../src/components/Screen';
import { Button } from '../../src/components/Button';
import { CategoryChip, LengthChip } from '../../src/components/chips';
import { Segmented } from '../../src/components/Segmented';
import { Overline, Serif } from '../../src/components/typography';
import { greeting } from '../../src/lib/format';
import { useSettings } from '../../src/api/hooks';
import { useStartPoint, type LocateStatus } from '../../src/store/startPoint';
import { colors } from '../../src/theme';

const ALL_CATEGORIES: Category[] = ['niche', 'hidden', 'scenic'];
const ENDINGS = [
  { value: 'here', label: 'Back here' },
  { value: 'elsewhere', label: 'Somewhere else' },
] as const;

/** What the "Starting from" card says while we look for the walker. */
const LOCATING_TEXT: Partial<Record<LocateStatus, { title: string; detail: string }>> = {
  idle: { title: 'Set a starting point', detail: 'Tap to choose where to begin' },
  locating: { title: 'Finding your location…', detail: 'This takes a few seconds' },
  denied: { title: 'Set a starting point', detail: 'Location is off — tap to choose an address' },
  failed: { title: 'Couldn’t find you', detail: 'Tap to choose an address or try again' },
};

/** 03 · Set off — pick a length, where to start and finish, and begin a wander. */
export default function Home() {
  const router = useRouter();
  const { data: settings } = useSettings();
  const { coord, label, detail, status, end, locate, clearEnd } = useStartPoint();

  const [minutes, setMinutes] = useState<number>(WALK_LENGTHS[1].minutes);
  const [categories, setCategories] = useState<Category[]>(['niche', 'hidden']);
  const [touchedLength, setTouchedLength] = useState(false);
  const [touchedCats, setTouchedCats] = useState(false);
  const [elsewhere, setElsewhere] = useState(!!end);

  // Apply the user's saved defaults once they load (unless they've picked).
  useEffect(() => {
    if (!settings) return;
    if (!touchedLength) setMinutes(lengthFor(settings.defaultLength).minutes);
    if (!touchedCats) {
      const enabled = ALL_CATEGORIES.filter(
        (c) =>
          (c === 'niche' && settings.includeNiche) ||
          (c === 'hidden' && settings.includeHidden) ||
          (c === 'scenic' && settings.includeScenic),
      );
      if (enabled.length) setCategories(enabled);
    }
  }, [settings, touchedLength, touchedCats]);

  // Find the walker as soon as the screen opens (quietly: no permission prompt here).
  useEffect(() => {
    if (status === 'idle') void locate();
  }, [status, locate]);

  const toggleCategory = (c: Category) => {
    setTouchedCats(true);
    setCategories((prev) =>
      prev.includes(c) ? (prev.length > 1 ? prev.filter((x) => x !== c) : prev) : [...prev, c],
    );
  };

  const chooseEnding = (v: (typeof ENDINGS)[number]['value']) => {
    if (v === 'here') {
      setElsewhere(false);
      clearEnd();
    } else {
      setElsewhere(true);
      if (!end) router.push('/address?for=end');
    }
  };

  const busy = status === 'locating' || status === 'naming';
  const canBegin = !!coord && !busy && categories.length > 0 && (!elsewhere || !!end);

  const begin = () => {
    if (!coord) return router.push('/address');
    router.push({
      pathname: '/walk/finding',
      params: {
        lat: String(coord.lat),
        lng: String(coord.lng),
        minutes: String(minutes),
        categories: categories.join(','),
        ...(elsewhere && end
          ? { endLat: String(end.coord.lat), endLng: String(end.coord.lng), endLabel: end.label }
          : {}),
      },
    });
  };

  const hello = useMemo(() => greeting(), []);
  const locating = status === 'ready' || status === 'naming' ? null : LOCATING_TEXT[status];
  const startTitle = locating?.title ?? label ?? 'Set a starting point';
  const startDetail =
    locating?.detail ?? (status === 'naming' ? 'Finding the street name…' : (detail ?? ''));

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 26, paddingTop: 16, paddingBottom: 28, flexGrow: 1 }}
      >
        <Overline tint="sage">{hello}</Overline>
        <Serif className="mt-3.5 text-[32px] leading-[37px]">Where shall we begin?</Serif>
        <Text className="mt-2.5 font-sans text-[15px] leading-[22px] text-ink/55">
          Pick a length. We'll take care of the wandering.
        </Text>

        <Overline className="mb-3 mt-8">How far</Overline>
        <View className="flex-row gap-2.5">
          {WALK_LENGTHS.map((l) => (
            <LengthChip
              key={l.id}
              label={l.label}
              hint={l.hint}
              selected={minutes === l.minutes}
              onPress={() => {
                setTouchedLength(true);
                setMinutes(l.minutes);
              }}
            />
          ))}
        </View>

        <Overline className="mb-3 mt-7">Starting from</Overline>
        <PlaceCard
          title={startTitle}
          detail={startDetail}
          action={busy ? null : 'Change'}
          pulsing={busy}
          onPress={() => router.push('/address')}
        />

        <Overline className="mb-3 mt-7">Ending</Overline>
        <Segmented options={ENDINGS} value={elsewhere ? 'elsewhere' : 'here'} onChange={chooseEnding} />
        {elsewhere && (
          <PlaceCard
            className="mt-2.5"
            title={end?.label ?? 'Choose where to finish'}
            detail={end?.detail ?? (end ? '' : 'We’ll wander there by the interesting way')}
            action={end ? 'Change' : 'Choose'}
            dotColor={colors.sageDark}
            onPress={() => router.push('/address?for=end')}
          />
        )}

        <Overline className="mb-3 mt-7">Show me</Overline>
        <View className="flex-row gap-2.5">
          {ALL_CATEGORIES.map((c) => (
            <CategoryChip
              key={c}
              category={c}
              selected={categories.includes(c)}
              onPress={() => toggleCategory(c)}
            />
          ))}
        </View>

        <View className="flex-1" />
        <Button label="Begin wandering" className="mt-8" disabled={!canBegin} onPress={begin} />
      </ScrollView>
    </Screen>
  );
}

/** A tappable place row: a dot (pulsing while we look), a name, a detail line, an action. */
function PlaceCard({
  title,
  detail,
  action,
  pulsing = false,
  dotColor = colors.sage,
  className = '',
  onPress,
}: {
  title: string;
  detail: string;
  action: string | null;
  pulsing?: boolean;
  dotColor?: string;
  className?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-panel bg-paper-raised p-4 ${className}`}
      style={{ borderWidth: 1, borderColor: 'rgba(46,43,38,0.08)' }}
    >
      <PulseDot color={dotColor} pulsing={pulsing} />
      <View className="flex-1">
        <Text className="font-sans-semibold text-[15px] text-ink">{title}</Text>
        {detail ? <Text className="font-sans text-[13px] text-ink/50">{detail}</Text> : null}
      </View>
      {action ? <Text className="font-sans-medium text-[13px] text-sage">{action}</Text> : null}
    </Pressable>
  );
}

/** The place dot; while locating, a soft ring breathes out from it. */
function PulseDot({ color, pulsing }: { color: string; pulsing: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (pulsing) t.value = withRepeat(withTiming(1, { duration: 1100 }), -1, false);
    else {
      cancelAnimation(t);
      t.value = 0;
    }
  }, [pulsing, t]);
  const ring = useAnimatedStyle(() => ({
    opacity: pulsing ? 0.45 * (1 - t.value) : 0,
    transform: [{ scale: 1 + t.value * 1.6 }],
  }));

  return (
    <View className="h-4 w-4 items-center justify-center">
      <Animated.View
        style={[{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: color }, ring]}
      />
      <View
        className="h-2.5 w-2.5 rounded-full"
        style={{
          backgroundColor: color,
          shadowColor: color,
          shadowOpacity: 0.3,
          shadowRadius: 5,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
    </View>
  );
}
