/**
 * Dark-only color constants matching the admin dashboard theme.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#E8ECF0',
    background: '#161A1F',
    tint: '#34D399',
    icon: '#8A919A',
    tabIconDefault: '#6B7280',
    tabIconSelected: '#34D399',
  },
  dark: {
    text: '#E8ECF0',
    background: '#161A1F',
    tint: '#34D399',
    icon: '#8A919A',
    tabIconDefault: '#6B7280',
    tabIconSelected: '#34D399',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
