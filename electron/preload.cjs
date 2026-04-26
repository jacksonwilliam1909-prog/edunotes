'use strict'

// Preload roda em contexto isolado antes do renderer
// Use contextBridge para expor APIs seguras ao renderer se necessário
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
})
