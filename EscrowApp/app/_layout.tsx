import { AuthProvider, useAuth } from "@/features/auth/auth-context";
import { useNotifications } from "@/features/notifications/use-notifications";
import { queryClient } from "@/lib/query-client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@react-navigation/native";
import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "../global.css";
import "react-native-reanimated";

import { NAV_THEME } from "@/lib/theme";

export const unstable_settings = {
  anchor: "(tabs)",
};

function AppContent() {
  const { session } = useAuth();

  // Register push notifications when user is authenticated
  useNotifications();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="transaction" />
      <Stack.Screen name="invite" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={NAV_THEME.dark}>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
        <StatusBar style="light" />
        <PortalHost />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
