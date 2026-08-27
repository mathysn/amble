import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Place } from '@amble/shared';
import { Screen } from '../src/components/Screen';
import { PinSmallIcon, ChevronLeftIcon } from '../src/components/icons';
import { Overline } from '../src/components/typography';
import { useGeoSearch } from '../src/api/hooks';
import { useStartPoint } from '../src/store/startPoint';
import { useDebouncedValue } from '../src/lib/useDebouncedValue';
import { colors } from '../src/theme';

/** 13 · Enter address — manual starting point via Nominatim search. */
export default function Address() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  // Nominatim allows ~1 request/sec — only search once typing pauses, not per keystroke.
  const debouncedQuery = useDebouncedValue(query, 450);
  const { data, isFetching, error } = useGeoSearch(debouncedQuery);
  const setStart = useStartPoint((s) => s.setStart);

  const choose = (p: Place) => {
    setStart({ lat: p.lat, lng: p.lng }, p.label, p.detail);
    router.back();
  };

  const results = data?.results ?? [];

  return (
    <Screen className="px-[22px]" edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-3 pt-2">
        <Pressable
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-full bg-paper-raised"
          style={{ borderWidth: 1, borderColor: 'rgba(46,43,38,0.08)' }}
        >
          <ChevronLeftIcon />
        </Pressable>
        <Text className="font-sans-medium text-[15px] text-ink">Starting point</Text>
      </View>

      <Overline className="mb-3 mt-7">Enter an address</Overline>
      <View
        className="flex-row items-center gap-3 rounded-panel bg-paper-raised p-4"
        style={{ borderWidth: 1.5, borderColor: colors.sage }}
      >
        <View className="h-2.5 w-2.5 rounded-full bg-sage" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          autoFocus
          placeholder="Street, place or postcode"
          placeholderTextColor="rgba(46,43,38,0.4)"
          className="flex-1 font-sans-medium text-[16px] text-ink"
          returnKeyType="search"
        />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" className="mt-2">
        {results.map((p, i) => (
          <Pressable
            key={`${p.lat},${p.lng},${i}`}
            onPress={() => choose(p)}
            className={`flex-row items-center gap-3.5 px-2 py-3.5 ${i === results.length - 1 ? '' : 'border-b border-ink/[0.08]'}`}
          >
            <PinSmallIcon />
            <View className="flex-1">
              <Text className="font-sans-medium text-[15px] text-ink">{p.label}</Text>
              {p.detail ? <Text className="font-sans text-[12px] text-ink/50">{p.detail}</Text> : null}
            </View>
          </Pressable>
        ))}
        {error ? (
          <Text className="px-2 py-4 font-sans text-[14px] text-ink/45">
            Search is busy right now — give it a moment and try again.
          </Text>
        ) : debouncedQuery.trim().length >= 3 && !isFetching && results.length === 0 ? (
          <Text className="px-2 py-4 font-sans text-[14px] text-ink/45">
            No places found for "{debouncedQuery}".
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
