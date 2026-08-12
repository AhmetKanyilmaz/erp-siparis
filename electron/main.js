const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const APP_NAME = 'ERP Sipariş';
const DATABASE_FILE = 'erp-siparis.sqlite';
const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'utf8');
const isSmokeTest = process.argv.includes('--smoke-test');

app.setName(APP_NAME);
app.setAppUserModelId('com.ahmetkanyilmaz.erpsiparis');

function databaseDirectory() {
    return path.join(app.getPath('userData'), 'database');
}

function databasePath() {
    return path.join(databaseDirectory(), DATABASE_FILE);
}

function ensureDatabaseDirectory() {
    fs.mkdirSync(databaseDirectory(), { recursive: true });
}

function isValidSQLite(buffer) {
    return Buffer.isBuffer(buffer)
        && buffer.length >= SQLITE_HEADER.length
        && buffer.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER);
}

function atomicWriteDatabase(buffer) {
    if (!isValidSQLite(buffer)) {
        throw new Error('Kaydedilecek veri geçerli bir SQLite dosyası değil.');
    }

    ensureDatabaseDirectory();
    const target = databasePath();
    const temporary = `${target}.tmp`;
    const backup = `${target}.bak`;
    fs.writeFileSync(temporary, buffer);

    try {
        fs.renameSync(temporary, target);
        fs.rmSync(backup, { force: true });
    } catch (error) {
        if (fs.existsSync(target)) {
            fs.copyFileSync(target, backup);
            try {
                fs.rmSync(target);
                fs.renameSync(temporary, target);
                fs.rmSync(backup, { force: true });
            } catch (replacementError) {
                if (!fs.existsSync(target) && fs.existsSync(backup)) {
                    fs.renameSync(backup, target);
                }
                throw replacementError;
            }
        } else {
            throw error;
        }
    } finally {
        fs.rmSync(temporary, { force: true });
    }

    return target;
}

function registerDatabaseIpc() {
    ipcMain.on('database:load', event => {
        try {
            ensureDatabaseDirectory();
            const target = databasePath();
            const data = fs.existsSync(target) ? fs.readFileSync(target).toString('base64') : null;
            event.returnValue = { ok: true, data };
        } catch (error) {
            event.returnValue = { ok: false, error: error.message };
        }
    });

    ipcMain.on('database:save', (event, base64) => {
        try {
            const buffer = Buffer.from(base64, 'base64');
            const target = atomicWriteDatabase(buffer);
            event.returnValue = { ok: true, path: target, bytes: buffer.length };
        } catch (error) {
            event.returnValue = { ok: false, error: error.message };
        }
    });

    ipcMain.on('database:path', event => {
        event.returnValue = { ok: true, path: databasePath() };
    });
}

async function backupDatabase(window) {
    const source = databasePath();
    if (!fs.existsSync(source)) {
        await dialog.showMessageBox(window, {
            type: 'info',
            title: 'Yedek alınamadı',
            message: 'Henüz kaydedilmiş bir veritabanı bulunmuyor.'
        });
        return;
    }

    const date = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog(window, {
        title: 'SQLite yedeğini kaydet',
        defaultPath: path.join(app.getPath('documents'), `erp-siparis-yedek-${date}.sqlite`),
        filters: [{ name: 'SQLite veritabanı', extensions: ['sqlite', 'db'] }]
    });

    if (result.canceled || !result.filePath) return;
    fs.copyFileSync(source, result.filePath);
    await dialog.showMessageBox(window, {
        type: 'info',
        title: 'Yedek tamamlandı',
        message: 'Veritabanı yedeği kaydedildi.',
        detail: result.filePath
    });
}

async function restoreDatabase(window) {
    const result = await dialog.showOpenDialog(window, {
        title: 'SQLite yedeğini seç',
        properties: ['openFile'],
        filters: [{ name: 'SQLite veritabanı', extensions: ['sqlite', 'db'] }]
    });

    if (result.canceled || result.filePaths.length === 0) return;
    const source = result.filePaths[0];
    const buffer = fs.readFileSync(source);

    if (!isValidSQLite(buffer)) {
        await dialog.showErrorBox('Geçersiz yedek', 'Seçilen dosya geçerli bir SQLite veritabanı değil.');
        return;
    }

    const confirmation = await dialog.showMessageBox(window, {
        type: 'warning',
        buttons: ['Vazgeç', 'Yedeği Geri Yükle'],
        defaultId: 0,
        cancelId: 0,
        title: 'Yedekten geri yükle',
        message: 'Mevcut veritabanı seçilen yedekle değiştirilecek.',
        detail: 'Bu işlemden önce mevcut veritabanınızın ayrıca bir yedeğini almanız önerilir.'
    });

    if (confirmation.response !== 1) return;
    atomicWriteDatabase(buffer);
    window.reload();
}

