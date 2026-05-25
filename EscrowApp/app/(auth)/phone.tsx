import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { supabase } from "@/lib/supabase";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function EmailScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleNext = async () => {
    if (!isValidEmail) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });

      if (error) {
        Alert.alert("Error", error.message);
        return;
      }

      router.push({
        pathname: "/(auth)/verify",
        params: { email },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="bg-background flex-1">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="px-6 pt-4">
          <Pressable onPress={() => router.back()}>
            <Text className="text-foreground text-2xl">&#x2715;</Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1 px-6 pt-8"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="pb-4"
        >
          <Text variant="h3" className="text-foreground mb-2 border-0">
            Your email address
          </Text>
          <Text variant="muted" className="mb-8 text-base">
            Your email is used to protect your account and for transaction
            notifications.
          </Text>

          <View className="gap-2">
            <Label nativeID="email-label">Email address</Label>
            <Input
              className="h-14 rounded-xl text-lg"
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoFocus
              value={email}
              onChangeText={setEmail}
              aria-labelledby="email-label"
            />
          </View>

          <Text variant="muted" className="mt-4 text-xs leading-5">
            {"By clicking \"Next\", we'll send a verification code to your email."}
          </Text>
        </ScrollView>

        <View className="px-6 pb-8">
          <Button
            size="lg"
            className="h-14 rounded-xl"
            onPress={handleNext}
            disabled={loading || !isValidEmail}
          >
            <Text className="text-primary-foreground text-base font-semibold">
              {loading ? "Sending..." : "Next"}
            </Text>
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
