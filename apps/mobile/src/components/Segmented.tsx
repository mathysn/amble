import { Pressable, Text, View } from 'react-native';
import { colors } from '../theme';

export type SegmentedOption<T extends string> = { value: T; label: string };

/**
 * A row of mutually exclusive choices in one soft track, the chosen one lifted
 * on raised paper — for settings with a few named options (length, pace,
 * units, "back here / somewhere else"). Every option is visible and one tap
 * away, instead of cycling through values.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: readonly SegmentedOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      className={`flex-row rounded-[14px] bg-ink/[0.06] p-1 ${className}`}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            className={`flex-1 items-center justify-center rounded-[11px] py-2.5 ${selected ? 'bg-paper-raised' : ''}`}
            style={
              selected
                ? {
                    shadowColor: colors.ink,
                    shadowOpacity: 0.1,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: 1,
                  }
                : undefined
            }
          >
            <Text
              numberOfLines={1}
              className={`text-[14px] ${selected ? 'font-sans-semibold text-ink' : 'font-sans-medium text-ink/55'}`}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
