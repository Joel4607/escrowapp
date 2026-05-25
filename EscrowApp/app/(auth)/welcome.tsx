import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ShieldCheck } from "lucide-react-native";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="bg-background flex-1">
      <View className="flex-1 items-center justify-center px-6">
        {/* Logo */}
        <View className="bg-primary/15 mb-6 h-28 w-28 items-center justify-center rounded-3xl border border-primary/30">
          <Icon as={ShieldCheck} className="text-primary" size={52} />
        </View>

        <Text className="text-foreground text-3xl font-bold mb-2 text-center">
          Secure Escrow
        </Text>
        <Text className="text-muted-foreground text-base text-center leading-6 px-4">
          Protect your money when buying and selling online. Pay safely, deliver
          with confidence.
        </Text>

        {/* Features */}
        <View className="mt-8 gap-3 w-full">
          {[
            { label: "Funds locked until delivery confirmed" },
            { label: "Dispute resolution by admin arbitrators" },
            { label: "Full evidence trail for every transaction" },
          ].map((feature) => (
            <View
              key={feature.label}
              className="flex-row items-center gap-3 bg-card border border-border rounded-xl px-4 py-3"
            >
              <View className="bg-primary/15 h-7 w-7 items-center justify-center rounded-lg">
                <View className="h-2 w-2 rounded-full bg-primary" />
              </View>
              <Text className="text-foreground text-sm flex-1">
                {feature.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View className="gap-3 px-6 pb-8">
        <Button
          size="lg"
          className="h-14 rounded-xl"
          onPress={() => router.push("/(auth)/phone")}
        >
          <Text className="text-primary-foreground text-base font-semibold">
            Sign up
          </Text>
        </Button>

        <Button
          variant="outline"
          size="lg"
          className="h-14 rounded-xl"
          onPress={() => router.push("/(auth)/login")}
        >
          <Text className="text-foreground text-base font-semibold">
            Log in
          </Text>
        </Button>
      </View>
    </SafeAreaView>
  );
}
