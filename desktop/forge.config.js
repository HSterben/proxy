const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");

const path = require("path");

module.exports = {
  packagerConfig: {
    asar: true,
    name: "PROXY",
    executableName: "proxy",
    icon: path.join(__dirname, "..", "backend", "public", "Proxy-Icon-Light"), // .ico on Windows
    extraResource: [
      path.join(__dirname, "proxy-presets.json"),
      path.join(__dirname, "..", "backend", "public", "Proxy-Icon-Light.ico"),
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      // Public Windows installer: PROXY-Setup.exe + nupkg/RELEASES for auto-update
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "PROXY",
        authors: "Sterben",
        description: "PROXY - AI chat assistant",
        setupExe: "PROXY-Setup.exe",
        setupIcon: path.join(
          __dirname,
          "..",
          "backend",
          "public",
          "Proxy-Icon-Light.ico"
        ),
        ...(process.env.CERT_FILE && {
          certificateFile: process.env.CERT_FILE,
          certificatePassword: process.env.CERT_PASSWORD,
        }),
      },
    },
    {
      name: "@electron-forge/maker-msix",
      config: {
        logLevel: "warn",

        windowsKitVersion: process.env.WINDOWS_KIT_VERSION || "10.0.28000.0",

        ...(process.env.WINDOWS_KIT_PATH
          ? { windowsKitPath: process.env.WINDOWS_KIT_PATH }
          : {}),

        packageAssets: path.join(__dirname, "assets", "msix"),

        manifestVariables: {
          publisher: process.env.MSIX_PUBLISHER,
          publisherDisplayName: process.env.MSIX_PUBLISHER_DISPLAY_NAME,
          packageIdentity: process.env.MSIX_PACKAGE_IDENTITY,

          packageDisplayName: "PROXY AI",
          appDisplayName: "PROXY AI",
          packageDescription: "PROXY AI - chat assistant",

          packageMinOSVersion: "10.0.19041.0",
          packageMaxOSVersionTested: "10.0.28000.0",
        },

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
        // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
        // If you are familiar with Vite configuration, it will look really familiar.
        build: [
          {
            // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
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
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
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
