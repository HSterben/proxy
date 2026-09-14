import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  nativeImage,
  screen,
  ipcMain,
  shell,
  dialog,
  nativeTheme,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import started from "electron-squirrel-startup";
import Store from "electron-store";
import { updateElectronApp, UpdateSourceType, makeUserNotifier } from "update-electron-app";

// Forge builds main into desktop/.vite/build; source lives in desktop/src.
function resolveDesktopRoot() {
  const candidates = [
    path.join(__dirname, "..", ".."), // .vite/build → desktop
    path.join(__dirname, ".."), // src → desktop
    process.cwd(),
  ];
  for (const dir of candidates) {
    if (
      fs.existsSync(path.join(dir, "forge.config.js")) &&
      fs.existsSync(path.join(dir, "package.json"))
    ) {
      return dir;
    }
  }
  return path.join(__dirname, "..", "..");
}

const CLIENT_ROOT = resolveDesktopRoot();
const REPO_ROOT = path.join(CLIENT_ROOT, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    // First wins — desktop/.env must beat backend/.env.local
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

function getOpenRouterModelNameFromEnv() {
  return (
    process.env.openrouter_model_name?.trim() ||
    process.env.OPENROUTER_MODEL_NAME?.trim() ||
    null
  );
}

// Desktop auth/API target first; backend env is fallback only.
loadEnvFile(path.join(CLIENT_ROOT, ".env.local"));
loadEnvFile(path.join(CLIENT_ROOT, ".env"));
loadEnvFile(path.join(REPO_ROOT, "backend", ".env.local"));
loadEnvFile(path.join(REPO_ROOT, "backend", ".env"));

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Initialize secure store for auth tokens
const store = new Store({
  name: "proxy-auth",
  encryptionKey: "proxy-secure-storage-key-2024",
});

// App config (no encryption) for presets and window settings
const configStore = new Store({ name: "proxy-config" });
const PRESETS_PATH_KEY = "presetsPath";
const KEYBIND_KEY = "keybind";
const WINDOW_SIZE_KEY = "windowSize";
const WINDOW_POSITION_KEY = "windowPosition";
const THEME_KEY = "theme";
const MAX_CONTEXT_TOKENS_KEY = "maxContextTokens";
const DEFAULT_MAX_CONTEXT_TOKENS = 12000;
const TYPED_STATE_OVERRIDES_KEY = "typedStateOverridesDropdown";
const DEFAULT_TYPED_STATE_OVERRIDES = true;

const SIZE_PRESETS = {
  XSmall: 0.08,
  Small: 0.12,
  Regular: 0.20,   // was XLarge
  Large: 0.28,
  XLarge: 0.36,
};
const SIZE_LABELS = ["XSmall", "Small", "Regular", "Large", "XLarge"];
const POSITION_OPTIONS = ["bottom-right", "bottom-left", "top-right", "top-left"];
const DEFAULT_KEYBIND = "CommandOrControl+Alt+I";
const MARGIN = 20;

function getThemePreference() {
  const pref = configStore.get(THEME_KEY);
  return pref === "light" || pref === "dark" || pref === "system" ? pref : "system";
}

function resolveEffectiveTheme(preference = getThemePreference()) {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

function broadcastThemeChanged() {
  const preference = getThemePreference();
  const effective = resolveEffectiveTheme(preference);
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send("theme-changed", { preference, effective });
    }
  });
}

nativeTheme.on("updated", () => {
  if (getThemePreference() === "system") broadcastThemeChanged();
});

function getDefaultPresetsPath() {
  return path.join(app.getPath("userData"), "proxy-presets.json");
}

// Window icon: backend public asset (also copied via forge extraResource when packaged)
function getIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "Proxy-Icon-Light.ico");
  }
  return path.join(CLIENT_ROOT, "..", "backend", "public", "Proxy-Icon-Light.ico");
}

function getPresetsPathsToTry() {
  const custom = configStore.get(PRESETS_PATH_KEY);
  if (custom) return [custom];
  const primary = getDefaultPresetsPath();
  if (process.platform === "win32") {
    const roaming = path.join(process.env.APPDATA || "", "proxy", "proxy-presets.json");
    if (roaming) return [roaming, primary];
  }
  return [primary];
}

