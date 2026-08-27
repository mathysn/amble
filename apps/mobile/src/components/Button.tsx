import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native';
import { colors } from '../theme';

type Variant = 'ink' | 'sage' | 'outline' | 'light';
type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  style?: ViewStyle;
};

const surface: Record<Variant, string> = {
  ink: 'bg-ink',
  sage: 'bg-sage',
  outline: 'border border-ink/20',
  light: 'bg-paper',
};

const text: Record<Variant, string> = {
  ink: 'text-paper font-sans-medium',
  sage: 'text-paper font-sans-semibold',
  outline: 'text-ink font-sans-medium',
  light: 'text-ink font-sans-semibold',
};

const shadow: Record<Variant, ViewStyle> = {
  ink: { shadowColor: colors.ink, shadowOpacity: 0.24, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } },
  sage: { shadowColor: colors.sage, shadowOpacity: 0.3, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } },
  outline: {},
  light: {},
};

/** The primary CTA button, in the design's ink / sage / outline flavours. */
export function Button({
  label,
  onPress,
  variant = 'ink',
  disabled,
  loading,
  className = '',
  style,
}: Props) {
  const spinnerColor = variant === 'outline' || variant === 'light' ? colors.ink : colors.paper;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [shadow[variant], { opacity: disabled ? 0.5 : pressed ? 0.9 : 1 }, style]}
      className={`items-center justify-center rounded-cta py-[17px] ${surface[variant]} ${className}`}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <Text className={`text-[16px] ${text[variant]}`}>{label}</Text>
      )}
    </Pressable>
  );
}

/** A compact secondary button (e.g. "Save" / "Change" pairs). */
export function SmallButton({
  label,
  onPress,
  variant = 'sage',
}: {
  label: string;
  onPress?: () => void;
  variant?: 'sage' | 'outline';
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-[11px] px-4 py-[9px] ${variant === 'sage' ? 'bg-sage' : 'border border-ink/20'}`}
    >
      <Text
        className={`text-[13px] ${variant === 'sage' ? 'text-paper font-sans-semibold' : 'text-ink font-sans-medium'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A row of buttons sharing a line, with optional flex weighting. */
export function ButtonRow({ children }: { children: React.ReactNode }) {
  return <View className="flex-row gap-3">{children}</View>;
}
