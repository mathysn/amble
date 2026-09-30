import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native';
import { colors } from '../theme';

type Variant = 'ink' | 'sage' | 'secondary' | 'light';
type Size = 'md' | 'sm';
type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  /** Drawn before the label (a 20-grid icon from icons.tsx). */
  icon?: ReactNode;
  /** Show only the icon, in a square button; `label` is still read out by screen readers. */
  iconOnly?: boolean;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  style?: ViewStyle;
};

const surface: Record<Variant, string> = {
  ink: 'bg-ink',
  sage: 'bg-sage',
  secondary: 'bg-paper-raised',
  light: 'bg-paper',
};

const text: Record<Variant, string> = {
  ink: 'text-paper font-sans-semibold',
  sage: 'text-paper font-sans-semibold',
  secondary: 'text-ink font-sans-semibold',
  light: 'text-ink font-sans-semibold',
};

const shadow: Record<Variant, ViewStyle> = {
  ink: { shadowColor: colors.ink, shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  sage: { shadowColor: colors.sage, shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  // A raised paper card: a hairline edge (which is all Android shows) and a soft lift.
  secondary: {
    borderWidth: 1,
    borderColor: 'rgba(46,43,38,0.1)',
    shadowColor: colors.ink,
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  light: {},
};

// Sizes are a plain style object on purpose: NativeWind drops a Pressable's `style`
// when it's a function, and a size must never depend on a className variant.
const sizes: Record<Size, { box: ViewStyle; square: ViewStyle; text: string }> = {
  md: {
    box: { minHeight: 58, paddingVertical: 17, paddingHorizontal: 20 },
    square: { width: 58, height: 58 },
    text: 'text-[16px]',
  },
  sm: {
    box: { minHeight: 48, paddingVertical: 13, paddingHorizontal: 16 },
    square: { width: 48, height: 48 },
    text: 'text-[15px]',
  },
};

/**
 * Amble's buttons: filled `ink` / `sage` for the main action, `secondary`
 * (raised paper) beside or below it, `light` on dark or sage backgrounds. Every
 * variant has the same height per `size` (`iconOnly` makes it a square of that
 * height, for a secondary action beside a wide one), and loading keeps the button's size
 * (the label stays, invisible, under the spinner) so rows don't jump.
 */
export function Button({
  label,
  onPress,
  variant = 'ink',
  size = 'md',
  icon,
  iconOnly = false,
  disabled,
  loading,
  className = '',
  style,
}: Props) {
  const spinnerColor = variant === 'secondary' || variant === 'light' ? colors.ink : colors.paper;
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={[
        shadow[variant],
        iconOnly ? sizes[size].square : sizes[size].box,
        { opacity: disabled ? 0.45 : pressed ? 0.88 : 1 },
        style,
      ]}
      className={`items-center justify-center rounded-cta ${surface[variant]} ${className}`}
    >
      <View className="flex-row items-center gap-2" style={{ opacity: loading ? 0 : 1 }}>
        {icon}
        {iconOnly ? null : (
          <Text className={`${sizes[size].text} ${text[variant]}`} numberOfLines={1}>
            {label}
          </Text>
        )}
      </View>
      {loading ? (
        <View className="absolute inset-0 items-center justify-center">
          <ActivityIndicator color={spinnerColor} />
        </View>
      ) : null}
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