function buildMenu(window) {
    const template = [
        {
            label: 'Dosya',
            submenu: [
                { label: 'Çıkış', accelerator: 'Alt+F4', click: () => app.quit() }
            ]
        },
        {
            label: 'Veritabanı',
            submenu: [
                { label: 'Yedek Al…', accelerator: 'Ctrl+Shift+S', click: () => backupDatabase(window) },
                { label: 'Yedekten Geri Yükle…', click: () => restoreDatabase(window) },
                { type: 'separator' },
                {
                    label: 'Veritabanı Konumunu Aç',
                    click: () => {
                        ensureDatabaseDirectory();
                        const target = databasePath();
                        if (fs.existsSync(target)) shell.showItemInFolder(target);
                        else shell.openPath(databaseDirectory());
                    }
                }
            ]
        },
        {
            label: 'Görünüm',
            submenu: [
                { role: 'reload', label: 'Yenile' },
                { role: 'resetZoom', label: 'Yakınlaştırmayı Sıfırla' },
                { role: 'zoomIn', label: 'Yakınlaştır' },
                { role: 'zoomOut', label: 'Uzaklaştır' },
                { role: 'togglefullscreen', label: 'Tam Ekran' }
            ]
        },
        {
            label: 'Yardım',
            submenu: [
                {
                    label: 'GitHub Sayfası',
                    click: () => shell.openExternal('https://github.com/AhmetKanyilmaz/erp-siparis')
                },
                {
                    label: 'Sürüm Bilgisi',
                    click: () => dialog.showMessageBox(window, {
                        type: 'info',
                        title: APP_NAME,
                        message: `${APP_NAME} v${app.getVersion()}`,
                        detail: `SQLite dosyası:\n${databasePath()}`
                    })
                }
            ]
        }
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
    const window = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        show: !isSmokeTest,
        backgroundColor: '#f4f6f8',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            devTools: !app.isPackaged
        }
    });

    buildMenu(window);
    window.loadFile(path.join(__dirname, '..', 'index.html'));

    window.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://')) shell.openExternal(url);
        return { action: 'deny' };
    });

    window.webContents.on('will-navigate', (event, url) => {
        if (url !== window.webContents.getURL()) event.preventDefault();
    });

    if (isSmokeTest) {
        const timeout = setTimeout(() => {
            console.error('SMOKE_TEST_TIMEOUT');
            app.exit(1);
        }, 30000);

        window.webContents.on('did-fail-load', (_event, code, description) => {
            clearTimeout(timeout);
            console.error(`SMOKE_TEST_LOAD_ERROR ${code}: ${description}`);
            app.exit(1);
        });

        window.webContents.on('did-finish-load', async () => {
            try {
                const result = await window.webContents.executeJavaScript(`
                    (async () => {
                        await db.initPromise;
                        const tables = await db.query("SELECT COUNT(*) AS adet FROM sqlite_master WHERE type = 'table'");
                        const orders = await db.query('SELECT COUNT(*) AS adet FROM siparisler');
                        const products = await db.query('SELECT COUNT(*) AS adet FROM urunler');
                        return {
                            tables: tables[0].adet,
                            orders: orders[0].adet,
                            products: products[0].adet,
                            path: window.erpDesktop.getDatabasePath()
                        };
                    })()
                `);
                clearTimeout(timeout);
                console.log(`SMOKE_TEST_OK ${JSON.stringify(result)}`);
                app.exit(0);
            } catch (error) {
                clearTimeout(timeout);
                console.error(`SMOKE_TEST_RENDERER_ERROR ${error.stack || error.message}`);
                app.exit(1);
            }
        });
    }

    return window;
}

registerDatabaseIpc();

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
