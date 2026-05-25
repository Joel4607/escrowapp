import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScreenLoader } from "@/components/screen-state";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/features/auth/auth-context";
import { useUserProfile } from "@/features/user/use-user-profile";
import { formatCurrency } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { useState } from "react";
import type { ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";

const DELIVERY_OPTIONS = [
  { label: "3 days", days: 3 },
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
];

const INSPECTION_OPTIONS = [1, 2, 3, 5, 7];

const CONDITIONS = ["new", "used", "refurbished"] as const;

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

const schema = z.object({
  item_name: z.string().min(1, "Item name is required").max(80),
  item_description: z.string().optional(),
  item_condition: z.enum(CONDITIONS).optional(),
  price: z
    .string()
    .min(1, "Price is required")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, {
      message: "Price must be greater than 0",
    }),
  seller_contact: z.string().min(1, "Seller contact is required"),
  delivery_days: z.number().min(1),
  inspection_period: z.number().min(1).max(14),
});

type FormData = z.infer<typeof schema>;

export default function CreateTransactionScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { profile, isLoading: profileLoading } = useUserProfile();
  const [loading, setLoading] = useState(false);
  const walletBalance = profile?.wallet_balance ?? 0;

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      item_name: "",
      item_description: "",
      seller_contact: "",
      delivery_days: 7,
      inspection_period: 2,
    },
  });

  const deliveryDays = watch("delivery_days");
  const inspectionPeriod = watch("inspection_period");
  const condition = watch("item_condition");

  const onSubmit = async (data: FormData) => {
    if (!session?.user) return;

    setLoading(true);
    try {
      const { data: tx, error } = await supabase
        .from("transactions")
        .insert({
          buyer_id: session.user.id,
          item_name: data.item_name,
          item_description: data.item_description ?? null,
          item_condition: data.item_condition ?? null,
          price: parseFloat(data.price),
          seller_contact: data.seller_contact,
          delivery_deadline: daysFromNow(data.delivery_days),
          inspection_period: data.inspection_period * 24, // convert days → hours for DB
          status: "created",
          terms_accepted_by_buyer: true,
        })
        .select()
        .single();

      if (error) {
        Alert.alert("Error", error.message);
        return;
      }

      router.replace({ pathname: "/transaction/[id]", params: { id: tx.id } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  if (profileLoading) {
    return <ScreenLoader message="Loading wallet..." />;
  }

  if (walletBalance <= 0) {
    return (
      <SafeAreaKeyboardView>
        <View className="flex-1 items-center justify-center px-6 gap-4">
          <View className="bg-accent/15 h-20 w-20 items-center justify-center rounded-full">
            <Text className="text-3xl">💰</Text>
          </View>
          <Text className="text-foreground text-xl font-bold text-center">
            Wallet is Empty
          </Text>
          <Text className="text-muted-foreground text-sm text-center px-4">
            You need funds in your wallet before creating a transaction.
            Your current balance is {formatCurrency(walletBalance)}.
          </Text>
          <Button
            size="lg"
            className="h-14 rounded-xl mt-2 w-full"
            onPress={() => router.replace("/(tabs)/wallet")}
          >
            <Text className="text-primary-foreground text-base font-semibold">
              Add Money to Wallet
            </Text>
          </Button>
          <Button
            variant="outline"
            className="rounded-xl w-full"
            onPress={() => router.back()}
          >
            <Text className="text-foreground font-medium">Go Back</Text>
          </Button>
        </View>
      </SafeAreaKeyboardView>
    );
  }

  return (
    <SafeAreaKeyboardView>
      <ScrollView
        className="flex-1 px-6"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="pb-8 pt-4 gap-5"
        showsVerticalScrollIndicator={false}
      >
        {/* Item Name */}
        <View className="gap-2">
          <Label nativeID="item-name-label">Item Name *</Label>
          <Controller
            control={control}
            name="item_name"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                aria-labelledby="item-name-label"
                className="h-14 rounded-xl"
                placeholder="e.g. iPhone 14 Pro"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />
          {errors.item_name && (
            <Text className="text-destructive text-xs">
              {errors.item_name.message}
            </Text>
          )}
        </View>

        {/* Description */}
        <View className="gap-2">
          <Label nativeID="desc-label">Description</Label>
          <Controller
            control={control}
            name="item_description"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                aria-labelledby="desc-label"
                className="h-20 rounded-xl"
                placeholder="Describe the item (optional)"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />
        </View>

        {/* Condition */}
        <View className="gap-2">
          <Text className="text-foreground font-medium text-sm">Condition</Text>
          <View className="flex-row gap-2">
            {CONDITIONS.map((c) => (
              <Pressable
                key={c}
                className={`flex-1 items-center rounded-xl py-3 border ${
                  condition === c
                    ? "bg-primary border-primary"
                    : "bg-secondary border-border"
                }`}
                onPress={() => setValue("item_condition", c)}
              >
                <Text
                  className={`text-sm font-medium capitalize ${
                    condition === c ? "text-primary-foreground" : "text-foreground"
                  }`}
                >
                  {c}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Price */}
        <View className="gap-2">
          <Label nativeID="price-label">Price (₵) *</Label>
          <Controller
            control={control}
            name="price"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                aria-labelledby="price-label"
                className="h-14 rounded-xl"
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />
          {errors.price && (
            <Text className="text-destructive text-xs">
              {errors.price.message}
            </Text>
          )}
        </View>

        {/* Seller Contact */}
        <View className="gap-2">
          <Label nativeID="seller-label">Seller Email *</Label>
          <Controller
            control={control}
            name="seller_contact"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                aria-labelledby="seller-label"
                className="h-14 rounded-xl"
                placeholder="seller@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />
          {errors.seller_contact && (
            <Text className="text-destructive text-xs">
              {errors.seller_contact.message}
            </Text>
          )}
        </View>

        {/* Delivery Deadline */}
        <View className="gap-2">
          <Text className="text-foreground font-medium text-sm">
            Delivery Deadline
          </Text>
          <View className="flex-row gap-2 flex-wrap">
            {DELIVERY_OPTIONS.map((opt) => (
              <Pressable
                key={opt.days}
                className={`rounded-xl px-4 py-3 border ${
                  deliveryDays === opt.days
                    ? "bg-primary border-primary"
                    : "bg-secondary border-border"
                }`}
                onPress={() => setValue("delivery_days", opt.days)}
              >
                <Text
                  className={`text-sm font-medium ${
                    deliveryDays === opt.days
                      ? "text-primary-foreground"
                      : "text-foreground"
                  }`}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text className="text-muted-foreground text-xs">
            Seller must deliver by {daysFromNow(deliveryDays ?? 7)}
          </Text>
        </View>

        {/* Inspection Period */}
        <View className="gap-2">
          <Text className="text-foreground font-medium text-sm">
            Inspection Period
          </Text>
          <View className="flex-row gap-2 flex-wrap">
            {INSPECTION_OPTIONS.map((days) => (
              <Pressable
                key={days}
                className={`rounded-xl px-4 py-3 border ${
                  inspectionPeriod === days
                    ? "bg-primary border-primary"
                    : "bg-secondary border-border"
                }`}
                onPress={() => setValue("inspection_period", days)}
              >
                <Text
                  className={`text-sm font-medium ${
                    inspectionPeriod === days
                      ? "text-primary-foreground"
                      : "text-foreground"
                  }`}
                >
                  {days}d
                </Text>
              </Pressable>
            ))}
          </View>
          <Text className="text-muted-foreground text-xs">
            You have {inspectionPeriod ?? 2} day(s) to inspect after delivery before funds are released
          </Text>
        </View>
      </ScrollView>

      <View className="px-6 pb-8 pt-4">
        <Button
          size="lg"
          className="h-14 rounded-xl"
          onPress={handleSubmit(onSubmit)}
          disabled={loading}
        >
          <Text className="text-primary-foreground text-base font-semibold">
            {loading ? "Creating..." : "Create Transaction"}
          </Text>
        </Button>
      </View>
    </SafeAreaKeyboardView>
  );
}

function SafeAreaKeyboardView({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="bg-background flex-1"
    >
      {children}
    </KeyboardAvoidingView>
  );
}
