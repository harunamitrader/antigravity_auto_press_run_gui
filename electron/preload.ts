const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ipcRenderer', {
    on: (channel, listener) => ipcRenderer.on(channel, (event, ...args) => listener(event, ...args)),
    off: (channel, listener) => ipcRenderer.off(channel, listener),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
    send: (channel, ...omit) => ipcRenderer.send(channel, ...omit),
    invoke: (channel, ...omit) => ipcRenderer.invoke(channel, ...omit)
})
