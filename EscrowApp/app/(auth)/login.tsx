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

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleLogin = async () => {
    if (!isValidEmail) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }

    if (password.length < 8) {
      Alert.alert(
        "Invalid password",
        "Password must be at least 8 characters."
      );
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        Alert.alert("Login failed", error.message);
      }
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
            Welcome back
          </Text>
          <Text variant="muted" className="mb-8 text-base">
            Log in with your email and password.
          </Text>

          <View className="gap-5">
            <View className="gap-2">
              <Label nativeID="login-email-label">Email address</Label>
              <Input
                className="h-14 rounded-xl text-lg"
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoFocus
                value={email}
                onChangeText={setEmail}
                aria-labelledby="login-email-label"
              />
            </View>

            <View className="gap-2">
              <Label nativeID="login-password-label">Password</Label>
              <View className="relative">
                <Input
                  className="h-14 rounded-xl pr-16 text-lg"
                  placeholder="Enter password"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  aria-labelledby="login-password-label"
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
          </View>

          <Pressable
            className="mt-4"
            onPress={() => router.push("/(auth)/phone")}
          >
            <Text className="text-primary text-sm font-medium">
              Forgot password? Verify with email
            </Text>
          </Pressable>
        </ScrollView>

        <View className="px-6 pb-8">
          <Button
            size="lg"
            className="h-14 rounded-xl"
            onPress={handleLogin}
            disabled={loading || !isValidEmail || password.length < 8}
          >
            <Text className="text-primary-foreground text-base font-semibold">
              {loading ? "Logging in..." : "Log in"}
            </Text>
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
