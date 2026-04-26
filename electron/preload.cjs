'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  // Returns the pdf.worker .mjs file content so the renderer can create
  // a blob: URL — needed because Chromium Workers cannot read .asar files.
  getPdfWorkerContent: () => ipcRenderer.invoke('pdf-worker-src'),
})
