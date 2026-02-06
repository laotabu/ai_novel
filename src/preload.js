/**
 * 预加载脚本
 * 安全地暴露受限制的API给渲染进程
 */
const { contextBridge, ipcRenderer } = require('electron');

// 安全地暴露API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // 服务器相关
    getServerUrl: () => ipcRenderer.invoke('get-server-url'),
    getServerStatus: () => ipcRenderer.invoke('get-server-status'),
    restartServer: () => ipcRenderer.invoke('restart-server'),
    checkServerHealth: () => ipcRenderer.invoke('check-server-health'),
    
    // 事件监听
    onServerStatus: (callback) => {
        ipcRenderer.on('server-status', (event, status) => callback(status));
    },
    onServerError: (callback) => {
        ipcRenderer.on('server-error', (event, error) => callback(error));
    },
    onCreateContext: (callback) => {
        ipcRenderer.on('create-context', () => callback());
    },
    onUncaughtError: (callback) => {
        ipcRenderer.on('uncaught-error', (event, error) => callback(error));
    },
    
    // 移除事件监听器
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    }
});

// 在加载时注入一些全局变量
window.addEventListener('DOMContentLoaded', () => {
    // 可以在这里添加一些DOM操作
});
