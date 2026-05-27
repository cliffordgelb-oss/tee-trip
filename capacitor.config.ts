import type { CapacitorConfig } from '@capacitor/cli'

// Capacitor config for the Tee Trip iOS wrapper.
//
// The web app is built into dist/ and copied into ios/App/App/public
// by `npx cap sync`. The native shell loads it as a static SPA, then
// our React code does all routing client-side.
//
// Bundle id matches what we register in Apple Developer + App Store
// Connect. Changing it later is painful — keep it stable.

const config: CapacitorConfig = {
  appId: 'app.teetrip',
  appName: 'Tee Trip',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
    // Background tinted to match the cream paper bg so the safe-area
    // strips don't flash white at the edges during navigations.
    backgroundColor: '#faf6ed',
  },
}

export default config
