'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  // Returns the pdf.worker .mjs file content so the renderer can create
  // a blob: URL — needed because Chromium Workers cannot read .asar files.
  getPdfWorkerContent: () => ipcRenderer.invoke('pdf-worker-src'),
  // Salva o buffer do PDF em disco (userData/pdfs/{noteId}.pdf)
  savePdfLocal: (noteId, arrayBuffer) => ipcRenderer.invoke('pdf-save-local', noteId, arrayBuffer),
  // Lê o PDF local; retorna Uint8Array ou null se não existir
  readPdfLocal: (noteId) => ipcRenderer.invoke('pdf-read-local', noteId),
})
