import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { CuriosityGridCard } from '../../src/components/CuriosityCard';
import { BookmarkIcon } from '../../src/components/icons';
import { Overline, Serif } from '../../src/components/typography';
import { useSaved } from '../../src/api/hooks';

/** 10 · Saved curiosities (with the 14 · empty state). */
export default function Saved() {
  const router = useRouter();
  const { data: saved, isLoading } = useSaved();

  const count = saved?.length ?? 0;
  const neighbourhoods = new Set((saved ?? []).map((s) => s.neighbourhood).filter(Boolean)).size;

  if (!isLoading && count === 0) {
    return (
      <Screen edges={['top']} className="px-7">
        <View className="pt-4">
          <Serif className="text-[32px]">Saved</Serif>
          <Text className="font-sans text-[13px] text-ink/50">Nothing here yet</Text>
        </View>
        <View className="flex-1 items-center justify-center px-3 pb-10">
          <View className="mb-6 h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-sage/15">
            <BookmarkIcon size={30} />
          </View>
          <Serif className="text-center text-[24px]">Nothing saved yet</Serif>
          <Text className="mt-3 text-center font-sans text-[15px] leading-[23px] text-ink/55">
            Tap the bookmark on any curiosity you pass and it'll be waiting for you here.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 16, paddingBottom: 24 }}>
        <Overline tint="sage">Your collection</Overline>
        <Serif className="mt-3 text-[32px]">Saved</Serif>
        <Text className="mb-5 font-sans text-[13px] text-ink/50">
          {count} {count === 1 ? 'curiosity' : 'curiosities'}
          {neighbourhoods > 0 ? ` · ${neighbourhoods} neighbourhood${neighbourhoods === 1 ? '' : 's'}` : ''}
        </Text>
        <View className="flex-row flex-wrap justify-between gap-y-3.5">
          {(saved ?? []).map((c) => (
            <CuriosityGridCard
              key={c.id}
              name={c.name}
              category={c.category}
              neighbourhood={c.neighbourhood}
              onPress={() => router.push(`/curiosity/${c.id}`)}
            />
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
