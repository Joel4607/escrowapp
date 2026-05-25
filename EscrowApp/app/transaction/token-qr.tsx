import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Share, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TokenQRScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();

  const handleCopy = () => {
    Share.share({ message: token ?? "" });
  };

  return (
    <SafeAreaView className="bg-background flex-1">
      <ScrollView
        className="flex-1 px-6"
        contentContainerClassName="pt-8 pb-8 items-center"
      >
        <Text className="text-foreground text-xl font-bold mb-2 text-center">
          Share this token with the buyer
        </Text>
        <Text className="text-muted-foreground text-base mb-10 text-center">
          The buyer enters this code to confirm they received the item. Keep it
          safe until handoff.
        </Text>

        {/* Token display */}
        <View className="bg-secondary rounded-2xl px-8 py-10 w-full items-center mb-6">
          <Text
            selectable
            className="text-foreground text-3xl font-bold tracking-widest text-center"
          >
            {token}
          </Text>
        </View>

        <Text className="text-muted-foreground text-sm text-center mb-8">
          This token expires in 24 hours.
        </Text>

        <Button
          size="lg"
          className="w-full h-14 rounded-xl mb-4"
          onPress={handleCopy}
        >
          <Text className="text-primary-foreground text-base font-semibold">
            Share Token
          </Text>
        </Button>

        <Button
          variant="outline"
          size="lg"
          className="w-full h-14 rounded-xl"
          onPress={() => router.back()}
        >
          <Text className="text-foreground text-base font-semibold">Done</Text>
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}
