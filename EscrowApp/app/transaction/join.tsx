import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/features/auth/auth-context";
import { supabase } from "@/lib/supabase";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";

export default function JoinTransactionScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      Alert.alert("Enter code", "Please enter a transaction code.");
      return;
    }

    if (!session?.user) return;

    setLoading(true);
    try {
      const { data: tx, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("transaction_code", trimmed)
        .single();

      if (error || !tx) {
        Alert.alert("Not found", "No transaction found with that code.");
        return;
      }

      if (tx.buyer_id === session.user.id) {
        Alert.alert("Invalid", "You created this transaction. Share the code with the seller.");
        return;
      }

      if (!["created", "seller_invited"].includes(tx.status)) {
        Alert.alert(
          "Transaction unavailable",
          "This transaction is no longer accepting a seller.",
        );
        return;
      }

      router.push({ pathname: "/transaction/[id]", params: { id: tx.id } });
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
        contentContainerClassName="pt-8 pb-8"
      >
        <Text className="text-foreground text-2xl font-bold mb-2">
          Join Transaction
        </Text>
        <Text className="text-muted-foreground text-base mb-8">
          Enter the transaction code shared by the buyer to view and accept the escrow.
        </Text>

        <View className="gap-2 mb-6">
          <Label nativeID="code-label">Transaction Code</Label>
          <Input
            aria-labelledby="code-label"
            className="h-14 rounded-xl text-lg tracking-widest"
            placeholder="e.g. TXN-A1B2C3"
            autoCapitalize="characters"
            autoCorrect={false}
            value={code}
            onChangeText={setCode}
          />
        </View>
      </ScrollView>

      <View className="px-6 pb-8">
        <Button
          size="lg"
          className="h-14 rounded-xl"
          onPress={handleJoin}
          disabled={loading || !code.trim()}
        >
          <Text className="text-primary-foreground text-base font-semibold">
            {loading ? "Looking up..." : "Find Transaction"}
          </Text>
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}
