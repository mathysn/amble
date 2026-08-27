import { Pressable, Text, View } from 'react-native';
import type { Category } from '@amble/shared';
import { FloatingCard } from './Card';
import { PhotoBlock } from './PhotoBlock';
import { Mono, Serif } from './typography';

/** A grid card for a saved curiosity (photo over name + meta). */
export function CuriosityGridCard({
  name,
  category,
  neighbourhood,
  onPress,
}: {
  name: string;
  category: Category;
  neighbourhood?: string | null;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="w-[48%]">
      <FloatingCard style={{ shadowOpacity: 0.05 }}>
        <PhotoBlock height={96} />
        <View className="px-3 pb-3.5 pt-3">
          <Serif className="text-[16px]">{name}</Serif>
          <Mono className="mt-1 text-ink/40">
            {category}
            {neighbourhood ? ` · ${neighbourhood}` : ''}
          </Mono>
        </View>
      </FloatingCard>
    </Pressable>
  );
}
