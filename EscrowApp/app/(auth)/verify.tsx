import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { supabase } from "@/lib/supabase";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const RESEND_COOLDOWN = 60;

export default function VerifyScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(RESEND_COOLDOWN);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleVerify = async () => {
    if (!email || code.length !== 6) {
      Alert.alert("Invalid code", "Please enter the 6-digit code.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });

      if (error) {
        Alert.alert("Verification failed", error.message);
        return;
      }

      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .single();

      if (existingUser) {
        router.replace("/(tabs)");
      } else {
        router.push({
          pathname: "/(auth)/create-password",
          params: { email },
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });

      if (error) {
        Alert.alert("Error", error.message);
        return;
      }

      setResendTimer(RESEND_COOLDOWN);
    } finally {
      setResending(false);
    }
  };

  const maskedEmail = email
    ? email.replace(/(.{2})(.*)(@.*)/, "$1***$3")
    : "";

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
            Verify your email
          </Text>
          <Text variant="muted" className="mb-8 text-base">
            Enter the code sent to: {maskedEmail}
          </Text>

          <View className="gap-2">
            <Label nativeID="code-label">Security code</Label>
            <Input
              className="h-14 rounded-xl text-lg tracking-widest"
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              value={code}
              onChangeText={(val) => setCode(val.replace(/[^0-9]/g, ""))}
              aria-labelledby="code-label"
            />
          </View>

          <Text variant="muted" className="mt-4 text-sm">
            {resendTimer > 0 ? (
              `You can resend the code in ${resendTimer} seconds`
            ) : (
              <Text
                className="text-primary text-sm font-medium"
                onPress={resending ? undefined : handleResend}
              >
                {resending ? "Sending..." : "Resend code"}
              </Text>
            )}
          </Text>
        </ScrollView>

        <View className="px-6 pb-8">
          <Button
            size="lg"
            className="h-14 rounded-xl"
            onPress={handleVerify}
            disabled={loading || code.length !== 6}
          >
            <Text className="text-primary-foreground text-base font-semibold">
              {loading ? "Verifying..." : "Next"}
            </Text>
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
