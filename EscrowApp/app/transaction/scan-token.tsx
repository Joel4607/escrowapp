import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/features/auth/auth-context";
import { supabase } from "@/lib/supabase";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";

export default function ScanTokenScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    const trimmedToken = token.trim().toUpperCase();
    if (!trimmedToken) {
      Alert.alert("Enter token", "Please enter the delivery token.");
      return;
    }

    if (!session?.user || !id) return;

    setLoading(true);
    try {
      const { error } = await supabase.rpc("confirm_delivery", {
        p_transaction_id: id,
        p_token: trimmedToken,
      });

      if (error) {
        Alert.alert("Error", error.message);
        return;
      }

      Alert.alert(
        "Delivery confirmed",
        "You've confirmed receipt of the item. You now have time to inspect it before releasing funds.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="bg-background flex-1"
    >
      <ScrollView
        className="flex-1 px-6"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="pt-8 pb-8 gap-6"
      >
        <View>
          <Text className="text-foreground text-2xl font-bold mb-2">
            Confirm Delivery
          </Text>
          <Text className="text-muted-foreground text-base">
            Enter the delivery token provided by the seller to confirm you
            received the item.
          </Text>
        </View>

        <View className="gap-2">
          <Label nativeID="token-label">Delivery Token</Label>
          <Input
            aria-labelledby="token-label"
            className="h-14 rounded-xl text-lg tracking-widest"
            placeholder="e.g. AB12CD34EF56"
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            value={token}
            onChangeText={(t) => setToken(t.toUpperCase())}
          />
        </View>
      </ScrollView>

      <View className="px-6 pb-8">
        <Button
          size="lg"
          className="h-14 rounded-xl"
          onPress={handleConfirm}
          disabled={loading || !token.trim()}
        >
          <Text className="text-primary-foreground text-base font-semibold">
            {loading ? "Confirming..." : "Confirm Receipt"}
          </Text>
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}
