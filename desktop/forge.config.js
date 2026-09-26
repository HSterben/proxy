const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");

const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");

const iconBase = path.join(__dirname, "assets", "icons", "Proxy-Icon-Light");

function generateMsixManifest() {
  execFileSync(process.execPath, [path.join(__dirname, "scripts", "generate-msix-manifest.mjs")], {
    cwd: __dirname,
    stdio: "inherit",
    env: process.env,
  });
  const manifestPath = path.join(__dirname, "assets", "msix", "AppxManifest.xml");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("MSIX AppxManifest.xml was not generated");
  }
  return manifestPath;
}

const osxSign =
  process.env.APPLE_IDENTITY || process.env.CSC_NAME
    ? {
        identity: process.env.APPLE_IDENTITY || process.env.CSC_NAME,
        "hardened-runtime": true,
        entitlements: path.join(__dirname, "build", "entitlements.mac.plist"),
        "entitlements-inherit": path.join(
          __dirname,
          "build",
          "entitlements.mac.plist",
        ),
        "signature-flags": "library",
      }
    : undefined;

const osxNotarize =
  process.env.APPLE_ID &&
  process.env.APPLE_APP_SPECIFIC_PASSWORD &&
  process.env.APPLE_TEAM_ID
    ? {
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
      }
    : undefined;

module.exports = {
  packagerConfig: {
    asar: true,
    name: "PROXY",
    executableName: "proxy",
    appBundleId: "com.getproxy.PROXY",
    appCategoryType: "public.app-category.productivity",
    icon: iconBase,
    // Windows unpackaged / Squirrel; MSIX also declares proxy:// in AppxManifest.
    protocols: [
      {
        name: "PROXY Auth",
        schemes: ["proxy"],
      },
    ],
    extraResource: [
      path.join(__dirname, "proxy-presets.json"),
      path.join(__dirname, "assets", "icons", "Proxy-Icon-Light.ico"),
      path.join(__dirname, "assets", "icons", "Proxy-Icon-Light.png"),
      path.join(__dirname, "assets", "icons", "Proxy-Icon-Light.icns"),
    ],
    extendInfo: {
      NSMicrophoneUsageDescription:
        "PROXY uses the microphone for speech-to-text dictation in chat.",
      CFBundleURLTypes: [
        {
          CFBundleURLName: "PROXY Auth",
          CFBundleURLSchemes: ["proxy"],
        },
      ],
    },
    ...(osxSign ? { osxSign } : {}),
    ...(osxNotarize ? { osxNotarize } : {}),
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-msix",
      config: {
        logLevel: "warn",
        appManifest: generateMsixManifest(),
        packageAssets: path.join(__dirname, "assets", "msix"),

        windowsKitVersion: process.env.WINDOWS_KIT_VERSION || "10.0.28000.0",

        ...(process.env.WINDOWS_KIT_PATH
          ? { windowsKitPath: process.env.WINDOWS_KIT_PATH }
          : {}),

        ...(process.env.CERT_FILE && {
          windowsSignOptions: {
            certificateFile: process.env.CERT_FILE,
            certificatePassword: process.env.CERT_PASSWORD,
          },
        }),
      },
      platforms: ["win32"],
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["win32"],
    },
    {
      name: "@electron-forge/maker-dmg",
      config: {
        name: "PROXY",
        title: "PROXY",
        icon: `${iconBase}.icns`,
        format: "ULFO",
      },
      platforms: ["darwin"],
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"],
    },
    {
      name: "@electron-forge/maker-deb",
      config: {},
      platforms: ["linux"],
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {},
      platforms: ["linux"],
    },
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "HSterben",
          name: "Proxy",
        },
        // update.electronjs.org ignores drafts and prereleases
        prerelease: false,
        draft: false,
      },
    },
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-vite",
      config: {
        build: [
          {
            entry: "src/main.js",
            config: "vite.main.config.mjs",
            target: "main",
          },
          {
            entry: "src/preload.js",
            config: "vite.preload.config.mjs",
            target: "preload",
          },
        ],
        renderer: [
          {
            name: "main_window",
            config: "vite.renderer.config.mjs",
          },
          {
            name: "message_window",
            config: "vite.renderer.config.mjs",
          },
          {
            name: "settings_window",
            config: "vite.renderer.config.mjs",
          },
        ],
      },
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
