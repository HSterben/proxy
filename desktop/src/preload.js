// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Existing message APIs
  sendMessage: (payload) => ipcRenderer.invoke('send-message', payload),
  getPendingChatStart: () => ipcRenderer.invoke('get-pending-chat-start'),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  getMessage: () => ipcRenderer.invoke('get-message'),
  closeMessageWindow: () => ipcRenderer.invoke('close-message-window'),
  
  getOpenRouterModelName: () => ipcRenderer.invoke('get-openrouter-model-name'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Auth APIs
  getAuthToken: () => ipcRenderer.invoke('get-auth-token'),
  refreshAuthToken: () => ipcRenderer.invoke('refresh-auth-token'),
  openLogin: () => ipcRenderer.invoke('open-login'),
  logout: () => ipcRenderer.invoke('logout'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Presets JSON (word -> systemInstruction, temperature, etc.); path is user-configurable
  getPresetsPath: () => ipcRenderer.invoke('get-presets-path'),
  setPresetsPath: (filePath) => ipcRenderer.invoke('set-presets-path', filePath),
  readPresets: () => ipcRenderer.invoke('read-presets'),
  getBundledPresetsPath: () => ipcRenderer.invoke('get-bundled-presets-path'),
  setPresetsPathToDefault: () => ipcRenderer.invoke('set-presets-path-to-default'),
  exportPresets: () => ipcRenderer.invoke('export-presets'),
  importPresets: () => ipcRenderer.invoke('import-presets'),
  writePresets: (presets, options) => ipcRenderer.invoke('write-presets', presets, options),
  openPresetsWindow: () => ipcRenderer.invoke('open-presets-window'),
  openSubscriptionWindow: () => ipcRenderer.invoke('open-subscription-window'),
  onPresetsUpdated: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('presets-updated', handler);
    return () => ipcRenderer.removeListener('presets-updated', handler);
  },
  onAuthSuccess: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('auth-success', handler);
    return () => ipcRenderer.removeListener('auth-success', handler);
  },
  onAuthError: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('auth-error', handler);
    return () => ipcRenderer.removeListener('auth-error', handler);
  },
  onAuthLogout: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('auth-logout', handler);
    return () => ipcRenderer.removeListener('auth-logout', handler);
  },

  // Settings: keybind, window size/position
  getKeybind: () => ipcRenderer.invoke('get-keybind'),
  setKeybind: (accel) => ipcRenderer.invoke('set-keybind', accel),
  getMaxContextTokens: () => ipcRenderer.invoke('get-max-context-tokens'),
  setMaxContextTokens: (value) => ipcRenderer.invoke('set-max-context-tokens', value),
  onMaxContextTokensChanged: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('max-context-tokens-changed', handler);
    return () => ipcRenderer.removeListener('max-context-tokens-changed', handler);
  },
  getTypedStateOverrides: () => ipcRenderer.invoke('get-typed-state-overrides'),
  setTypedStateOverrides: (enabled) => ipcRenderer.invoke('set-typed-state-overrides', enabled),
  onTypedStateOverridesChanged: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('typed-state-overrides-changed', handler);
    return () => ipcRenderer.removeListener('typed-state-overrides-changed', handler);
  },
  getWindowSize: () => ipcRenderer.invoke('get-window-size'),
  setWindowSize: (size) => ipcRenderer.invoke('set-window-size', size),
  getWindowPosition: () => ipcRenderer.invoke('get-window-position'),
  setWindowPosition: (position) => ipcRenderer.invoke('set-window-position', position),
  getSizePresets: () => ipcRenderer.invoke('get-size-presets'),
  getPositionOptions: () => ipcRenderer.invoke('get-position-options'),

  getRunOnStartup: () => ipcRenderer.invoke('get-run-on-startup'),
  setRunOnStartup: (enabled) => ipcRenderer.invoke('set-run-on-startup', enabled),

  closeWindow: () => ipcRenderer.invoke('close-window'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),

  onChatStart: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('chat-start', handler);
    return () => ipcRenderer.removeListener('chat-start', handler);
  },

  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (preference) => ipcRenderer.invoke('set-theme', preference),
  onThemeChanged: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('theme-changed', handler);
    return () => ipcRenderer.removeListener('theme-changed', handler);
  },
  openSettingsWindow: () => ipcRenderer.invoke('open-settings-window'),
  toggleBubble: () => ipcRenderer.invoke('toggle-bubble'),
});
