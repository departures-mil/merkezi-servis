const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (json) => ipcRenderer.invoke('data:save', json),
  dataPath: () => ipcRenderer.invoke('data:path'),
  saveFile: (opts) => ipcRenderer.invoke('file:save', opts),
  openFile: (opts) => ipcRenderer.invoke('file:open', opts),
  appInfo: () => ipcRenderer.invoke('app:info'),
  checkUpdate: (url) => ipcRenderer.invoke('update:check', url),
  applyUpdate: (url) => ipcRenderer.invoke('update:apply', url),
  resetUpdate: () => ipcRenderer.invoke('update:reset'),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  print: () => ipcRenderer.invoke('app:print')
});
