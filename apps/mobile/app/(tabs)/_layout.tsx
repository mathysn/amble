import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** The exact props expo-router hands its `tabBar` render prop. */
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];
import { BookmarkIcon, ClockIcon, SettingsIcon, WalkIcon } from '../../src/components/icons';
import { colors } from '../../src/theme';

const TABS: Record<string, { label: string; icon: (c: string) => React.ReactNode }> = {
  index: { label: 'Walk', icon: (c) => <WalkIcon color={c} /> },
  saved: { label: 'Saved', icon: (c) => <BookmarkIcon color={c} filled={c === colors.sage} /> },
  wanders: { label: 'Wanders', icon: (c) => <ClockIcon color={c} /> },
  settings: { label: 'Settings', icon: (c) => <SettingsIcon color={c} /> },
};

function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      className="flex-row border-t border-ink/10 bg-paper px-2 pt-2.5"
    >
      {state.routes.map((route, i) => {
        const meta = TABS[route.name];
        if (!meta) return null;
        const focused = state.index === i;
        const color = focused ? colors.sage : colors.ink40;
        return (
          <Pressable
            key={route.key}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            className="flex-1 items-center gap-1.5 py-1"
          >
            {meta.icon(color)}
            <Text
              style={{ color }}
              className={focused ? 'font-sans-semibold text-[10px]' : 'font-sans-medium text-[10px]'}
            >
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="saved" />
      <Tabs.Screen name="wanders" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
