const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");

const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");

const iconBase = path.join(__dirname, "assets", "icons", "Proxy-Icon-Light");

/** Load desktop/.env into process.env (does not override already-set vars). */
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

loadEnvFile(path.join(__dirname, ".env.local"));
loadEnvFile(path.join(__dirname, ".env"));

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

/**
 * Store packages use Partner Center publisher CN=GUID. Auto-generated local
 * certs often fail SignTool (0x8007000b) against that identity. Default to
 * unsigned MSIX for Store upload; Partner Center re-signs. Set CERT_FILE +
 * CERT_PASSWORD to sign locally (subject must exactly match MSIX_PUBLISHER).
 */
function msixSignConfig() {
  const certFile = process.env.CERT_FILE || process.env.WINDOWS_CERTIFICATE_FILE;
  const certPassword =
    process.env.CERT_PASSWORD || process.env.WINDOWS_CERTIFICATE_PASSWORD;
  const forceSign = process.env.MSIX_SIGN === "1" || process.env.MSIX_SIGN === "true";

  if (certFile) {
    return {
      sign: true,
      windowsSignOptions: {
        certificateFile: certFile,
        certificatePassword: certPassword,
        hashes: ["sha256"],
      },
    };
  }

  if (forceSign) {
    // Dev cert will be created to match AppxManifest Publisher.
    return {
      sign: true,
      windowsSignOptions: {
        hashes: ["sha256"],
      },
    };
  }

  console.log(
    "[msix] Building unsigned package (no CERT_FILE). Partner Center will sign Store uploads. Set CERT_FILE/CERT_PASSWORD or MSIX_SIGN=1 for a local signature."
  );
  return { sign: false };
}

/** Newest installed Windows 10 SDK bin folder that has MakeAppx.exe (x64). */
function resolveWindowsKitVersion() {
  if (process.env.WINDOWS_KIT_VERSION) return process.env.WINDOWS_KIT_VERSION;
  const kitRoot = path.join(
    process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
    "Windows Kits",
    "10",
    "bin",
  );
  if (!fs.existsSync(kitRoot)) return undefined;
  const versions = fs
    .readdirSync(kitRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(d.name))
    .map((d) => d.name)
    .filter((v) =>
      fs.existsSync(path.join(kitRoot, v, "x64", "MakeAppx.exe")),
    )
    .sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    );
  return versions.length ? versions[versions.length - 1] : undefined;
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
        logLevel: process.env.MSIX_DEBUG === "1" ? "debug" : "warn",
        appManifest: generateMsixManifest(),
        // Only tile/icon PNGs — keep AppxManifest.* out of package assets
        packageAssets: path.join(__dirname, "assets", "msix", "package-assets"),

        ...(process.env.WINDOWS_KIT_PATH
          ? { windowsKitPath: process.env.WINDOWS_KIT_PATH }
          : (() => {
              const ver = resolveWindowsKitVersion();
              return ver ? { windowsKitVersion: ver } : {};
            })()),

        ...msixSignConfig(),
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