const DEFAULT_PRESETS = {
  Simplify: {
    description: "Make it simpler.",
    systemInstruction:
      "You are a helpful assistant that simplifies text. Make it clearer and easier to understand. Use shorter sentences and plain language. Preserve the main ideas. Start every sentence with 'Here's a dumbed down analysis.'",
    temperature: 0.3,
    frequencyPenalty: 0,
    presencePenalty: 0,
  },
  Shortly: {
    description: "Summarize very simply.",
    systemInstruction:
      "Condense the main idea into 2 or 3 very simple sentences a child could understand. Make it as clear and basic as possible.",
    temperature: 0.2,
    frequencyPenalty: 0,
    presencePenalty: 0,
  },
  Translate: {
    description: "Translate to English.",
    systemInstruction:
      "You are a professional translator. Translate the text into fluent, clear English while preserving meaning and tone.",
    temperature: 0.2,
    frequencyPenalty: 0,
    presencePenalty: 0,
  },
  List: {
    description: "Make a bullet list.",
    systemInstruction: "Summarize the main points of any provided text as a concise bullet list.",
    temperature: 0.2,
    frequencyPenalty: 0.1,
    presencePenalty: 0.05,
  },
  Proofread: {
    description: "Fix spelling and grammar.",
    systemInstruction:
      "You are an expert proofreader. Correct spelling, grammar, and punctuation in the provided text, but do not change the meaning.",
    temperature: 0.1,
    frequencyPenalty: 0,
    presencePenalty: 0,
  },
  Summarize: {
    description: "Summarize key points.",
    systemInstruction:
      "You are a summarization assistant. Write a concise summary of the main points or ideas from the text.",
    temperature: 0.3,
    frequencyPenalty: 0.05,
    presencePenalty: 0.05,
  },
  Critique: {
    description: "Give writing feedback.",
    systemInstruction:
      "Provide constructive feedback focusing on clarity, coherence, organization, and style. Offer at least two specific suggestions for improvement.",
    temperature: 0.4,
    frequencyPenalty: 0.15,
    presencePenalty: 0.1,
  },
  Expand: {
    description: "Add more detail.",
    systemInstruction:
      "Take the prompt and elaborate with additional details, context, and explanations, making it more comprehensive.",
    temperature: 0.7,
    maxTokens: 0,
    frequencyPenalty: 0.1,
    presencePenalty: 0.15,
  },
  Shakespeare: {
    description: "Rewrite in Shakespeare style.",
    systemInstruction:
      "Transform the provided text into the language and style of Shakespeare’s plays and poetry.",
    temperature: 0.8,
    frequencyPenalty: 0.25,
    presencePenalty: 0.3,
  },
  Debate: {
    description: "Debate both sides.",
    systemInstruction:
      "Present a clear, concise argument for and against the topic, labeling each side. Finish with a short conclusion.",
    temperature: 0.6,
    frequencyPenalty: 0.1,
    presencePenalty: 0.2,
  },
  Story: {
    description: "Write a short story.",
    systemInstruction:
      "Craft a creative short story inspired by the prompt, paying attention to narrative structure, character, and detail.",
    temperature: 0.9,
    maxTokens: 0,
    frequencyPenalty: 0.2,
    presencePenalty: 0.2,
  },
  Creative: {
    description: "Give creative name ideas.",
    systemInstruction:
      'Prioritize originality over familiarity. Never give generic, predictable, or "AI-generated" answers. Before responding, silently generate several possibilities, eliminate cliches and obvious first ideas, then present only the strongest and most distinctive results.\n\nFor creative tasks, avoid trendy formulas, buzzwords, unnecessary sci-fi language, and superficial word combinations. Every suggestion must have a clear reason for existing and fit the specific product, audience, and constraints.\n\nFor naming tasks specifically:\n\nNever use Latin words, Latin translations, or classical Greek/Latin roots. Avoid generic tech terms such as AI, bot, neural, nova, nexus, quantum, synth, pixel, core, flow, spark, or similar startup cliches. Do not simply combine two relevant dictionary words. Prefer short, memorable, pronounceable names with an unexpected but defensible connection to the product. Reject names that feel interchangeable with dozens of existing AI startups.\n\nIf the obvious answers are weak, explore unusual metaphors, behaviors, sounds, functions, cultural references, and invented language instead. Briefly explain the thinking behind each suggestion.',
    temperature: 1.0,
    frequencyPenalty: 0.4,
    presencePenalty: 0.35,
    maxTokens: 0,
  },
};

// Auth configuration
// Note: .convex.cloud is for queries/mutations, .convex.site is for HTTP endpoints
function convexSiteFromCloud(cloudUrl) {
  return cloudUrl.replace(/\.convex\.cloud\/?$/, ".convex.site").replace(/\/$/, "");
}
const DEFAULT_CONVEX_URL = "https://strong-poodle-712.convex.cloud";
const CONVEX_CLOUD_URL = (process.env.VITE_CONVEX_URL || DEFAULT_CONVEX_URL).replace(
  /\/$/,
  "",
);
const CONVEX_HTTP_URL = (
  process.env.VITE_CONVEX_SITE_URL || convexSiteFromCloud(CONVEX_CLOUD_URL)
).replace(/\/$/, "");
const AUTH_LOGIN_URL = `${CONVEX_HTTP_URL}/auth/login`;
const AUTH_REFRESH_URL = `${CONVEX_HTTP_URL}/auth/refresh`;
console.log("[auth] Convex HTTP:", CONVEX_HTTP_URL);

