const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hoursTracker', {
  load: () => ipcRenderer.invoke('storage:load'),
  save: (payload) => ipcRenderer.invoke('storage:save', payload),
  generateReport: (payload) => ipcRenderer.invoke('report:generate', payload),
  refineReport: (payload) => ipcRenderer.invoke('report:refine', payload),
  writeClipboard: (payload) => ipcRenderer.invoke('clipboard:write', payload),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
  onUpdaterEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('updater:event', listener);
    return () => ipcRenderer.removeListener('updater:event', listener);
  }
});
