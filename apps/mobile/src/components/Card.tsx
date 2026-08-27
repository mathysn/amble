import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { colors } from '../theme';

/** Soft raised paper card used for inputs, wells and grouped rows. */
export function Card({
  children,
  className = '',
  inset = true,
  style,
}: {
  children: ReactNode;
  className?: string;
  /** hairline inset border like the design's cards */
  inset?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        inset ? { borderWidth: 1, borderColor: 'rgba(46,43,38,0.06)' } : null,
        style,
      ]}
      className={`rounded-card bg-paper-raised ${className}`}
    >
      {children}
    </View>
  );
}

/** A floating card with a drop shadow (photo cards, discovery cards). */
export function FloatingCard({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          shadowColor: colors.ink,
          shadowOpacity: 0.1,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 6 },
        },
        style,
      ]}
      className={`overflow-hidden rounded-card bg-paper-raised ${className}`}
    >
      {children}
    </View>
  );
}
