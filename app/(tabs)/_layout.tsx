import { Tabs } from 'expo-router';
import { View } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' }, // hide tab bar — we have our own nav
      }}
    >
      <Tabs.Screen name="index" />
    </Tabs>
  );
}
