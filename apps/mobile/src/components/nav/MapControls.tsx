import type { ReactNode } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { OverviewIcon, RecenterIcon, SpeakerIcon, SpeakerOffIcon } from '../icons';
import { Mono } from '../typography';
import { colors } from '../../theme';

const floating: ViewStyle = {
  shadowColor: colors.ink,
  shadowOpacity: 0.14,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
};

function RoundButton({
  onPress,
  active = false,
  label,
  children,
}: {
  onPress: () => void;
  active?: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [floating, { opacity: pressed ? 0.85 : 1 }]}
      className={`h-11 w-11 items-center justify-center rounded-full ${active ? 'bg-ink' : 'bg-paper-raised'}`}
    >
      {children}
    </Pressable>
  );
}

/** The column of round map buttons on the walk screen's right edge. */
export function MapControls({
  threeD,
  onToggle3D,
  muted,
  onToggleMute,
  overview,
  onToggleOverview,
  simulating,
  onToggleSimulate,
  style,
}: {
  threeD: boolean;
  onToggle3D: () => void;
  muted: boolean;
  onToggleMute: () => void;
  overview: boolean;
  onToggleOverview: () => void;
  /** Dev builds only: replay a fake walk instead of GPS. */
  simulating?: boolean;
  onToggleSimulate?: () => void;
  style?: ViewStyle;
}) {
  return (
    <View style={style} className="gap-2.5">
      <RoundButton onPress={onToggle3D} label={threeD ? 'Switch to flat map' : 'Switch to 3D map'}>
        <Text className="font-sans-semibold text-[13px] text-ink">{threeD ? '2D' : '3D'}</Text>
      </RoundButton>
      <RoundButton onPress={onToggleMute} label={muted ? 'Turn voice on' : 'Mute voice'}>
        {muted ? <SpeakerOffIcon size={21} /> : <SpeakerIcon size={21} />}
      </RoundButton>
      <RoundButton onPress={onToggleOverview} active={overview} label="Show the whole route">
        <OverviewIcon size={21} color={overview ? colors.paper : colors.ink} />
      </RoundButton>
      {onToggleSimulate && (
        <RoundButton onPress={onToggleSimulate} active={simulating} label="Simulate a walk (dev)">
          <Mono className={simulating ? 'text-paper' : 'text-ink'}>SIM</Mono>
        </RoundButton>
      )}
    </View>
  );
}

/** Shown when the map isn't following the walker (after a pan, or in overview). */
export function RecenterPill({ onPress, style }: { onPress: () => void; style?: ViewStyle }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [floating, style, { opacity: pressed ? 0.85 : 1 }]}
      className="flex-row items-center gap-2 rounded-full bg-paper-raised px-4 py-2.5"
    >
      <RecenterIcon size={16} color={colors.sageDark} />
      <Text className="font-sans-semibold text-[14px] text-ink">Re-centre</Text>
    </Pressable>
  );
}
