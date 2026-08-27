import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Screen } from '../../src/components/Screen';
import { Button } from '../../src/components/Button';
import { PhotoBlock } from '../../src/components/PhotoBlock';
import { CategoryTag } from '../../src/components/chips';
import { BookmarkIcon, ChevronLeftIcon } from '../../src/components/icons';
import { Mono, Serif } from '../../src/components/typography';
import {
  useCuriosity,
  useSaved,
  useSaveCuriosity,
  useUnsaveCuriosity,
} from '../../src/api/hooks';

/** 08 · Landmark detail. */
export default function CuriosityDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: curiosity } = useCuriosity(id);
  const { data: saved } = useSaved();
  const save = useSaveCuriosity();
  const unsave = useUnsaveCuriosity();

  const isSaved = !!saved?.some((s) => s.id === id);
  const toggleSave = () => (isSaved ? unsave.mutate(id) : save.mutate(id));

  if (!curiosity) {
    return <Screen className="items-center justify-center"><Serif className="text-[20px] text-ink/40">Loading…</Serif></Screen>;
  }

  return (
    <View className="flex-1 bg-paper">
      <ScrollView contentContainerStyle={{ paddingBottom: 0 }} bounces={false}>
        <View>
          <PhotoBlock height={300} caption={`photo · ${curiosity.name.toLowerCase()}`} />
          <SafeAreaView edges={['top']} className="absolute left-0 right-0">
            <View className="flex-row justify-between px-5 pt-2">
              <RoundButton onPress={() => router.back()}>
                <ChevronLeftIcon />
              </RoundButton>
              <RoundButton onPress={toggleSave}>
                <BookmarkIcon size={18} filled={isSaved} />
              </RoundButton>
            </View>
          </SafeAreaView>
        </View>

        <View className="px-6 pt-5">
          <View className="flex-row items-center gap-2">
            <CategoryTag category={curiosity.category} />
            {curiosity.neighbourhood ? <Mono className="text-ink/40">{curiosity.neighbourhood}</Mono> : null}
          </View>
          <Serif className="mt-3.5 text-[32px] leading-[35px]">{curiosity.name}</Serif>
          <Text className="mt-3.5 font-sans text-[15px] leading-[25px] text-ink/60">{curiosity.blurb}</Text>

          <View className="mt-5 flex-row gap-6">
            <Stat value={curiosity.era ?? '—'} label="built" />
            <Stat value="Quiet" label="right now" />
            <Stat value={curiosity.neighbourhood ?? 'Nearby'} label="area" />
          </View>
        </View>
      </ScrollView>

      <SafeAreaView edges={['bottom']} className="bg-paper">
        <View className="flex-row gap-3 px-6 pb-3 pt-3.5">
          <Button
            label={isSaved ? 'Saved' : 'Save'}
            variant="outline"
            onPress={toggleSave}
            style={{ paddingHorizontal: 20 }}
          />
          <Button label="Take me there" className="flex-1" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    </View>
  );
}

function RoundButton({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      className="h-10 w-10 items-center justify-center rounded-full bg-paper/90"
    >
      {children}
    </Pressable>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View>
      <Serif className="text-[22px]">{value}</Serif>
      <Mono className="mt-0.5 text-ink/45">{label}</Mono>
    </View>
  );
}
