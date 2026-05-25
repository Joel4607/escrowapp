import { Text } from "@/components/ui/text";
import { X } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Pressable,
  View,
} from "react-native";
import { useState } from "react";

type Props = {
  visible: boolean;
  imageUrl: string | null;
  caption?: string;
  onClose: () => void;
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } =
  Dimensions.get("window");

export function ImageViewerModal({
  visible,
  imageUrl,
  caption,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(true);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black">
        {/* Close button */}
        <Pressable
          className="absolute top-14 right-5 z-10 bg-white/20 h-10 w-10 items-center justify-center rounded-full"
          onPress={onClose}
        >
          <Icon as={X} className="text-white" size={22} />
        </Pressable>

        {/* Image */}
        <View className="flex-1 items-center justify-center">
          {loading && (
            <ActivityIndicator
              size="large"
              color="#ffffff"
              style={{ position: "absolute" }}
            />
          )}
          {imageUrl && (
            <Image
              source={{ uri: imageUrl }}
              style={{
                width: SCREEN_WIDTH,
                height: SCREEN_HEIGHT * 0.75,
              }}
              resizeMode="contain"
              onLoadEnd={() => setLoading(false)}
            />
          )}
        </View>

        {/* Caption */}
        {caption && (
          <View className="px-6 pb-10 pt-3">
            <Text className="text-white text-sm text-center">{caption}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}