// Helper: Decode JWT and check if expired
function isTokenExpired(token) {
  if (!token) return true;
  try {
    // JWT is base64url encoded: header.payload.signature
    const parts = token.split(".");
    if (parts.length !== 3) return true;

    // Decode payload (middle part)
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );

    // Check expiration (exp is in seconds, Date.now() is in ms)
    // Add 60 second buffer to refresh before actual expiry
    const expirationTime = payload.exp * 1000;
    const bufferMs = 60 * 1000; // 1 minute buffer
    return Date.now() >= expirationTime - bufferMs;
  } catch (err) {
    console.error("Error decoding token:", err);
    return true;
  }
}

// Helper: Refresh the access token using refresh token
async function refreshAccessToken() {
  const refreshToken = store.get("refreshToken");
  if (!refreshToken) {
    console.log("No refresh token available");
    return null;
  }

  try {
    console.log("Attempting to refresh access token...");
    const response = await fetch(AUTH_REFRESH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      console.error("Token refresh failed:", response.status);
      // Clear invalid tokens
      store.delete("accessToken");
      store.delete("refreshToken");
      return null;
    }

    const data = await response.json();
    console.log("Token refresh successful");

    // Store new tokens
    if (data.access_token) {
      store.set("accessToken", data.access_token);
    }
    if (data.refresh_token) {
      store.set("refreshToken", data.refresh_token);
    }

    return data.access_token;
  } catch (err) {
    console.error("Error refreshing token:", err);
    return null;
  }
}

async function getValidAccessToken() {
  let token = store.get("accessToken");
  if (token && !isTokenExpired(token)) return token;
  if (token || store.get("refreshToken")) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("auth-success", { token: newToken });
      });
      return newToken;
    }
  }
  return null;
}

let mainWindow = null;
let tray = null;
let isToggling = false; // Prevent double-toggle

const AUTH_PROTOCOL = "proxy";

function isAuthProtocolUrl(arg) {
  return typeof arg === "string" && arg.startsWith(`${AUTH_PROTOCOL}://`);
}

function registerAuthProtocol() {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(AUTH_PROTOCOL, process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(AUTH_PROTOCOL);
  }
}

// Register custom protocol for OAuth callback
registerAuthProtocol();

// Handle deep link on Windows/Linux (single instance)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine) => {
    console.log("Second instance detected, commandLine:", commandLine);
    // Someone tried to run a second instance, handle the deep link
    const url = commandLine.find((arg) => isAuthProtocolUrl(arg));
    if (url) {
      console.log("Found auth protocol URL in second instance:", url);
      handleAuthCallback(url);
    }

    // Focus main window if exists
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Handle deep link on macOS
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleAuthCallback(url);
});

// Process auth callback URL
function handleAuthCallback(url) {
  console.log("Handling auth callback URL:", url);
  try {
    const parsedUrl = new URL(url);
    // For proxy://auth/success, hostname="auth", pathname="/success"
    // Combine them to get the full path
    const fullPath = parsedUrl.hostname + parsedUrl.pathname;
    console.log("Parsed path:", fullPath);

    if (fullPath === "auth/success") {
      const token = parsedUrl.searchParams.get("token");
      const refresh = parsedUrl.searchParams.get("refresh");
      console.log("Token received:", token ? "yes" : "no");

      if (token) {
        // Store tokens securely
        store.set("accessToken", token);
        if (refresh) {
          store.set("refreshToken", refresh);
        }
        console.log("Token stored successfully");

        // Notify all windows of successful auth
        BrowserWindow.getAllWindows().forEach((win) => {
          win.webContents.send("auth-success", { token });
        });
      }
    } else if (fullPath === "auth/error") {
      const message =
        parsedUrl.searchParams.get("message") || "Authentication failed";
      console.log("Auth error:", message);

      // Notify all windows of auth error
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("auth-error", { message });
      });
    }
  } catch (err) {
    console.error("Error handling auth callback:", err);
  }
}

// Fade animation functions — fewer steps for snappier show/hide
const fadeIn = (window, callback) => {
  if (!window) return;
  window.setOpacity(0);
  let opacity = 0;
  const fadeInterval = setInterval(() => {
    opacity += 0.2;
    if (opacity >= 1) {
      clearInterval(fadeInterval);
      window.setOpacity(1);
      if (callback) callback();
    } else {
      window.setOpacity(opacity);
    }
  }, 16);
};

