# SixSense native app

Expo Router client for iOS, Android, and native-focused local development.

From the repository root:

```bash
npm install
cp apps/mobile/.env.example apps/mobile/.env.local
npm run dev:mobile
```

The native client consumes platform-neutral contracts from `@sixsense/domain`. Keep UI components inside this app; only reusable domain types and pure logic belong in shared packages.
