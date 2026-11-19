// I Love You — Expo config. Same shape as apps/events/app.config.js; the
// differences are the call stack (LiveKit + WebRTC config plugins, camera and
// microphone permissions, background audio) and the per-channel notification
// sounds.
const fs = require("fs");

// FCM config is the owner's (SETUP.md -> Push notifications). Until it exists
// the Android build simply has no FCM; nothing else depends on it.
const googleServicesFile =
  process.env.GOOGLE_SERVICES_JSON ??
  (fs.existsSync("./google-services.json") ? "./google-services.json" : undefined);

export default {
  expo: {
    name: "I Love You",
    slug: "iloveyou-app",
    version: "0.1.0",
    scheme: "iloveyou",
    orientation: "default",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      // Paper background — Colors.paper.background
      backgroundColor: "#faf7f0",
    },
    ios: {
      bundleIdentifier: "com.rkilani.iloveyou",
      supportsTablet: true,
      infoPlist: {
        NSCameraUsageDescription: "I Love You uses the camera for video calls with your partner.",
        NSMicrophoneUsageDescription: "I Love You uses the microphone for calls and voice notes with your partner.",
        NSPhotoLibraryUsageDescription: "I Love You lets you send photos to your partner.",
        // audio: a call keeps going when the screen locks; voip is not
        // claimed — there is no CallKit integration yet (FEATURES.md).
        UIBackgroundModes: ["remote-notification", "audio"],
        ITSAppUsesNonExemptEncryption: false,
      },
      entitlements: {
        // "Needs you now" pushes use the time-sensitive interruption level.
        "com.apple.developer.usernotifications.time-sensitive": true,
      },
    },
    android: {
      googleServicesFile,
      permissions: [
        "CAMERA",
        "RECORD_AUDIO",
        "MODIFY_AUDIO_SETTINGS",
        "BLUETOOTH_CONNECT",
        "POST_NOTIFICATIONS",
      ],
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        monochromeImage: "./assets/adaptive-icon.png",
        // Paper background — Colors.paper.background
        backgroundColor: "#faf7f0",
      },
      edgeToEdgeEnabled: false,
      predictiveBackGestureEnabled: false,
      package: "com.rkilani.iloveyou",
    },
    web: {
      favicon: "./assets/favicon.png",
      name: "I Love You",
      shortName: "I Love You",
      // Must match Colors.paper.background — runtime applyWebBrowserChrome updates
      // the live theme-color meta when the user switches to Evening.
      themeColor: "#faf7f0",
      backgroundColor: "#faf7f0",
      display: "standalone",
    },
    plugins: [
      "expo-router",
      [
        "expo-notifications",
        {
          icon: "./assets/notification-icon.png",
          // Paper ink — Colors.paper.textPrimary (tints the Android notification disc)
          color: "#1a1815",
          // notify_sound 'chime' (supabase/functions/_shared/notificationPayload.ts)
          sounds: ["./assets/sounds/chime.wav"],
        },
      ],
      [
        "expo-image-picker",
        { photosPermission: "I Love You lets you send photos to your partner." },
      ],
      [
        "expo-audio",
        { microphonePermission: "I Love You uses the microphone for calls and voice notes with your partner." },
      ],
      // LiveKit's documented Expo setup (docs.livekit.io -> Expo quickstart):
      // its plugin plus the WebRTC config plugin. A development build is
      // required — Expo Go has no WebRTC. Versions pinned for SDK 54 in
      // package.json (docs/i-love-you-design.md -> Calls).
      "@livekit/react-native-expo-plugin",
      "@config-plugins/react-native-webrtc",
    ],
    extra: {
      eas: {
        // Created by the owner: `eas init` in apps/i-love-you (SETUP.md -> EAS).
        projectId: process.env.ILY_EAS_PROJECT_ID,
      },
    },
  },
};
