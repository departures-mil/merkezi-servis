// Merkezi Servis – preload. window.fcHost (ortak çekirdek: pencere düğmeleri, güncelleme) + window.electronAPI (uygulama verisi).
// Güncelleme ve "Admin ile iletişim" artık ortak çekirdekte; eski update:* / contact:send kanalları kaldırıldı.
const { contextBridge, ipcRenderer } = require('electron');
require('./cekirdek/electron/fc-preload.js');

contextBridge.exposeInMainWorld('electronAPI', {
  shell: 'fc',                       // yeni kabuk (eski kabukta bu alan yok → arayüz köprü kipine geçer)
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (json) => ipcRenderer.invoke('data:save', json),
  dataPath: () => ipcRenderer.invoke('data:path'),
  saveFile: (opts) => ipcRenderer.invoke('file:save', opts),
  openFile: (opts) => ipcRenderer.invoke('file:open', opts),
  appInfo: () => ipcRenderer.invoke('app:info'),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  print: () => ipcRenderer.invoke('app:print')
});
