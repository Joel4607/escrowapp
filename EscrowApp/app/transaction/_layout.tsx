import { THEME } from "@/lib/theme";
import { Stack } from "expo-router";
import { Platform } from "react-native";

const colors = THEME.dark;

export default function TransactionLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: "Back",
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.foreground, fontWeight: "600" },
        headerStyle: {
          backgroundColor: colors.background,
          ...(Platform.OS === "android" ? { elevation: 0 } : {}),
        },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="create" options={{ title: "New Transaction" }} />
      <Stack.Screen name="[id]" options={{ title: "Transaction" }} />
      <Stack.Screen name="join" options={{ title: "Join Transaction" }} />
      <Stack.Screen
        name="token-qr"
        options={{ title: "Delivery Token", presentation: "modal" }}
      />
      <Stack.Screen
        name="scan-token"
        options={{ title: "Confirm Delivery" }}
      />
      <Stack.Screen
        name="dispute"
        options={{
          title: "Raise Dispute",
          headerTintColor: colors.destructive,
        }}
      />
    </Stack>
  );
}
