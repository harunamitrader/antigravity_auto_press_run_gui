import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { MonitorEngine } from './monitor'

// ESM compatible __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ディレクトリ構造
process.env.DIST_ELECTRON = path.join(__dirname, '../dist-electron')
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? (process.env.DIST || '') : path.join(__dirname, '../public')

let win: BrowserWindow | null
let monitor: MonitorEngine | null

function createWindow() {
    win = new BrowserWindow({
        width: 640,
        height: 480,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        // 不透明背景 & フレームレス
        transparent: false,
        frame: false,
        backgroundColor: '#0f1423',
        resizable: false,
    })

    monitor = new MonitorEngine(win)

    // IPC ハンドラ
    ipcMain.handle('monitor-start', () => monitor?.start())
    ipcMain.handle('monitor-stop', () => monitor?.stop())
    ipcMain.handle('set-interval', (_, ms) => monitor?.setPollInterval(ms))
    ipcMain.handle('window-close', () => win?.close())
    ipcMain.handle('window-minimize', () => win?.minimize())

    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', (new Date()).toLocaleString())
    })

    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL)
    } else {
        const distPath = process.env.DIST || ''
        win.loadFile(path.join(distPath, 'index.html'))
    }
}

app.on('window-all-closed', () => {
    // 開発サーバーや関連するNodeプロセスを確実に裏側で終了させる
    if (process.platform === 'win32') {
        import('child_process').then(cp => {
            cp.exec('taskkill /F /IM node.exe', () => {
                app.quit()
                win = null
            });
        });
    } else {
        app.quit()
        win = null
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

app.whenReady().then(createWindow)

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err)
})
