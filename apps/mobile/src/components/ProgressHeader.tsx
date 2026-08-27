import { View } from 'react-native';
import { Overline } from './typography';

/** Time-left + surprise counter with a thin progress bar. */
export function ProgressHeader({
  minutesLeft,
  found,
  total,
  progress,
  light = false,
}: {
  minutesLeft: number;
  found: number;
  total: number;
  progress: number; // 0..1
  light?: boolean;
}) {
  const tint = light ? 'light' : 'muted';
  return (
    <View>
      <View className="flex-row items-center justify-between">
        <Overline tint={tint}>{Math.max(0, minutesLeft)} min left</Overline>
        <Overline tint={tint}>
          surprise {found} / {total}
        </Overline>
      </View>
      <View className={`mt-3 h-1 rounded-full ${light ? 'bg-paper/25' : 'bg-ink/15'}`}>
        <View
          className={`h-1 rounded-full ${light ? 'bg-paper' : 'bg-sage'}`}
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      </View>
    </View>
  );
}
