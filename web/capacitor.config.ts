import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android app (design-android.md): the app build of the Angular app (`ng build --configuration
 * production,android`) inside the APK, its HTTP requests through Android's own network stack
 * (`CapacitorHttp`, "native requests"). The dev app ("release app and dev app") loads its pages
 * from the PC's `ng serve` instead when CAP_LIVE_RELOAD holds that address at `cap sync`
 * (e.g. http://192.168.1.20:4200); the CI never sets it.
 */
const liveReload = process.env['CAP_LIVE_RELOAD']?.trim();

const config: CapacitorConfig = {
  appId: 'io.github.reiettoayanami.substancetracker',
  appName: 'Substance tracker',
  webDir: 'dist/android/browser',
  plugins: {
    CapacitorHttp: { enabled: true },
    // The pages stay between the system bars (no edge-to-edge), whose icons are light on the dark app.
    SystemBars: { style: 'DARK' },
  },
  ...(liveReload ? { server: { url: liveReload } } : {}),
};

export default config;
