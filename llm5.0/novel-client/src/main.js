/**
 * Electron主进程 - AI小说生成器客户端
 */
const { app, BrowserWindow, ipcMain, Menu, Tray, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// 服务器进程
let serverProcess = null;
let mainWindow = null;
let tray = null;

// 开发模式
const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

// 服务器配置
const SERVER_HOST = 'localhost';
const SERVER_PORT = 5000;
const SERVER_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;

// 服务器状态
let serverStatus = 'stopped';

function createWindow() {
    // 创建浏览器窗口
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        show: false
    });

    // 加载应用界面
    const startUrl = isDev 
        ? 'http://localhost:3000'  // 开发模式下使用React开发服务器
        : `file://${path.join(__dirname, '../public/index.html')}`;
    
    mainWindow.loadURL(startUrl);

    // 开发工具
    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    // 窗口准备好后显示
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        
        // 启动Python服务器
        startServer();
    });

    // 窗口关闭事件
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // 处理外部链接
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
}

function createTray() {
    // 创建系统托盘图标
    const iconPath = path.join(__dirname, '../public/icon-tray.png');
    
    // 检查图标文件是否存在
    if (!fs.existsSync(iconPath)) {
        console.log('[信息] 托盘图标文件不存在，跳过创建托盘');
        return;
    }
    
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
        {
            label: '打开主窗口',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                }
            }
        },
        {
            label: '服务器状态: ' + (serverStatus === 'running' ? '运行中' : '已停止'),
            enabled: false
        },
        { type: 'separator' },
        {
            label: '重启服务器',
            click: () => {
                restartServer();
            }
        },
        { type: 'separator' },
        {
            label: '退出',
            click: () => {
                app.quit();
            }
        }
    ]);
    
    tray.setToolTip('AI小说生成器客户端');
    tray.setContextMenu(contextMenu);
    
    // 点击托盘图标显示/隐藏窗口
    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
            }
        }
    });
}

function startServer() {
    console.log('[启动] 正在检查AI小说生成器API服务器状态...');
    
    // 首先检查服务器是否已经在运行
    checkServerStatus().then(isRunning => {
        if (isRunning) {
            console.log('[信息] AI小说生成器API服务器已经在运行');
            updateServerStatus('running');
            if (mainWindow) {
                mainWindow.webContents.send('server-status', 'running');
            }
            return;
        }
        
        // 服务器未运行，启动它
        console.log('[信息] 正在启动新的AI小说生成器API服务器...');
        
        // 使用新的web_api.py服务器
        const serverPath = path.join(__dirname, '../../novel-service/web_api.py');
        
        // 检查Python服务器文件是否存在
        if (!fs.existsSync(serverPath)) {
            console.error('[错误] Python服务器文件不存在:', serverPath);
            updateServerStatus('error', '服务器文件不存在');
            return;
        }
        
        // 启动Python服务器
        serverProcess = spawn('python', [serverPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true,
            cwd: path.join(__dirname, '../../novel-service')  // 设置工作目录
        });
        
        // 处理服务器输出
        serverProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('[服务器]', output.trim());
            
            if (output.includes('启动AI小说生成器API服务器') || output.includes('Running on')) {
                updateServerStatus('running');
                console.log('[成功] AI小说生成器API服务器启动成功');
                
                // 通知渲染进程
                if (mainWindow) {
                    mainWindow.webContents.send('server-status', 'running');
                }
            }
        });
        
        serverProcess.stderr.on('data', (data) => {
            console.error('[服务器错误]', data.toString().trim());
        });
        
        serverProcess.on('close', (code) => {
            console.log(`[停止] AI小说生成器API服务器已退出，退出码: ${code}`);
            updateServerStatus('stopped');
            
            // 通知渲染进程
            if (mainWindow) {
                mainWindow.webContents.send('server-status', 'stopped');
            }
            
            serverProcess = null;
        });
        
        serverProcess.on('error', (err) => {
            console.error('[错误] 启动服务器失败:', err);
            updateServerStatus('error', err.message);
            
            // 通知渲染进程
            if (mainWindow) {
                mainWindow.webContents.send('server-error', err.message);
            }
        });
    });
}

// 检查服务器状态
async function checkServerStatus() {
    try {
        // 在Node.js环境中使用http或https模块
        const http = require('http');
        const url = require('url');
        
        return new Promise((resolve) => {
            const req = http.request(`${SERVER_URL}/api/health`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                timeout: 3000
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const jsonData = JSON.parse(data);
                            console.log('[健康检查] 服务器状态:', jsonData.status);
                            resolve(true);
                        } catch (e) {
                            console.log('[健康检查] 解析响应失败:', e.message);
                            resolve(false);
                        }
                    } else {
                        console.log('[健康检查] 服务器响应状态码:', res.statusCode);
                        resolve(false);
                    }
                });
            });
            
            req.on('error', (error) => {
                console.log('[健康检查] 服务器连接失败:', error.message);
                resolve(false);
            });
            
            req.on('timeout', () => {
                console.log('[健康检查] 服务器连接超时');
                req.destroy();
                resolve(false);
            });
            
            req.end();
        });
    } catch (error) {
        console.log('[健康检查] 检查失败:', error.message);
        return false;
    }
}

function stopServer() {
    if (serverProcess) {
        console.log('🛑 正在停止AI小说生成器API服务器...');
        serverProcess.kill();
        serverProcess = null;
        updateServerStatus('stopped');
    }
}

function restartServer() {
    console.log('🔄 正在重启AI小说生成器API服务器...');
    stopServer();
    setTimeout(startServer, 1000);
}

