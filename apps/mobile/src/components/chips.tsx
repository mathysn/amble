import { Platform, Pressable, Text, View } from 'react-native';
import type { Category } from '@amble/shared';
import { colors } from '../theme';

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

/** A selectable walk-length chip: its name, and a few words about it. */
export function LengthChip({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={
        selected
          ? { shadowColor: colors.sage, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }
          : undefined
      }
      className={`flex-1 items-center rounded-[14px] py-3 ${selected ? 'bg-sage' : 'border border-ink/15'}`}
    >
      <Text
        className={`text-[16px] ${selected ? 'text-paper font-sans-semibold' : 'text-ink/75 font-sans-medium'}`}
      >
        {label}
      </Text>
      <Text className={`mt-0.5 font-sans text-[11px] ${selected ? 'text-paper/75' : 'text-ink/40'}`}>
        {hint}
      </Text>
    </Pressable>
  );
}

/** A selectable category chip ("niche" / "hidden" / "scenic"). */
export function CategoryChip({
  category,
  selected,
  onPress,
}: {
  category: Category;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center rounded-[12px] py-[11px] ${
        selected ? 'bg-sage/15' : 'border border-ink/15'
      }`}
    >
      <Text
        style={{ fontFamily: mono }}
        className={`text-[12px] ${selected ? 'text-sage-dark' : 'text-ink/40'}`}
      >
        {category}
      </Text>
    </Pressable>
  );
}

/** A small, static category label pill. */
export function CategoryTag({ category }: { category: Category }) {
  return (
    <View className="self-start rounded-[8px] bg-sage/15 px-[11px] py-[5px]">
      <Text style={{ fontFamily: mono }} className="text-[11px] text-sage-dark">
        {category}
      </Text>
    </View>
  );
}
