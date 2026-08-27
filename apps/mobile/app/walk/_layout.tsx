import { Stack } from 'expo-router';
import { colors } from '../../src/theme';

export default function WalkLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.paper },
        gestureEnabled: false,
      }}
    />
  );
}
