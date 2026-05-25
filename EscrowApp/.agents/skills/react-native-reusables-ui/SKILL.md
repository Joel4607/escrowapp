---
name: react-native-reusables-ui
description: Use when creating, editing, redesigning, or reviewing UI in this Expo React Native escrow app, especially screens, forms, product cards, dialogs, tabs, menus, status views, and reusable components.
---

# React Native Reusables UI

## Core Rule

Use the installed React Native Reusables components before creating custom UI primitives or installing another UI library.

Prefer imports from `@/components/ui/*` for app UI:

- `button`, `text`, `input`, `textarea`, `label`
- `card`, `badge`, `avatar`, `skeleton`, `separator`
- `checkbox`, `switch`, `radio-group`, `toggle`, `toggle-group`
- `dialog`, `alert-dialog`, `dropdown-menu`, `select`, `popover`, `tooltip`
- `tabs`, `progress`, `alert`, `aspect-ratio`, `collapsible`

## Workflow

1. Check whether a needed UI primitive already exists in `components/ui`.
2. Compose screens from those primitives and NativeWind `className` styling.
3. Use `cn` from `@/lib/utils` for variants or conditional classes.
4. Use `lucide-react-native` icons through `components/ui/icon` when icons are needed.
5. Keep new shared UI primitives in `components/ui`; keep feature-specific composition near the screen or feature folder.
6. Do not add another UI library unless React Native Reusables cannot reasonably cover the need.

## Escrow App Defaults

For product escrow flows, favor these primitives:

- Listings and order summaries: `Card`, `Badge`, `AspectRatio`, `Avatar`, `Separator`
- Forms: `Label`, `Input`, `Textarea`, `Checkbox`, `RadioGroup`, `Select`, `Button`
- Transaction status: `Progress`, `Badge`, `Alert`, `Skeleton`
- Confirmations and disputes: `Dialog`, `AlertDialog`, `Textarea`, `Button`
- Account and actions: `DropdownMenu`, `Tabs`, `Switch`, `Popover`, `Tooltip`

## Verification

After UI changes, run:

```powershell
npx tsc --noEmit
npm run lint
npx expo-doctor
```

If NativeWind, Metro, or Reusables config changes, also run:

```powershell
npx expo export -p web --clear
```
