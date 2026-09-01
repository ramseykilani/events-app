export default {
  expo: {
    name: "Events",
    slug: "events-app",
    version: "0.1.0",
    scheme: "events-app",
    orientation: "portrait",
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
      bundleIdentifier: "com.rkilani.events",
      supportsTablet: true,
      infoPlist: {
        NSContactsUsageDescription:
          "Events uses your contacts so you can pick who to text when you share.",
        UIBackgroundModes: ["remote-notification"],
        // HTTPS-only; skips the App Store Connect encryption questionnaire
        // so TestFlight can start without a manual export-compliance click.
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
      permissions: ["READ_CONTACTS"],
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        monochromeImage: "./assets/adaptive-icon.png",
        // Paper background — Colors.paper.background
        backgroundColor: "#faf7f0",
      },
      edgeToEdgeEnabled: false,
      predictiveBackGestureEnabled: false,
      package: "com.rkilani.events",
    },
    web: {
      favicon: "./assets/favicon.png",
      // Must match Colors.paper.background — runtime applyWebBrowserChrome updates
      // the live theme-color meta when the user switches to Evening.
      themeColor: "#faf7f0",
    },
    plugins: [
      "@react-native-community/datetimepicker",
      [
        "expo-notifications",
        {
          icon: "./assets/notification-icon.png",
          // Paper ink — Colors.paper.textPrimary (tints the Android notification disc)
          color: "#1a1815",
          sounds: [],
        },
      ],
    ],
    extra: {
      eas: {
        projectId: "123707e0-991c-480e-ab06-15cbd903b650",
      },
    },
  },
};