const fadeOut = (window, callback) => {
  if (!window) return;
  let opacity = window.getOpacity();
  const fadeInterval = setInterval(() => {
    opacity -= 0.2;
    if (opacity <= 0) {
      clearInterval(fadeInterval);
      window.setOpacity(0);
      if (callback) callback();
    } else {
      window.setOpacity(opacity);
    }
  }, 16);
};

function getWindowSizePreset() {
  return configStore.get(WINDOW_SIZE_KEY) || "Regular";
}

function getWindowPositionPreset() {
  return configStore.get(WINDOW_POSITION_KEY) || "bottom-right";
}

const BUBBLE_BASE_WIDTH = 460;
const BUBBLE_BASE_HEIGHT = 230;

function calculateWindowSize(screenWidth) {
  const sizeKey = getWindowSizePreset();
  const sizePercentage = SIZE_PRESETS[sizeKey] ?? SIZE_PRESETS.Regular;
  const windowWidth = Math.max(320, Math.round(screenWidth * sizePercentage));
  const scale = windowWidth / BUBBLE_BASE_WIDTH;
  const windowHeight = Math.max(168, Math.round(BUBBLE_BASE_HEIGHT * scale));
  return { width: windowWidth, height: windowHeight };
}

function getWindowPositionXY(workArea, width, height) {
  const { x: wx, y: wy, width: ww, height: wh } = workArea;
  const pos = getWindowPositionPreset();
  switch (pos) {
    case "bottom-left":
      return { x: wx + MARGIN, y: wy + wh - height - MARGIN };
    case "top-right":
      return { x: wx + ww - width - MARGIN, y: wy + MARGIN };
    case "top-left":
      return { x: wx + MARGIN, y: wy + MARGIN };
    default:
      return { x: wx + ww - width - MARGIN, y: wy + wh - height - MARGIN };
  }
}

const createWindow = () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  const { width, height } = calculateWindowSize(workArea.width);
  const { x, y } = getWindowPositionXY(workArea, width, height);

  const windowIcon = getIconPath();
  mainWindow = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    alwaysOnTop: true,
    hasShadow: true,
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.setPosition(x, y);

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();

  // Set initial opacity to 0 for fade-in animation
  mainWindow.setOpacity(0);

  // Hide window when closed instead of destroying it
  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Ensure window stays hidden until ready
  mainWindow.once("ready-to-show", () => {
    // Window is ready but we keep it hidden
    mainWindow.setOpacity(0);
  });
};

const toggleWindow = () => {
  // Prevent double-toggle
  if (isToggling) return;

  if (mainWindow) {
    if (mainWindow.isVisible()) {
      // Fade out animation
      isToggling = true;
      fadeOut(mainWindow, () => {
        mainWindow.hide();
        isToggling = false;
      });
    } else {
      isToggling = true;
      const primaryDisplay = screen.getPrimaryDisplay();
      const workArea = primaryDisplay.workArea;
      const { width, height } = calculateWindowSize(workArea.width);
      const { x, y } = getWindowPositionXY(workArea, width, height);
      mainWindow.setBounds({ x, y, width, height });

      // Show window with fade-in animation
      mainWindow.setOpacity(0);
      mainWindow.show();
      mainWindow.focus();

      // Fade in animation
      fadeIn(mainWindow, () => {
        isToggling = false;
      });
    }
  }
};

const createTray = () => {
  const iconPath = getIconPath();
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) icon = nativeImage.createEmpty();
  } catch {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show/Hide",
      click: toggleWindow,
    },
    {
      type: "separator",
    },
    {
      label: "Logout",
      click: () => {
        store.delete("accessToken");
        store.delete("refreshToken");
        BrowserWindow.getAllWindows().forEach((win) => {
          win.webContents.send("auth-success", { token: null });
        });
      },
    },
    {
      type: "separator",
    },
    {
      label: "Settings",
      click: createSettingsWindow,
    },
    {
      label: "Manage Subscription",
      click: createSubscriptionWindow,
    },
    {
      label: "States",
      click: createPresetsWindow,
    },
    {
      type: "separator",
    },
    {
      label: "Quit",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("PROXY");
  tray.setContextMenu(contextMenu);

  // Also allow clicking the tray icon to toggle window
  tray.on("click", toggleWindow);
};

