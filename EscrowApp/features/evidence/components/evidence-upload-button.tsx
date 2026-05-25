import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { EvidenceType } from "@/features/evidence/use-evidence";
import * as ImagePicker from "expo-image-picker";
import { Camera, ImagePlus } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";

type Props = {
  onImageSelected: (uri: string, type: EvidenceType) => void;
  evidenceType: EvidenceType;
  label?: string;
  uploading?: boolean;
};

export function EvidenceUploadButton({
  onImageSelected,
  evidenceType,
  label = "Add Photo",
  uploading = false,
}: Props) {
  const [showOptions, setShowOptions] = useState(false);

  const requestPermission = async (
    type: "camera" | "gallery",
  ): Promise<boolean> => {
    if (type === "camera") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Camera access is required to take photos.",
        );
        return false;
      }
    } else {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Photo library access is required to select photos.",
        );
        return false;
      }
    }
    return true;
  };

  const handleCamera = async () => {
    setShowOptions(false);
    const granted = await requestPermission("camera");
    if (!granted) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      onImageSelected(result.assets[0].uri, evidenceType);
    }
  };

  const handleGallery = async () => {
    setShowOptions(false);
    const granted = await requestPermission("gallery");
    if (!granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: false,
      allowsMultipleSelection: false,
    });

    if (!result.canceled && result.assets[0]) {
      onImageSelected(result.assets[0].uri, evidenceType);
    }
  };

  const handlePress = () => {
    Alert.alert("Add Evidence Photo", "Choose how to add your photo", [
      { text: "Take Photo", onPress: handleCamera },
      { text: "Choose from Gallery", onPress: handleGallery },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <Button
      variant="outline"
      className="rounded-xl gap-2 flex-row"
      onPress={handlePress}
      disabled={uploading}
    >
      <Icon as={ImagePlus} className="text-primary" size={18} />
      <Text className="text-foreground font-medium">
        {uploading ? "Uploading..." : label}
      </Text>
    </Button>
  );
}
