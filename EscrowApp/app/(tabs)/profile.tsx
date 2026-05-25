import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/features/auth/auth-context";
import { useUserProfile } from "@/features/user/use-user-profile";
import { useTransactionStats } from "@/features/transactions/use-transaction-stats";
import { formatCurrency } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import {
  Calendar,
  Check,
  Mail,
  Pencil,
  Phone,
  Shield,
  ShieldCheck,
  User,
  Wallet,
  Lock,
  X,
  LogOut,
} from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return email.charAt(0).toUpperCase();
}

function StatTile({
  label,
  value,
  isLoading,
}: {
  label: string;
  value: number;
  isLoading: boolean;
}) {
  return (
    <View className="flex-1 items-center gap-1">
      {isLoading ? (
        <Skeleton className="h-7 w-10 bg-muted" />
      ) : (
        <Text className="text-foreground text-xl font-bold">{value}</Text>
      )}
      <Text className="text-muted-foreground text-xs">{label}</Text>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center gap-3 py-2.5">
      <View className="bg-muted h-8 w-8 items-center justify-center rounded-lg">
        <Icon as={icon} className="text-muted-foreground" size={14} />
      </View>
      <View className="flex-1">
        <Text className="text-muted-foreground text-xs">{label}</Text>
        <Text className="text-foreground text-sm font-medium">{value}</Text>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const { profile, refetch } = useUserProfile();
  const { stats, isLoading: statsLoading } = useTransactionStats();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  const initials = getInitials(profile?.name ?? null, profile?.email ?? "U");
  const trustPercent = Math.min((profile?.trust_score ?? 100) / 100, 1) * 100;
  const memberSince = profile?.created_at
    ? format(new Date(profile.created_at), "MMMM yyyy")
    : "...";

  const handleStartEdit = () => {
    setEditName(profile?.name ?? "");
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditName("");
  };

  const handleSaveName = async () => {
    const trimmed = editName.trim();
    if (!trimmed) {
      Alert.alert("Invalid", "Name cannot be empty.");
      return;
    }
    if (!session?.user?.id) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({ name: trimmed })
        .eq("id", session.user.id);

      if (error) {
        Alert.alert("Error", error.message);
        return;
      }

      await refetch();
      setIsEditing(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      Alert.alert("Error", msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="bg-background flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-10"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="px-6 pt-4 pb-2">
          <Text className="text-foreground text-2xl font-bold">Profile</Text>
        </View>

        {/* Avatar + Info */}
        <View className="items-center px-6 pt-6 pb-4 gap-3">
          <View className="bg-primary/15 h-20 w-20 items-center justify-center rounded-2xl border border-primary/30">
            <Text className="text-primary text-2xl font-bold">
              {initials}
            </Text>
          </View>
          <View className="items-center gap-1">
            {isEditing ? (
              <View className="flex-row items-center gap-2">
                <Input
                  className="h-10 w-48 rounded-lg text-center text-base"
                  value={editName}
                  onChangeText={setEditName}
                  autoFocus
                  autoCapitalize="words"
                  maxLength={50}
                  onSubmitEditing={handleSaveName}
                />
                {saving ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <>
                    <Pressable
                      className="bg-primary h-8 w-8 items-center justify-center rounded-full"
                      onPress={handleSaveName}
                    >
                      <Icon
                        as={Check}
                        className="text-primary-foreground"
                        size={16}
                      />
                    </Pressable>
                    <Pressable
                      className="bg-muted h-8 w-8 items-center justify-center rounded-full"
                      onPress={handleCancelEdit}
                    >
                      <Icon as={X} className="text-foreground" size={16} />
                    </Pressable>
                  </>
                )}
              </View>
            ) : (
              <Pressable
                className="flex-row items-center gap-2"
                onPress={handleStartEdit}
              >
                <Text className="text-foreground text-xl font-bold">
                  {profile?.name ?? "Escrow User"}
                </Text>
                <Icon
                  as={Pencil}
                  className="text-muted-foreground"
                  size={14}
                />
              </Pressable>
            )}
            <Text className="text-muted-foreground text-sm">
              {profile?.email}
            </Text>
            <View className="flex-row items-center gap-1.5 mt-1 bg-primary/15 px-3 py-1 rounded-full">
              <View className="h-1.5 w-1.5 rounded-full bg-primary" />
              <Text className="text-primary text-xs font-medium capitalize">
                {profile?.role ?? "buyer"}
              </Text>
            </View>
          </View>
        </View>

        {/* Transaction Stats */}
        <View className="px-6 mt-2">
          <View className="bg-card border border-border rounded-2xl overflow-hidden">
            <View className="flex-row py-4">
              <StatTile
                label="Completed"
                value={stats.completed}
                isLoading={statsLoading}
              />
              <View className="w-px bg-border" />
              <StatTile
                label="Disputed"
                value={stats.disputed}
                isLoading={statsLoading}
              />
              <View className="w-px bg-border" />
              <StatTile
                label="Total"
                value={stats.total}
                isLoading={statsLoading}
              />
            </View>
          </View>
        </View>

        {/* Trust Score */}
        <View className="px-6 mt-4">
          <View className="bg-card border border-border rounded-2xl p-4 gap-3">
            <View className="flex-row items-center gap-2">
              <View className="bg-primary/15 h-8 w-8 items-center justify-center rounded-lg">
                <Icon as={ShieldCheck} className="text-primary" size={16} />
              </View>
              <Text className="text-foreground font-semibold">Trust Score</Text>
              <View className="flex-1" />
              <Text className="text-foreground font-bold text-lg">
                {profile?.trust_score ?? 100}/100
              </Text>
            </View>
            <Progress
              value={trustPercent}
              className="h-2.5"
              indicatorClassName="bg-primary"
            />
            <Text className="text-muted-foreground text-xs">
              Based on your transaction history, payment releases, and dispute
              behavior.
            </Text>
          </View>
        </View>

        {/* Account Details */}
        <View className="px-6 mt-4">
          <View className="bg-card border border-border rounded-2xl p-4">
            <View className="flex-row items-center gap-2 mb-2">
              <View className="bg-muted h-8 w-8 items-center justify-center rounded-lg">
                <Icon as={User} className="text-muted-foreground" size={16} />
              </View>
              <Text className="text-foreground font-semibold">Account Details</Text>
            </View>
            <DetailRow
              icon={Mail}
              label="Email"
              value={profile?.email ?? "..."}
            />
            <DetailRow
              icon={Phone}
              label="Phone"
              value={profile?.phone ?? "Not set"}
            />
            <DetailRow
              icon={Calendar}
              label="Member since"
              value={memberSince}
            />
            <DetailRow
              icon={Wallet}
              label="Available Balance"
              value={formatCurrency(profile?.wallet_balance ?? 0)}
            />
            <DetailRow
              icon={Lock}
              label="Locked in Escrow"
              value={formatCurrency(profile?.locked_balance ?? 0)}
            />
            <DetailRow
              icon={Shield}
              label="Verified"
              value={profile?.is_verified ? "Yes" : "No"}
            />
          </View>
        </View>

        {/* Sign Out */}
        <View className="px-6 mt-8">
          <Button
            variant="destructive"
            size="lg"
            className="h-14 rounded-xl flex-row gap-2"
            onPress={signOut}
          >
            <Icon as={LogOut} className="text-destructive-foreground" size={18} />
            <Text className="text-destructive-foreground text-base font-semibold">
              Sign Out
            </Text>
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
