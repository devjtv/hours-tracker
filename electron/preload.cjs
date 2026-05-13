const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hoursTracker', {
  load: () => ipcRenderer.invoke('storage:load'),
  save: (payload) => ipcRenderer.invoke('storage:save', payload),
  generateReport: (payload) => ipcRenderer.invoke('report:generate', payload),
  refineReport: (payload) => ipcRenderer.invoke('report:refine', payload),
  writeClipboard: (payload) => ipcRenderer.invoke('clipboard:write', payload)
});