function updateServerStatus(status, error = null) {
    serverStatus = status;
    
    // 更新托盘菜单
    if (tray) {
        const contextMenu = Menu.buildFromTemplate([
            {
                label: '打开主窗口',
                click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                    }
                }
            },
            {
                label: `服务器状态: ${getStatusText(status)}`,
                enabled: false
            },
            { type: 'separator' },
            {
                label: '重启服务器',
                click: () => {
                    restartServer();
                }
            },
            { type: 'separator' },
            {
                label: '退出',
                click: () => {
                    app.quit();
                }
            }
        ]);
        
        tray.setContextMenu(contextMenu);
    }
    
    // 更新窗口标题
    if (mainWindow) {
        const statusText = getStatusText(status);
        mainWindow.setTitle(`AI小说生成器客户端 - ${statusText}`);
    }
}

function getStatusText(status) {
    switch (status) {
        case 'running':
            return '服务器运行中';
        case 'stopped':
            return '服务器已停止';
        case 'error':
            return '服务器错误';
        default:
            return '未知状态';
    }
}

// 创建应用菜单
function createApplicationMenu() {
    const template = [
        {
            label: '文件',
            submenu: [
                {
                    label: '新建小说上下文',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.send('create-context');
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: '刷新',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.reload();
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: '退出',
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: '编辑',
            submenu: [
                { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
                { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
                { type: 'separator' },
                { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
                { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
                { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
                { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
            ]
        },
        {
            label: '视图',
            submenu: [
                {
                    label: '重新加载',
                    accelerator: 'CmdOrCtrl+R',
                    click: (item, focusedWindow) => {
                        if (focusedWindow) focusedWindow.reload();
                    }
                },
                {
                    label: '切换开发者工具',
                    accelerator: isDev ? 'CmdOrCtrl+Shift+I' : 'F12',
                    click: (item, focusedWindow) => {
                        if (focusedWindow) focusedWindow.webContents.toggleDevTools();
                    }
                },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: '服务器',
            submenu: [
                {
                    label: '启动服务器',
                    enabled: serverStatus !== 'running',
                    click: () => {
                        startServer();
                    }
                },
                {
                    label: '停止服务器',
                    enabled: serverStatus === 'running',
                    click: () => {
                        stopServer();
                    }
                },
                {
                    label: '重启服务器',
                    click: () => {
                        restartServer();
                    }
                },
                { type: 'separator' },
                {
                    label: '服务器状态',
                    submenu: [
                        {
                            label: `状态: ${getStatusText(serverStatus)}`,
                            enabled: false
                        },
                        {
                            label: `地址: ${SERVER_URL}`,
                            enabled: false
                        }
                    ]
                }
            ]
        },
        {
            label: '帮助',
            role: 'help',
            submenu: [
                {
                    label: '查看文档',
                    click: () => {
                        shell.openExternal('https://github.com/your-repo/novel-generator');
                    }
                },
                {
                    label: '报告问题',
                    click: () => {
                        shell.openExternal('https://github.com/your-repo/novel-generator/issues');
                    }
                },
                { type: 'separator' },
                {
                    label: '关于',
                    click: () => {
                        const aboutMessage = `
AI小说生成器客户端 v1.0.0

基于Electron的AI辅助小说创作工具
集成LangChain智能体和上下文管理

作者: AI小说生成器团队
许可证: MIT
                        `;
                        
                        require('electron').dialog.showMessageBox({
                            type: 'info',
                            title: '关于',
                            message: aboutMessage.trim(),
                            buttons: ['确定']
                        });
                    }
                }
            ]
        }
    ];
    
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// IPC通信处理
function setupIPC() {
    // 获取服务器URL
    ipcMain.handle('get-server-url', () => {
        return SERVER_URL;
    });
    
    // 获取服务器状态
    ipcMain.handle('get-server-status', () => {
        return serverStatus;
    });
    
    // 重启服务器
    ipcMain.handle('restart-server', () => {
        restartServer();
        return { success: true };
    });
    
    // 检查服务器健康状态
    ipcMain.handle('check-server-health', async () => {
        try {
            const http = require('http');
            
            return new Promise((resolve) => {
                const req = http.request(`${SERVER_URL}/api/health`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 3000
                }, (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    res.on('end', () => {
                        if (res.statusCode === 200) {
                            try {
                                const jsonData = JSON.parse(data);
                                resolve({ healthy: true, data: jsonData });
                            } catch (e) {
                                resolve({ healthy: false, error: '解析响应失败: ' + e.message });
                            }
                        } else {
                            resolve({ healthy: false, error: `服务器响应状态码: ${res.statusCode}` });
                        }
                    });
                });
                
                req.on('error', (error) => {
                    resolve({ healthy: false, error: '连接失败: ' + error.message });
                });
                
                req.on('timeout', () => {
                    req.destroy();
                    resolve({ healthy: false, error: '连接超时' });
                });
                
                req.end();
            });
        } catch (error) {
            return { healthy: false, error: error.message };
        }
    });
}

// Electron应用生命周期
app.whenReady().then(() => {
    createWindow();
    createApplicationMenu();
    setupIPC();
    
    // macOS应用激活
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// 所有窗口关闭时退出应用（macOS除外）
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 应用退出前清理
app.on('before-quit', () => {
    stopServer();
    
    if (tray) {
        tray.destroy();
    }
});

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error);
    
    if (mainWindow) {
        mainWindow.webContents.send('uncaught-error', error.message);
    }
});
