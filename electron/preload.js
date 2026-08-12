const { contextBridge, ipcRenderer } = require('electron');

function sonucAl(channel, ...args) {
    const sonuc = ipcRenderer.sendSync(channel, ...args);
    if (!sonuc?.ok) {
        throw new Error(sonuc?.error || 'Masaüstü veritabanı işlemi başarısız oldu.');
    }
    return sonuc;
}

contextBridge.exposeInMainWorld('erpDesktop', {
    isDesktop: true,
    loadDatabase: () => sonucAl('database:load').data || null,
    saveDatabase: bytes => {
        const base64 = Buffer.from(bytes).toString('base64');
        return sonucAl('database:save', base64);
    },
    getDatabasePath: () => sonucAl('database:path').path
});
