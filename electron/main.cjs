'use strict'

const { app, BrowserWindow, shell, Menu, ipcMain, session } = require('electron')
const path = require('path')
const fs = require('fs')

const isDev = !app.isPackaged

function getPdfsDir() {
  const dir = path.join(app.getPath('userData'), 'pdfs')
  fs.mkdirSync(dir, { recursive: true })
  return dir
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
  // Injeta cabeçalhos CORS nas respostas do Supabase Storage para que a origem
  // file:// (app empacotado) possa buscar PDFs via fetch/XHR sem ser bloqueada.
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['https://*.supabase.co/*', 'https://*.supabase.in/*'] },
    (details, callback) => {
      const headers = { ...details.responseHeaders }
      headers['access-control-allow-origin'] = ['*']
      headers['access-control-allow-methods'] = ['GET, HEAD, OPTIONS']
      headers['access-control-allow-headers'] = ['*']
      callback({ responseHeaders: headers })
    },
  )

  // Concede todas as permissões solicitadas pelo renderer (ex.: notificações)
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(true)
  })

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

  // Salva um buffer de PDF em userData/pdfs/{noteId}.pdf para uso offline
  ipcMain.handle('pdf-save-local', async (_event, noteId, arrayBuffer) => {
    try {
      fs.writeFileSync(path.join(getPdfsDir(), `${noteId}.pdf`), Buffer.from(arrayBuffer))
      return true
    } catch (err) {
      console.error('[pdf-save-local]', err)
      return false
    }
  })

  // Lê userData/pdfs/{noteId}.pdf — retorna Buffer (Uint8Array) ou null
  ipcMain.handle('pdf-read-local', async (_event, noteId) => {
    try {
      const pdfPath = path.join(getPdfsDir(), `${noteId}.pdf`)
      return fs.existsSync(pdfPath) ? fs.readFileSync(pdfPath) : null
    } catch (err) {
      console.error('[pdf-read-local]', err)
      return null
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
