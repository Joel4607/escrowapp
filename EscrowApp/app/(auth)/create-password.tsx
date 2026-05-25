import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-context";
import { useLocalSearchParams, useRouter } from "expo-router";
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

function getPasswordStrength(password: string) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  return score;
}

function getStrengthLabel(score: number) {
  if (score <= 1) return "Weak";
  if (score <= 2) return "Fair";
  if (score <= 3) return "Good";
  if (score <= 4) return "Strong";
  return "Very strong";
}

function getStrengthColor(score: number) {
  if (score <= 1) return "bg-destructive";
  if (score <= 2) return "bg-orange-500";
  if (score <= 3) return "bg-yellow-500";
  return "bg-primary";
}

export default function CreatePasswordScreen() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const strength = getPasswordStrength(password);
  const strengthPercent = (strength / 5) * 100;

  const handleCreate = async () => {
    if (password.length < 8) {
      Alert.alert("Weak password", "Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (
        updateError &&
        !updateError.message.includes("should be different")
      ) {
        Alert.alert("Error", updateError.message);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "Could not retrieve your account.");
        return;
      }

      const { error: insertError } = await supabase.from("users").upsert(
        {
          id: user.id,
          email: user.email ?? email!,
          role: "buyer" as const,
          is_verified: true,
        },
        { onConflict: "id" },
      );

      if (insertError) {
        Alert.alert("Account Error", insertError.message);
        return;
      }

      await refreshProfile();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Something went wrong";
      Alert.alert("Unexpected Error", message);
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
            Create password
          </Text>
          <Text variant="muted" className="mb-8 text-base">
            Strong passwords keep your account safer.
          </Text>

          <View className="gap-2">
            <Label nativeID="password-label">Password</Label>
            <View className="relative">
              <Input
                className="h-14 rounded-xl pr-16 text-lg"
                placeholder="Enter password"
                secureTextEntry={!showPassword}
                autoFocus
                value={password}
                onChangeText={setPassword}
                aria-labelledby="password-label"
              />
              <Pressable
                className="absolute right-4 top-4"
                onPress={() => setShowPassword(!showPassword)}
              >
                <Text className="text-muted-foreground text-sm font-medium">
                  {showPassword ? "Hide" : "Show"}
                </Text>
              </Pressable>
            </View>
          </View>

          {password.length > 0 && (
            <View className="mt-4 gap-2">
              <Progress
                value={strengthPercent}
                className="h-2"
                indicatorClassName={getStrengthColor(strength)}
              />
              <Text variant="muted" className="text-sm">
                {getStrengthLabel(strength)}
                {strength >= 4 ? " — that would take a long time to crack" : ""}
              </Text>
            </View>
          )}
        </ScrollView>

        <View className="px-6 pb-8">
          <Button
            size="lg"
            className="h-14 rounded-xl"
            onPress={handleCreate}
            disabled={loading || password.length < 8}
          >
            <Text className="text-primary-foreground text-base font-semibold">
              {loading ? "Creating account..." : "Next"}
            </Text>
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
