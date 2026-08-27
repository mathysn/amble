import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

/** Paper-backed screen container with safe-area padding. */
export function Screen({
  children,
  className = '',
  edges = ['top', 'bottom'],
  color = 'bg-paper',
}: {
  children: ReactNode;
  className?: string;
  edges?: Edge[];
  color?: string;
}) {
  return (
    <SafeAreaView edges={edges} className={`flex-1 ${color}`}>
      <View className={`flex-1 ${className}`}>{children}</View>
    </SafeAreaView>
  );
}
