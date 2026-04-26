'use strict'

const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

const isDev = !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'EduNotes',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#f9fafb',
    show: false,
  })

  // Remove menu bar nativo (File, Edit, View...)
  Menu.setApplicationMenu(null)

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Mostrar janela apenas quando estiver pronta (evita flash branco)
  win.once('ready-to-show', () => win.show())

  // Links externos abrem no navegador padrão do sistema, não dentro do app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  // The Chromium Worker API cannot load files from inside an .asar archive.
  // This handler lets the renderer ask the main process (Node.js, which IS
  // asar-patched) to read the pdf.worker file and return its content so the
  // renderer can create a blob: URL — bypassing the asar restriction entirely.
  ipcMain.handle('pdf-worker-src', () => {
    if (!app.isPackaged) return null          // dev: renderer uses Vite's URL
    const assetsDir = path.join(app.getAppPath(), 'dist', 'assets')
    const workerFile = fs.readdirSync(assetsDir)
      .find(f => f.startsWith('pdf.worker') && f.endsWith('.mjs'))
    if (!workerFile) return null
    return fs.readFileSync(path.join(assetsDir, workerFile), 'utf-8')
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
