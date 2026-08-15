const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("formaRecordingCamera", {
  onMirrorChange: (handler) => {
    const listener = (_event, payload) => {
      handler(Boolean(payload?.mirror));
    };
    ipcRenderer.on("forma:recording-camera-mirror", listener);
    return () => ipcRenderer.removeListener("forma:recording-camera-mirror", listener);
  },
});
