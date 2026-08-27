import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Category } from '@amble/shared';
import { WALK_LENGTHS } from '@amble/shared';
import { Screen } from '../../src/components/Screen';
import { Button } from '../../src/components/Button';
import { TimeChip, CategoryChip } from '../../src/components/chips';
import { Overline, Serif } from '../../src/components/typography';
import { greeting } from '../../src/lib/format';
import { getCurrentIfGranted } from '../../src/lib/location';
import { reverseGeocode, useSettings } from '../../src/api/hooks';
import { useStartPoint } from '../../src/store/startPoint';
import { colors } from '../../src/theme';

const ALL_CATEGORIES: Category[] = ['niche', 'hidden', 'scenic'];

/** 03 · Set off — pick a length and begin a wander. */
export default function Home() {
  const router = useRouter();
  const { data: settings } = useSettings();
  const { coord, label, detail, setStart } = useStartPoint();

  const [minutes, setMinutes] = useState(30);
  const [categories, setCategories] = useState<Category[]>(['niche', 'hidden']);
  const [touchedMinutes, setTouchedMinutes] = useState(false);
  const [touchedCats, setTouchedCats] = useState(false);

  // Apply the user's saved defaults once they load (unless they've picked).
  useEffect(() => {
    if (!settings) return;
    if (!touchedMinutes) setMinutes(settings.defaultLength);
    if (!touchedCats) {
      const enabled = ALL_CATEGORIES.filter(
        (c) =>
          (c === 'niche' && settings.includeNiche) ||
          (c === 'hidden' && settings.includeHidden) ||
          (c === 'scenic' && settings.includeScenic),
      );
      if (enabled.length) setCategories(enabled);
    }
  }, [settings, touchedMinutes, touchedCats]);

  // Populate the start point silently if location is already granted.
  useEffect(() => {
    if (coord) return;
    getCurrentIfGranted().then(async (c) => {
      if (!c) return;
      try {
        const place = await reverseGeocode(c.lat, c.lng);
        setStart(c, place.label, place.detail);
      } catch {
        setStart(c, 'Current location');
      }
    });
  }, [coord, setStart]);

  const toggleCategory = (c: Category) => {
    setTouchedCats(true);
    setCategories((prev) =>
      prev.includes(c) ? (prev.length > 1 ? prev.filter((x) => x !== c) : prev) : [...prev, c],
    );
  };

  const canBegin = !!coord && categories.length > 0;

  const begin = () => {
    if (!coord) return router.push('/address');
    router.push({
      pathname: '/walk/finding',
      params: {
        lat: String(coord.lat),
        lng: String(coord.lng),
        minutes: String(minutes),
        categories: categories.join(','),
      },
    });
  };

  const hello = useMemo(() => greeting(), []);

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

        <Overline className="mb-3 mt-8">How long</Overline>
        <View className="flex-row gap-2.5">
          {WALK_LENGTHS.map((m) => (
            <TimeChip
              key={m}
              label={String(m)}
              selected={minutes === m}
              onPress={() => {
                setTouchedMinutes(true);
                setMinutes(m);
              }}
            />
          ))}
        </View>

        <Overline className="mb-3 mt-7">Starting from</Overline>
        <Pressable
          onPress={() => router.push('/address')}
          className="flex-row items-center gap-3 rounded-panel bg-paper-raised p-4"
          style={{ borderWidth: 1, borderColor: 'rgba(46,43,38,0.08)' }}
        >
          <View
            className="h-2.5 w-2.5 rounded-full bg-sage"
            style={{ shadowColor: colors.sage, shadowOpacity: 0.3, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } }}
          />
          <View className="flex-1">
            <Text className="font-sans-semibold text-[15px] text-ink">{label ?? 'Set a starting point'}</Text>
            <Text className="font-sans text-[13px] text-ink/50">
              {detail ?? (coord ? '' : 'Tap to choose where to begin')}
            </Text>
          </View>
          <Text className="font-sans-medium text-[13px] text-sage">Change</Text>
        </Pressable>

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