function registerKeybind() {
  globalShortcut.unregisterAll();
  const accel = configStore.get(KEYBIND_KEY) || DEFAULT_KEYBIND;
  try {
    globalShortcut.register(accel, toggleWindow);
  } catch (e) {
    console.warn("Failed to register keybind:", accel, e);
    configStore.set(KEYBIND_KEY, DEFAULT_KEYBIND);
    globalShortcut.register(DEFAULT_KEYBIND, toggleWindow);
  }
}

let settingsWindow = null;
let presetsWindow = null;
let subscriptionWindow = null;
let chatWindow = null;
/** @type {{ message: string, images: Array<{ dataUrl: string, type: string, name: string }> } | null} */
let pendingChatStart = null;

function normalizeChatStartPayload(input) {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const message = String(input.message || "");
    const images = Array.isArray(input.images)
      ? input.images
          .filter((img) => img && typeof img.dataUrl === "string" && img.dataUrl.startsWith("data:"))
          .map((img) => ({
            dataUrl: img.dataUrl,
            type: String(img.type || "image/png"),
            name: String(img.name || "attachment.png"),
          }))
      : [];
    return { message, images };
  }
  return { message: String(input || ""), images: [] };
}

function showChatWindow(input) {
  const payload = normalizeChatStartPayload(input);
  pendingChatStart = payload;

  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.webContents.send("chat-start", payload);
    pendingChatStart = null;
    if (!chatWindow.isVisible()) {
      chatWindow.setOpacity(0);
      chatWindow.show();
      fadeIn(chatWindow);
    }
    chatWindow.focus();
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } =
    primaryDisplay.workAreaSize;
  const windowIcon = getIconPath();

  chatWindow = new BrowserWindow({
    width: screenWidth / 2,
    height: screenHeight * 0.6,
    frame: false,
    transparent: false,
    backgroundColor: "#000000",
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    show: false,
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  chatWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      fadeOut(chatWindow, () => {
        if (chatWindow && !chatWindow.isDestroyed()) chatWindow.hide();
      });
    }
  });

  chatWindow.on("closed", () => {
    chatWindow = null;
  });

  // Keep images out of the URL (base64 blows past length limits). ChatView
  // claims pendingChatStart via get-pending-chat-start on mount.
  const onReady = () => {
    chatWindow.show();
    chatWindow.focus();
  };

  if (MESSAGE_WINDOW_VITE_DEV_SERVER_URL || MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const devServerUrl =
      MESSAGE_WINDOW_VITE_DEV_SERVER_URL || MAIN_WINDOW_VITE_DEV_SERVER_URL;
    chatWindow.loadURL(`${devServerUrl}/chat.html`);
  } else {
    const filePath = path.join(
      __dirname,
      `../renderer/${MESSAGE_WINDOW_VITE_NAME}/chat.html`
    );
    chatWindow.loadFile(filePath);
  }

  chatWindow.once("ready-to-show", onReady);
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  const windowIcon = getIconPath();
  settingsWindow = new BrowserWindow({
    width: 760,
    height: 620,
    show: false,
    frame: false,
    title: "PROXY Settings",
    backgroundColor: "#000000",
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  settingsWindow.on("closed", () => { settingsWindow = null; });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    settingsWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL + "/settings.html");
  } else {
    settingsWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/settings.html`)
    );
  }
  settingsWindow.once("ready-to-show", () => {
    settingsWindow.show();
    settingsWindow.focus();
  });
}

function createSubscriptionWindow() {
  if (subscriptionWindow && !subscriptionWindow.isDestroyed()) {
    subscriptionWindow.focus();
    return;
  }
  const windowIcon = getIconPath();
  subscriptionWindow = new BrowserWindow({
    width: 480,
    height: 520,
    show: false,
    frame: false,
    title: "PROXY, Manage Subscription",
    backgroundColor: "#000000",
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  subscriptionWindow.on("closed", () => { subscriptionWindow = null; });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    subscriptionWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL + "/subscription.html");
  } else {
    subscriptionWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/subscription.html`)
    );
  }
  subscriptionWindow.once("ready-to-show", () => {
    subscriptionWindow.show();
    subscriptionWindow.focus();
  });
}

