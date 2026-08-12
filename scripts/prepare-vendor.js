const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const vendorDir = path.join(root, 'vendor');

const files = [
    ['node_modules/sql.js/dist/sql-wasm.js', 'sql-wasm.js'],
    ['node_modules/sql.js/dist/sql-wasm.wasm', 'sql-wasm.wasm'],
    ['node_modules/chart.js/dist/chart.umd.js', 'chart.umd.js'],
    ['node_modules/@fortawesome/fontawesome-free/css/all.min.css', 'fontawesome/css/all.min.css'],
    ['node_modules/sql.js/LICENSE', 'licenses/sql.js-LICENSE.txt'],
    ['node_modules/chart.js/LICENSE.md', 'licenses/chart.js-LICENSE.md'],
    ['node_modules/@fortawesome/fontawesome-free/LICENSE.txt', 'licenses/fontawesome-LICENSE.txt']
];

for (const [sourceRelative, targetRelative] of files) {
    const source = path.join(root, sourceRelative);
    const target = path.join(vendorDir, targetRelative);

    if (!fs.existsSync(source)) {
        throw new Error(`Gerekli bağımlılık bulunamadı: ${sourceRelative}`);
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
}

const webfontsSource = path.join(root, 'node_modules/@fortawesome/fontawesome-free/webfonts');
const webfontsTarget = path.join(vendorDir, 'fontawesome/webfonts');
fs.mkdirSync(webfontsTarget, { recursive: true });

for (const file of fs.readdirSync(webfontsSource)) {
    if (file.endsWith('.woff2')) {
        fs.copyFileSync(path.join(webfontsSource, file), path.join(webfontsTarget, file));
    }
}

console.log(`Yerel web bağımlılıkları hazırlandı: ${vendorDir}`);
