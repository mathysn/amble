import { useEffect, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { colors } from '../../theme';

const SPRING = { damping: 24, stiffness: 240, mass: 0.9 };

type Props = {
  /** Visible height when collapsed (includes the bottom safe area). */
  collapsedHeight: number;
  expandedHeight: number;
  bottomInset: number;
  /** Draggable summary (tap or drag to open/close). */
  grab: ReactNode;
  /** Always visible below the grab area, not draggable (buttons live here). */
  peek?: ReactNode;
  /** Scrollable content revealed when expanded. */
  children: ReactNode;
};

/**
 * A two-position bottom sheet: a compact summary over the map, pulled up for the
 * full list of directions. Only the `grab` area takes the pan/tap gesture, so the
 * sheet's buttons and its scrolling list never fight it. Animated entirely on
 * the UI thread (Reanimated), styled with `style` rather than className.
 */
export function NavSheet({ collapsedHeight, expandedHeight, bottomInset, grab, peek, children }: Props) {
  const range = Math.max(0, expandedHeight - collapsedHeight);
  // 0 = fully open; `range` = collapsed
  const y = useSharedValue(range);
  const from = useSharedValue(range);

  useEffect(() => {
    y.value = range;
  }, [range, y]);

  const pan = Gesture.Pan()
    .onStart(() => {
      from.value = y.value;
    })
    .onUpdate((e) => {
      y.value = Math.min(range, Math.max(0, from.value + e.translationY));
    })
    .onEnd((e) => {
      const open = e.velocityY < -400 || (e.velocityY <= 400 && y.value < range / 2);
      y.value = withSpring(open ? 0 : range, SPRING);
    });
  const tap = Gesture.Tap().onEnd(() => {
    y.value = withSpring(y.value > range / 2 ? 0 : range, SPRING);
  });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: expandedHeight,
          backgroundColor: colors.paperRaised,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          shadowColor: colors.ink,
          shadowOpacity: 0.16,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: -6 },
          elevation: 12,
        },
        sheetStyle,
      ]}
    >
      <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
        <View className="px-5 pt-2.5">
          <View className="mx-auto mb-3 h-[5px] w-10 rounded-[3px] bg-ink/[0.18]" />
          {grab}
        </View>
      </GestureDetector>
      {peek && <View className="px-5">{peek}</View>}
      <ScrollView
        className="mt-2 flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomInset + 16 }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
}
