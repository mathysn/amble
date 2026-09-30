import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '../src/components/Button';
import { CuriosityView } from '../src/components/CuriosityView';
import { BookmarkIcon } from '../src/components/icons';
import { useMarkFound, useSaveToggle, useWalk } from '../src/api/hooks';
import { colors } from '../src/theme';

/**
 * 07 · Discovery moment — the curiosity the walker has just reached, in full.
 * It only ever opens by proximity (see useNavigation), once per curiosity, and
 * being here is what counts: the find is recorded as soon as it's shown.
 */
export default function Discovery() {
  const router = useRouter();
  const { id, cid } = useLocalSearchParams<{ id: string; cid: string }>();
  const { data: walk } = useWalk(id);
  const markFound = useMarkFound();
  const { isSaved, toggle } = useSaveToggle(cid);

  const curiosity = walk?.curiosities.find((c) => c.id === cid);

  const recorded = useRef(false);
  const { mutate } = markFound;
  useEffect(() => {
    if (!curiosity || curiosity.found || recorded.current) return;
    recorded.current = true;
    mutate({ walkId: id, curiosityId: cid });
  }, [curiosity, id, cid, mutate]);

  if (!curiosity) return <View className="flex-1 bg-paper" />;

  return (
    <CuriosityView
      curiosity={curiosity}
      kicker="You found a curiosity"
      footer={
        <>
          <Button
            label={isSaved ? 'Remove from saved' : 'Save'}
            variant="secondary"
            iconOnly
            icon={<BookmarkIcon size={22} filled={isSaved} color={isSaved ? colors.sageDark : colors.ink} />}
            onPress={toggle}
          />
          <Button
            label="Keep wandering"
            variant="sage"
            className="flex-1"
            onPress={() => router.back()}
          />
        </>
      }
    />
  );
}
