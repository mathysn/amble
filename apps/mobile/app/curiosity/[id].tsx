import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Button } from '../../src/components/Button';
import { CuriosityView, PhotoButton } from '../../src/components/CuriosityView';
import { BookmarkIcon, ChevronLeftIcon } from '../../src/components/icons';
import { Serif } from '../../src/components/typography';
import { useCuriosity, useSaveToggle } from '../../src/api/hooks';
import { colors } from '../../src/theme';

/** 08 · Landmark detail — a curiosity already found, opened from Saved. */
export default function CuriosityDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: curiosity } = useCuriosity(id);
  const { isSaved, toggle } = useSaveToggle(id);

  if (!curiosity) {
    return (
      <Screen className="items-center justify-center">
        <Serif className="text-[20px] text-ink/40">Loading…</Serif>
      </Screen>
    );
  }

  return (
    <CuriosityView
      curiosity={curiosity}
      topLeft={
        <PhotoButton onPress={() => router.back()} label="Back">
          <ChevronLeftIcon />
        </PhotoButton>
      }
      footer={
        <>
          <Button
            label={isSaved ? 'Remove from saved' : 'Save'}
            variant="secondary"
            iconOnly
            icon={<BookmarkIcon size={22} filled={isSaved} color={isSaved ? colors.sageDark : colors.ink} />}
            onPress={toggle}
          />
          <Button label="Back" className="flex-1" onPress={() => router.back()} />
        </>
      }
    />
  );
}
