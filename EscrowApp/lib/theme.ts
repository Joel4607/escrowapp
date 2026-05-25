import { DarkTheme, type Theme } from '@react-navigation/native';

/**
 * Dark-only theme matching the admin dashboard (mist style).
 * Using the same green primary, dark slate backgrounds, and muted tones.
 */
export const THEME = {
  dark: {
    background: 'hsl(220 20% 10%)',
    foreground: 'hsl(210 20% 95%)',
    card: 'hsl(220 16% 16%)',
    cardForeground: 'hsl(210 20% 95%)',
    popover: 'hsl(220 16% 16%)',
    popoverForeground: 'hsl(210 20% 95%)',
    primary: 'hsl(142 71% 45%)',
    primaryForeground: 'hsl(144 61% 10%)',
    secondary: 'hsl(220 14% 22%)',
    secondaryForeground: 'hsl(210 20% 95%)',
    muted: 'hsl(220 14% 22%)',
    mutedForeground: 'hsl(215 15% 60%)',
    accent: 'hsl(220 14% 22%)',
    accentForeground: 'hsl(210 20% 95%)',
    destructive: 'hsl(0 72% 51%)',
    destructiveForeground: 'hsl(210 20% 95%)',
    border: 'hsl(220 13% 20%)',
    input: 'hsl(220 13% 24%)',
    ring: 'hsl(142 71% 45%)',
    radius: '0.75rem',
  },
};

/** React Navigation theme — dark only */
export const NAV_THEME: Record<'light' | 'dark', Theme> = {
  light: {
    dark: true,
    fonts: DarkTheme.fonts,
    colors: {
      background: THEME.dark.background,
      border: THEME.dark.border,
      card: THEME.dark.card,
      notification: THEME.dark.destructive,
      primary: THEME.dark.primary,
      text: THEME.dark.foreground,
    },
  },
  dark: {
    dark: true,
    fonts: DarkTheme.fonts,
    colors: {
      background: THEME.dark.background,
      border: THEME.dark.border,
      card: THEME.dark.card,
      notification: THEME.dark.destructive,
      primary: THEME.dark.primary,
      text: THEME.dark.foreground,
    },
  },
};
