const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, handler) {
  const listener = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("formaDesktop", {
  isDesktop: true,
  platform: process.platform,
  openExternal: (url) => ipcRenderer.invoke("forma:open-external", url),
  getAppWindowSourceId: () => ipcRenderer.invoke("forma:get-app-window-source-id"),
  getScreenCaptureAccessStatus: () =>
    ipcRenderer.invoke("forma:get-screen-capture-access-status"),
  openScreenCaptureSettings: () => ipcRenderer.invoke("forma:open-screen-capture-settings"),
  installUpdateNow: () => ipcRenderer.invoke("forma:update-install-now"),
  scheduleUpdateTonight: () => ipcRenderer.invoke("forma:update-schedule-tonight"),
  triggerMockUpdate: () => ipcRenderer.invoke("forma:update-trigger-mock"),
  onUpdateAvailable: (handler) => subscribe("forma:update-available", handler),
  onUpdateScheduledTonight: (handler) =>
    subscribe("forma:update-scheduled-tonight", handler),
  onUpdateProgress: (handler) => subscribe("forma:update-progress", handler),
  onUpdateInstalled: (handler) => subscribe("forma:update-installed", handler),
});
