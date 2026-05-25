import { Stack } from "expo-router";

export default function InviteLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: "EscrowApp",
        headerBackVisible: false,
        headerStyle: { backgroundColor: "#ffffff" },
        headerTitleStyle: { fontWeight: "bold" },
      }}
    />
  );
}
