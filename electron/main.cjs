'use strict'

const { app, BrowserWindow, shell, Menu, protocol } = require('electron')
const path = require('path')
const fs = require('fs')

const isDev = !app.isPackaged

// Map file extensions to MIME types so Chromium accepts .mjs files as
// JavaScript modules (required for the PDF.js module worker).
function getMimeType(filePath) {
  if (filePath.endsWith('.html'))                          return 'text/html; charset=utf-8'
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs'))
                                                           return 'application/javascript'
  if (filePath.endsWith('.css'))                          return 'text/css'
  if (filePath.endsWith('.json'))                         return 'application/json'
  if (filePath.endsWith('.png'))                          return 'image/png'
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg'
  if (filePath.endsWith('.svg'))                          return 'image/svg+xml'
  if (filePath.endsWith('.ico'))                          return 'image/x-icon'
  if (filePath.endsWith('.woff2'))                        return 'font/woff2'
  if (filePath.endsWith('.woff'))                         return 'font/woff'
  if (filePath.endsWith('.ttf'))                          return 'font/ttf'
  if (filePath.endsWith('.pdf'))                          return 'application/pdf'
  return 'application/octet-stream'
}

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
  // Override the file:// protocol handler to:
  //   1. Serve .mjs worker files with Content-Type: application/javascript
  //      (Chromium rejects module workers with wrong MIME type)
  //   2. Inject a Content-Security-Policy that explicitly allows
  //      worker-src from file: and blob: origins
  protocol.handle('file', (request) => {
    let filePath = decodeURIComponent(new URL(request.url).pathname)
    // Windows: URL pathname is /C:/... — strip the leading slash
    if (process.platform === 'win32') {
      filePath = filePath.replace(/^\/([A-Za-z]:)/, '$1')
    }

    try {
      const data = fs.readFileSync(filePath)
      return new Response(data, {
        headers: {
          'Content-Type': getMimeType(filePath),
          'Content-Security-Policy':
            "default-src 'self' file: data: blob: 'unsafe-inline'; " +
            "worker-src 'self' file: blob: data:; " +
            "connect-src 'self' https: wss: data: blob:;",
        },
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
