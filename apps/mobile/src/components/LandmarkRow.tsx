import { Pressable, Text, View } from 'react-native';
import type { Category } from '@amble/shared';
import { Mono, Serif } from './typography';

/** A numbered curiosity row used in the route list. */
export function LandmarkRow({
  order,
  name,
  category,
  last = false,
  onPress,
}: {
  order: number;
  name: string;
  category: Category;
  last?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className={`flex-row items-center gap-3.5 px-1.5 py-3.5 ${last ? '' : 'border-b border-ink/[0.09]'}`}
    >
      <Serif className="w-4 text-[13px] text-sage">{order}</Serif>
      <Text className="flex-1 font-sans-medium text-[15px] text-ink">{name}</Text>
      <Mono className="text-ink/40">{category}</Mono>
    </Pressable>
  );
}
