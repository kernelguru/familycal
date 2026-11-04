import '../src/lib/background'; // registriert den Hintergrund-Task (muss global geladen werden)
import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { StoreProvider } from '../src/lib/store';
import { registerBackgroundSync } from '../src/lib/background';
import { useTheme } from '../src/ui/theme';

function Navigation() {
  const t = useTheme();

  useEffect(() => {
    registerBackgroundSync();
    // Tippen auf eine Erinnerung öffnet den Termin
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const data = res.notification.request.content.data as { eventId?: string; occ?: string };
      if (data?.eventId) router.push({ pathname: '/event/[id]', params: { id: data.eventId, occ: data.occ || '' } });
    });
    return () => sub.remove();
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.accent,
          headerTitleStyle: { color: t.ink },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.bg },
          headerBackTitle: 'Zurück',
        }}
      >
        <Stack.Screen name="index" options={{ title: '', headerShown: true }} />
        <Stack.Screen name="login" options={{ title: 'Anmelden', headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ title: 'Familie' }} />
        <Stack.Screen name="event/[id]" options={{ title: 'Termin' }} />
        <Stack.Screen name="event/edit" options={{ title: 'Termin', presentation: 'modal' }} />
        <Stack.Screen name="settings/index" options={{ title: 'Einstellungen' }} />
        <Stack.Screen name="settings/family" options={{ title: 'Familie' }} />
        <Stack.Screen name="settings/notifications" options={{ title: 'Benachrichtigungen' }} />
        <Stack.Screen name="settings/webhook" options={{ title: 'Ziel', presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <StoreProvider>
      <Navigation />
    </StoreProvider>
  );
}
