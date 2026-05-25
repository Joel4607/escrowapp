---
name: safe-dependency-install
description: Use before installing, upgrading, removing, or configuring packages, libraries, CLIs, SDKs, native modules, Expo modules, or project dependencies in this codebase.
---

# Safe Dependency Install

## Core Rule

Before installing anything, verify the system and codebase have the prerequisites the install needs. Install or configure missing prerequisites when safe. If something cannot be handled inside the project, report the external step the user must complete.

## Pre-Install Checklist

1. Identify the project type, framework, and package manager from local files.
2. Read `package.json`, lockfiles, Expo config, TypeScript config, Metro/Babel config, and relevant docs.
3. Check existing dependencies and versions before adding new ones.
4. Verify runtime and tool versions when relevant: Node, npm, Expo SDK, React, React Native.
5. Check required peer dependencies, config files, native setup, and environment variables.
6. Prefer `npx expo install <package>` for Expo-managed native packages.
7. Prefer the existing package manager and lockfile style.
8. Avoid duplicate packages, incompatible major versions, and forced audit fixes that downgrade or break Expo.

## Install Flow

1. State what is being installed and why.
2. Install only missing or incompatible packages.
3. Add required config files or config edits when the docs require them.
4. Preserve unrelated user changes.
5. If a required external prerequisite is missing and cannot be installed here, stop and report the exact action needed.

## Verification

After dependency work, run the strongest relevant checks:

```powershell
npx expo install --fix
npx tsc --noEmit
npm run lint
npx expo-doctor
```

For UI, Metro, NativeWind, or web bundling changes, also run:

```powershell
npx expo export -p web --clear
```

Report any remaining audit warnings separately, especially when the suggested fix is breaking.
