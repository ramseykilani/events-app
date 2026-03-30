export default {
  expo: {
    name: "Events",
    slug: "events-app",
    version: "0.1.0",
    scheme: "events-app",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    ios: {
      bundleIdentifier: "com.rkilani.events",
      supportsTablet: true,
      infoPlist: {
        NSContactsUsageDescription:
          "Events needs access to your contacts to let you select people to share events with.",
        UIBackgroundModes: ["remote-notification"],
      },
    },
    android: {
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
      permissions: ["READ_CONTACTS"],
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: "com.rkilani.events",
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      "@react-native-community/datetimepicker",
      [
        "expo-notifications",
        {
          icon: "./assets/icon.png",
          color: "#ffffff",
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
