import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { AlertTriangle, RefreshCw } from "lucide-react-native";
import { ActivityIndicator, View } from "react-native";

export function ScreenLoader({ message = "Loading..." }: { message?: string }) {
  return (
    <View className="bg-background flex-1 items-center justify-center gap-3 px-6">
      <ActivityIndicator size="large" />
      <Text className="text-muted-foreground text-sm">{message}</Text>
    </View>
  );
}

export function ScreenError({
  message = "Something went wrong.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <View className="bg-background flex-1 items-center justify-center gap-4 px-6">
      <View className="bg-destructive/10 h-16 w-16 items-center justify-center rounded-full">
        <Icon as={AlertTriangle} className="text-destructive" size={28} />
      </View>
      <Text className="text-foreground text-lg font-semibold text-center">
        Oops!
      </Text>
      <Text className="text-muted-foreground text-sm text-center px-4">
        {message}
      </Text>
      {onRetry && (
        <Button
          variant="outline"
          className="mt-2 rounded-xl gap-2 flex-row"
          onPress={onRetry}
        >
          <Icon as={RefreshCw} className="text-foreground" size={16} />
          <Text className="text-foreground font-medium">Try Again</Text>
        </Button>
      )}
    </View>
  );
}