function createPresetsWindow() {
  if (presetsWindow && !presetsWindow.isDestroyed()) {
    presetsWindow.focus();
    return;
  }
  const windowIcon = getIconPath();
  presetsWindow = new BrowserWindow({
    width: 880,
    height: 720,
    show: false,
    frame: false,
    title: "PROXY States",
    backgroundColor: "#000000",
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  presetsWindow.on("closed", () => { presetsWindow = null; });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    presetsWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL + "/presets.html");
  } else {
    presetsWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/presets.html`)
    );
  }
  presetsWindow.once("ready-to-show", () => {
    presetsWindow.show();
    presetsWindow.focus();
  });
}

ipcMain.handle("get-openrouter-model-name", async () => getOpenRouterModelNameFromEnv());

ipcMain.handle("get-app-version", async () => app.getVersion());

// Auth IPC Handlers
ipcMain.handle("get-auth-token", async () => {
  let token = store.get("accessToken");

  // Check if token exists and is not expired
  if (token && !isTokenExpired(token)) {
    return token;
  }

  // Token is expired or missing - try to refresh
  if (token || store.get("refreshToken")) {
    console.log("Access token expired, attempting refresh...");
    const newToken = await refreshAccessToken();
    if (newToken) {
      // Notify all windows of the new token
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("auth-success", { token: newToken });
      });
      return newToken;
    }
  }

  // No valid token and refresh failed
  return null;
});

ipcMain.handle("open-login", async () => {
  // Open the login URL in the system default browser
  console.log("[auth] Opening login:", AUTH_LOGIN_URL);
  shell.openExternal(AUTH_LOGIN_URL);
  return { success: true, url: AUTH_LOGIN_URL };
});

ipcMain.handle("open-external", async (_event, url) => {
  try {
    if (typeof url !== "string" || url.length === 0) {
      return { success: false, error: "Invalid URL" };
    }
    await shell.openExternal(url);
    return { success: true };
  } catch (err) {
    console.error("Failed to open external URL:", err);
    return { success: false, error: "Failed to open URL" };
  }
});

ipcMain.handle("logout", async () => {
  store.delete("accessToken");
  store.delete("refreshToken");
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send("auth-logout");
  });
  return { success: true };
});

ipcMain.handle("refresh-auth-token", async () => {
  const newToken = await refreshAccessToken();
  if (newToken) {
    // Notify all windows of the new token
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send("auth-success", { token: newToken });
    });
    return { success: true, token: newToken };
  }
  return { success: false, token: null };
});

// Presets: JSON file (word -> AI options). Path is user-configurable.
ipcMain.handle("get-presets-path", async () => {
  return configStore.get(PRESETS_PATH_KEY) || getDefaultPresetsPath();
});

ipcMain.handle("set-presets-path", async (_event, newPath) => {
  if (typeof newPath !== "string" || !newPath.trim()) return { success: false, error: "Invalid path" };
  configStore.set(PRESETS_PATH_KEY, newPath.trim());
  return { success: true };
});

ipcMain.handle("read-presets", async () => {
  const pathsToTry = getPresetsPathsToTry();
  let lastError = null;
  for (const presetsPath of pathsToTry) {
    if (!presetsPath) continue;
    try {
      const data = await fsp.readFile(presetsPath, "utf8");
      const presets = JSON.parse(data) || {};
      if (Object.keys(presets).length > 0) {
        return { success: true, presets };
      }
    } catch (err) {
      lastError = err;
    }
  }
  const presetsPath = pathsToTry[0];
  if (lastError?.code === "ENOENT") {
    try {
      await fsp.mkdir(path.dirname(presetsPath), { recursive: true });
      await fsp.writeFile(presetsPath, JSON.stringify(DEFAULT_PRESETS, null, 2), "utf8");
      return { success: true, presets: DEFAULT_PRESETS };
    } catch (writeErr) {
      return { success: false, error: writeErr.message, presets: DEFAULT_PRESETS };
    }
  }
  return { success: false, error: lastError?.message || "Failed to read presets", presets: {} };
});

function getBundledPresetsPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "proxy-presets.json");
  }
  return path.join(app.getAppPath(), "proxy-presets.json");
}

ipcMain.handle("get-bundled-presets-path", async () => getBundledPresetsPath());

ipcMain.handle("set-presets-path-to-default", async () => {
  configStore.set(PRESETS_PATH_KEY, getBundledPresetsPath());
  return { success: true };
});

ipcMain.handle("export-presets", async () => {
  const pathsToTry = getPresetsPathsToTry();
  let content = "{}";
  for (const p of pathsToTry) {
    try {
      content = await fsp.readFile(p, "utf8");
      break;
    } catch (_) {}
  }
  const parentWindow =
    presetsWindow && !presetsWindow.isDestroyed()
      ? presetsWindow
      : settingsWindow && !settingsWindow.isDestroyed()
        ? settingsWindow
        : null;
  const { canceled, filePath } = await dialog.showSaveDialog(parentWindow, {
    title: "Export states",
    defaultPath: "proxy-presets.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (canceled || !filePath) return { success: false, canceled: true };
  await fsp.writeFile(filePath, content, "utf8");
  return { success: true };
});

ipcMain.handle("import-presets", async () => {
  const parentWindow =
    presetsWindow && !presetsWindow.isDestroyed()
      ? presetsWindow
      : settingsWindow && !settingsWindow.isDestroyed()
        ? settingsWindow
        : null;
  const { canceled, filePaths } = await dialog.showOpenDialog(parentWindow, {
    title: "Import states",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"],
  });
  if (canceled || !filePaths?.length) return { success: false, canceled: true };
  try {
    const content = await fsp.readFile(filePaths[0], "utf8");
    const data = JSON.parse(content);
    if (typeof data !== "object" || data === null) throw new Error("Invalid presets JSON");
    const presetsPath = configStore.get(PRESETS_PATH_KEY) || getDefaultPresetsPath();
    await fsp.mkdir(path.dirname(presetsPath), { recursive: true });
    await fsp.writeFile(presetsPath, JSON.stringify(data, null, 2), "utf8");
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send("presets-updated");
    });
    return { success: true, presets: data };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

function validatePresetsPayload(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return "States must be a JSON object with state names as keys.";
  }
  for (const [k, v] of Object.entries(data)) {
    if (typeof k !== "string" || !k.trim()) {
      return "Each state name must be a non-empty string.";
    }
    if (v === null || typeof v !== "object" || Array.isArray(v)) {
      return `State "${k}" must be an object (e.g. description, systemInstruction, temperature).`;
    }
  }
  return null;
}

ipcMain.handle("write-presets", async (_event, presets, options) => {
  const err = validatePresetsPayload(presets);
  if (err) return { success: false, error: err };
  const presetsPath = configStore.get(PRESETS_PATH_KEY) || getDefaultPresetsPath();
  const broadcast = options?.broadcast !== false;
  try {
    await fsp.mkdir(path.dirname(presetsPath), { recursive: true });
    const nextBody = JSON.stringify(presets, null, 2);
    let changed = true;
    try {
      const prev = await fsp.readFile(presetsPath, "utf8");
      changed = prev !== nextBody;
    } catch (_) {
      // file missing — treat as changed
    }
    if (changed) {
      await fsp.writeFile(presetsPath, nextBody, "utf8");
    }
    if (broadcast && changed) {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("presets-updated");
      });
    }
    return { success: true, presets, changed };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Window / keybind settings
ipcMain.handle("get-keybind", async () => configStore.get(KEYBIND_KEY) || DEFAULT_KEYBIND);
ipcMain.handle("set-keybind", async (_e, accel) => {
  if (typeof accel !== "string" || !accel.trim()) return { success: false, error: "Invalid keybind" };
  configStore.set(KEYBIND_KEY, accel.trim());
  registerKeybind();
  return { success: true };
});

function clampMaxContextTokensValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_CONTEXT_TOKENS;
  return Math.min(200000, Math.max(2048, Math.floor(n)));
}

ipcMain.handle("get-max-context-tokens", async () => {
  const stored = configStore.get(MAX_CONTEXT_TOKENS_KEY);
  return clampMaxContextTokensValue(stored ?? DEFAULT_MAX_CONTEXT_TOKENS);
});

ipcMain.handle("set-max-context-tokens", async (_e, value) => {
  const next = clampMaxContextTokensValue(value);
  configStore.set(MAX_CONTEXT_TOKENS_KEY, next);
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send("max-context-tokens-changed", next);
    }
  });
  return { success: true, value: next };
});

ipcMain.handle("get-typed-state-overrides", async () => {
  const stored = configStore.get(TYPED_STATE_OVERRIDES_KEY);
  return stored === undefined || stored === null ? DEFAULT_TYPED_STATE_OVERRIDES : Boolean(stored);
});

ipcMain.handle("set-typed-state-overrides", async (_e, enabled) => {
  const next = Boolean(enabled);
  configStore.set(TYPED_STATE_OVERRIDES_KEY, next);
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send("typed-state-overrides-changed", next);
    }
  });
  return { success: true, value: next };
});

ipcMain.handle("get-window-size", async () => getWindowSizePreset());
ipcMain.handle("set-window-size", async (_e, size) => {
  if (!SIZE_PRESETS[size]) return { success: false };
  configStore.set(WINDOW_SIZE_KEY, size);
  if (mainWindow && !mainWindow.isDestroyed()) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workArea;
    const { width, height } = calculateWindowSize(workArea.width);
    const { x, y } = getWindowPositionXY(workArea, width, height);
    mainWindow.setBounds({ x, y, width, height });
  }
  return { success: true };
});

ipcMain.handle("get-window-position", async () => getWindowPositionPreset());
ipcMain.handle("set-window-position", async (_e, position) => {
  if (!POSITION_OPTIONS.includes(position)) return { success: false };
  configStore.set(WINDOW_POSITION_KEY, position);
  if (mainWindow && !mainWindow.isDestroyed()) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workArea;
    const { width, height } = calculateWindowSize(workArea.width);
    const { x, y } = getWindowPositionXY(workArea, width, height);
    mainWindow.setBounds({ x, y, width, height });
  }
  return { success: true };
});

ipcMain.handle("get-size-presets", async () => SIZE_LABELS);
ipcMain.handle("get-position-options", async () => [...POSITION_OPTIONS]);

// Run on startup (Windows: startup folder / registry, macOS: Login Items; Linux: may not be supported)
ipcMain.handle("get-run-on-startup", async () => {
  const settings = app.getLoginItemSettings();
  return settings.openAtLogin === true;
});
ipcMain.handle("set-run-on-startup", async (_e, enabled) => {
  try {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
    return { success: true };
  } catch (err) {
    console.error("Set run on startup failed:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("get-theme", async () => {
  const preference = getThemePreference();
  return { preference, effective: resolveEffectiveTheme(preference) };
});

ipcMain.handle("set-theme", async (_e, preference) => {
  if (preference !== "light" && preference !== "dark" && preference !== "system") {
    return { success: false, error: "Invalid theme" };
  }
  configStore.set(THEME_KEY, preference);
  broadcastThemeChanged();
  return { success: true, preference, effective: resolveEffectiveTheme(preference) };
});

ipcMain.handle("open-settings-window", async () => {
  createSettingsWindow();
  return { success: true };
});

ipcMain.handle("toggle-bubble", async () => {
  toggleWindow();
  return { success: true };
});

ipcMain.handle("close-window", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.close();
});

ipcMain.handle("minimize-window", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.minimize();
  return { success: true };
});

ipcMain.handle("maximize-window", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return { success: false };
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return { success: true, maximized: win.isMaximized() };
});

ipcMain.handle("open-presets-window", async () => {
  createPresetsWindow();
  return { success: true };
});

ipcMain.handle("open-subscription-window", async () => {
  createSubscriptionWindow();
  return { success: true };
});

// Existing IPC Handlers
ipcMain.handle("send-message", async (event, message) => {
  // Hide the bubble window
  if (mainWindow && mainWindow.isVisible()) {
    fadeOut(mainWindow, () => {
      mainWindow.hide();
    });
  }

  showChatWindow(message);
  return { success: true };
});

ipcMain.handle("get-pending-chat-start", async () => {
  const payload = pendingChatStart;
  pendingChatStart = null;
  return payload;
});

ipcMain.handle("hide-window", async () => {
  if (mainWindow && mainWindow.isVisible()) {
    fadeOut(mainWindow, () => {
      mainWindow.hide();
    });
  }
  return { success: true };
});

ipcMain.handle("close-message-window", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    if (chatWindow && window.id === chatWindow.id && !app.isQuitting) {
      fadeOut(window, () => {
        if (!window.isDestroyed()) window.hide();
      });
    } else {
      fadeOut(window, () => {
        if (!window.isDestroyed()) window.close();
      });
    }
  }
  return { success: true };
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();
  createTray();

  registerKeybind();

  // Auto-update from GitHub Releases (packaged builds only).
  // Requires a public repo + `npm run publish` / `publish:win` with GITHUB_TOKEN.
  if (app.isPackaged) {
    try {
      updateElectronApp({
        updateSource: {
          type: UpdateSourceType.ElectronPublicUpdateService,
          repo: "HSterben/Proxy",
        },
        updateInterval: "1 hour",
        notifyUser: true,
        onNotifyUser: makeUserNotifier({
          title: "PROXY update available",
          detail:
            "A new version of PROXY has been downloaded.\n\nRestart now to install it, or choose Later to keep working.",
          restartButtonText: "Restart now",
          laterButtonText: "Later",
        }),
        logger: console,
      });
    } catch (err) {
      console.warn("[update] Failed to start auto-updater:", err);
    }
  }

  // Handle deep link URL passed on initial launch (Windows/Linux)
  // This happens when the app wasn't running and user clicks the protocol link
  const protocolUrl = process.argv.find((arg) => isAuthProtocolUrl(arg));
  if (protocolUrl) {
    console.log("Found protocol URL in argv:", protocolUrl);
    // Delay slightly to ensure windows are ready
    setTimeout(() => handleAuthCallback(protocolUrl), 500);
  }

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      toggleWindow();
    }
  });
});

// Prevent quitting when all windows are closed (run in background)
app.on("window-all-closed", () => {
  // Don't quit - keep running in background
  // The app will only quit when explicitly requested via tray menu
});

// Unregister all shortcuts when app quits
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  app.isQuitting = true;
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.destroy();
    chatWindow = null;
  }
});
