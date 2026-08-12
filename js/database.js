// Veritabanı Yönetimi
class DatabaseManager {
    constructor() {
        this.db = null;
        this.SQL = null;
        this.desktopBridge = window.erpDesktop?.isDesktop ? window.erpDesktop : null;
        this.initPromise = this.initDatabase();
    }

    base64ToBytes(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }
        return bytes;
    }

    persistDatabaseBytes(data, markReset = false) {
        if (this.desktopBridge) {
            return this.desktopBridge.saveDatabase(data);
        }

        const serializedData = JSON.stringify(Array.from(data));
        localStorage.setItem('erp_database', serializedData);
        if (markReset) localStorage.setItem('erp_database_reset', 'true');
        return { path: 'localStorage', bytes: data.length, serializedData };
    }

    async initDatabase() {
        try {
            // SQL.js'i yerel paketinden başlat. Aynı dosyalar hem web demosunda
            // hem de çevrimdışı Electron paketinde kullanılır.
            const SQL = await initSqlJs({
                locateFile: file => `vendor/${file}`
            });
            this.SQL = SQL;

            // Masaüstünde standart .sqlite dosyasını, web demosunda localStorage'ı yükle.
            const existingData = this.desktopBridge
                ? this.desktopBridge.loadDatabase()
                : localStorage.getItem('erp_database');
            const dahaOnceSifirlandi = this.desktopBridge
                ? false
                : localStorage.getItem('erp_database_reset') === 'true';
            if (existingData) {
                const uInt8Array = this.desktopBridge
                    ? this.base64ToBytes(existingData)
                    : new Uint8Array(JSON.parse(existingData));
                this.db = new SQL.Database(uInt8Array);

                // CREATE TABLE IF NOT EXISTS kullandığımız için her açılışta çalıştırmak
                // eski kullanıcı verilerini silmeden yeni modül tablolarını ekler.
                await this.createTables();
                await this.runMigrations();
                this.saveDatabase();
            } else {
                this.db = new SQL.Database();
                await this.createTables();
                await this.runMigrations();

                // İlk kullanımda örnek veri oluştur; kullanıcı DB'yi sıfırladıysa
                // depolama anahtarı kaybolsa bile örnek verileri tekrar getirme.
                if (dahaOnceSifirlandi) {
                    this.saveDatabase();
                } else {
                    await this.insertSampleData();
                    await this.runMigrations();
                    this.saveDatabase();
                }
            }

            console.log('Veritabanı başarıyla başlatıldı');
            return this.db;
        } catch (error) {
            console.error('Veritabanı başlatma hatası:', error);
            throw error;
        }
    }

    async createTables() {
        const createQueries = [
            // Müşteriler tablosu
            `CREATE TABLE IF NOT EXISTS musteriler (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ad TEXT NOT NULL,
                email TEXT,
                telefon TEXT,
                adres TEXT,
                sehir TEXT,
                olusturma_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Ürünler tablosu
            `CREATE TABLE IF NOT EXISTS urunler (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kod TEXT UNIQUE NOT NULL,
                ad TEXT NOT NULL,
                aciklama TEXT,
                birim_fiyat DECIMAL(10,2) NOT NULL,
                stok_miktari INTEGER DEFAULT 0,
                minimum_stok INTEGER DEFAULT 10,
                kategori TEXT,
                olusturma_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Siparişler tablosu
            `CREATE TABLE IF NOT EXISTS siparisler (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                siparis_no TEXT UNIQUE NOT NULL,
                musteri_id INTEGER NOT NULL,
                tarih DATETIME DEFAULT CURRENT_TIMESTAMP,
                durum TEXT DEFAULT 'bekliyor',
                toplam_tutar DECIMAL(10,2) NOT NULL,
                notlar TEXT,
                onay_tarihi DATETIME,
                sevk_tarihi DATETIME,
                teslimat_tarihi DATETIME,
                FOREIGN KEY (musteri_id) REFERENCES musteriler(id)
            )`,

            // Sipariş detayları tablosu
            `CREATE TABLE IF NOT EXISTS siparis_detaylari (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                siparis_id INTEGER NOT NULL,
                urun_id INTEGER NOT NULL,
                miktar INTEGER NOT NULL,
                birim_fiyat DECIMAL(10,2) NOT NULL,
                toplam DECIMAL(10,2) NOT NULL,
                FOREIGN KEY (siparis_id) REFERENCES siparisler(id),
                FOREIGN KEY (urun_id) REFERENCES urunler(id)
            )`,

            // Sevkiyat planları tablosu
            `CREATE TABLE IF NOT EXISTS sevkiyat_planlari (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_adi TEXT NOT NULL,
                tarih DATE NOT NULL,
                durum TEXT DEFAULT 'planlandi',
                aciklama TEXT,
                olusturma_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Sevkiyat detayları tablosu
            `CREATE TABLE IF NOT EXISTS sevkiyat_detaylari (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sevkiyat_plan_id INTEGER NOT NULL,
                siparis_id INTEGER NOT NULL,
                durum TEXT DEFAULT 'bekliyor',
                FOREIGN KEY (sevkiyat_plan_id) REFERENCES sevkiyat_planlari(id),
                FOREIGN KEY (siparis_id) REFERENCES siparisler(id)
            )`,

            // Sevkiyat takip tablosu
            `CREATE TABLE IF NOT EXISTS sevkiyat_takip (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                siparis_id INTEGER NOT NULL,
                durum TEXT NOT NULL, -- 'hazirlaniyor', 'kargoya_verildi', 'dagitim_subesinde', 'dagitimda', 'teslim_edildi'
                aciklama TEXT,
                konum TEXT, -- Şube veya konum bilgisi
                tarih DATETIME DEFAULT CURRENT_TIMESTAMP,
                kullanici TEXT, -- İşlemi yapan kişi
                FOREIGN KEY (siparis_id) REFERENCES siparisler(id)
            )`,

            // Stok hareketleri tablosu
            `CREATE TABLE IF NOT EXISTS stok_hareketleri (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                urun_id INTEGER NOT NULL,
                hareket_tipi TEXT NOT NULL, -- 'giris', 'cikis', 'duzeltme'
                miktar INTEGER NOT NULL,
                aciklama TEXT,
                tarih DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (urun_id) REFERENCES urunler(id)
            )`,

            // Faturalar tablosu
            `CREATE TABLE IF NOT EXISTS faturalar (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fatura_no TEXT UNIQUE NOT NULL,
                siparis_id INTEGER NOT NULL,
                musteri_id INTEGER NOT NULL,
                tarih DATE DEFAULT CURRENT_DATE,
                vade_tarihi DATE,
                durum TEXT DEFAULT 'bekliyor', -- 'bekliyor', 'odendi', 'gecikti', 'iptal'
                ara_toplam DECIMAL(10,2) NOT NULL,
                kdv_orani DECIMAL(5,2) DEFAULT 18.00,
                kdv_tutari DECIMAL(10,2) NOT NULL,
                toplam_tutar DECIMAL(10,2) NOT NULL,
                odeme_sekli TEXT, -- 'nakit', 'kredi_karti', 'havale', 'cek'
                notlar TEXT,
                olusturma_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (siparis_id) REFERENCES siparisler(id),
                FOREIGN KEY (musteri_id) REFERENCES musteriler(id)
            )`,

            // Fatura detayları tablosu
            `CREATE TABLE IF NOT EXISTS fatura_detaylari (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fatura_id INTEGER NOT NULL,
                urun_id INTEGER NOT NULL,
                miktar INTEGER NOT NULL,
                birim_fiyat DECIMAL(10,2) NOT NULL,
                kdv_orani DECIMAL(5,2) DEFAULT 18.00,
                ara_toplam DECIMAL(10,2) NOT NULL,
                kdv_tutari DECIMAL(10,2) NOT NULL,
                toplam DECIMAL(10,2) NOT NULL,
                FOREIGN KEY (fatura_id) REFERENCES faturalar(id),
                FOREIGN KEY (urun_id) REFERENCES urunler(id)
            )`,

            // Siparişin kullanıcıya gösterilecek işlem/zaman geçmişi
            `CREATE TABLE IF NOT EXISTS siparis_gecmisi (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                siparis_id INTEGER NOT NULL,
                olay_tipi TEXT NOT NULL,
                baslik TEXT NOT NULL,
                aciklama TEXT,
                onceki_durum TEXT,
                yeni_durum TEXT,
                kullanici TEXT DEFAULT 'Sistem',
                tarih DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (siparis_id) REFERENCES siparisler(id)
            )`,

            // İade üst bilgileri
            `CREATE TABLE IF NOT EXISTS iadeler (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                iade_no TEXT UNIQUE NOT NULL,
                siparis_id INTEGER NOT NULL,
                durum TEXT DEFAULT 'tamamlandi',
                neden TEXT NOT NULL,
                aciklama TEXT,
                toplam_tutar DECIMAL(10,2) DEFAULT 0,
                tarih DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (siparis_id) REFERENCES siparisler(id)
            )`,

            // Kısmi iadeleri de destekleyen iade satırları
            `CREATE TABLE IF NOT EXISTS iade_detaylari (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                iade_id INTEGER NOT NULL,
                siparis_detay_id INTEGER NOT NULL,
                urun_id INTEGER NOT NULL,
                miktar INTEGER NOT NULL,
                birim_fiyat DECIMAL(10,2) NOT NULL,
                toplam DECIMAL(10,2) NOT NULL,
                FOREIGN KEY (iade_id) REFERENCES iadeler(id),
                FOREIGN KEY (siparis_detay_id) REFERENCES siparis_detaylari(id),
                FOREIGN KEY (urun_id) REFERENCES urunler(id)
            )`
        ];

        for (const query of createQueries) {
            this.db.run(query);
        }

        console.log('Tablolar başarıyla oluşturuldu');
    }

    async runMigrations() {
        // Eski siparişleri zaman çizelgesinde görünür kıl. NOT EXISTS sayesinde
        // geçiş her açılışta güvenle çalışabilir.
        this.db.run(`
            INSERT INTO siparis_gecmisi (
                siparis_id, olay_tipi, baslik, aciklama, yeni_durum, kullanici, tarih
            )
            SELECT
                s.id,
                'olusturuldu',
                'Sipariş oluşturuldu',
                'Sipariş sisteme kaydedildi.',
                'bekliyor',
                'Sistem',
                s.tarih
            FROM siparisler s
            WHERE NOT EXISTS (
                SELECT 1 FROM siparis_gecmisi sg
                WHERE sg.siparis_id = s.id AND sg.olay_tipi = 'olusturuldu'
            )
        `);

        this.db.run(`
            INSERT INTO siparis_gecmisi (
                siparis_id, olay_tipi, baslik, aciklama,
                onceki_durum, yeni_durum, kullanici, tarih
            )
            SELECT
                s.id,
                'durum',
                'Mevcut durum aktarıldı',
                'Eski sipariş kaydının mevcut durumu zaman çizelgesine aktarıldı.',
                'bekliyor',
                s.durum,
                'Sistem',
                COALESCE(s.teslimat_tarihi, s.sevk_tarihi, s.onay_tarihi, s.tarih)
            FROM siparisler s
            WHERE s.durum <> 'bekliyor'
              AND NOT EXISTS (
                SELECT 1 FROM siparis_gecmisi sg
                WHERE sg.siparis_id = s.id AND sg.olay_tipi = 'durum'
              )
        `);

        this.db.run('CREATE INDEX IF NOT EXISTS idx_siparis_gecmisi_siparis ON siparis_gecmisi(siparis_id, tarih)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_iadeler_siparis ON iadeler(siparis_id, tarih)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_iade_detaylari_siparis_detay ON iade_detaylari(siparis_detay_id)');

        // Önceki sürümlerde sipariş durumu değişirken sevkiyat detayı sabit
        // kalabiliyordu. Mevcut kayıtları siparişin gerçek durumuyla eşitle.
        this.db.run(`
            UPDATE sevkiyat_detaylari
            SET durum = CASE (
                SELECT s.durum FROM siparisler s
                WHERE s.id = sevkiyat_detaylari.siparis_id
            )
                WHEN 'onaylandi' THEN 'planlandi'
                WHEN 'hazirlaniyor' THEN 'hazirlaniyor'
                WHEN 'sevk_edildi' THEN 'yola_cikti'
                WHEN 'kargoya_verildi' THEN 'yola_cikti'
                WHEN 'dagitim_subesinde' THEN 'yola_cikti'
                WHEN 'dagitimda' THEN 'yola_cikti'
                WHEN 'teslim_edildi' THEN 'teslim_edildi'
                WHEN 'faturalanmis' THEN 'teslim_edildi'
                WHEN 'kismi_iade' THEN 'teslim_edildi'
                WHEN 'iade_edildi' THEN 'teslim_edildi'
                ELSE CASE WHEN durum = 'bekliyor' THEN 'planlandi' ELSE durum END
            END
        `);

        this.db.run(`
            UPDATE sevkiyat_planlari
            SET durum = CASE
                WHEN durum = 'iptal' THEN 'iptal'
                WHEN EXISTS (
                    SELECT 1 FROM sevkiyat_detaylari sd
                    WHERE sd.sevkiyat_plan_id = sevkiyat_planlari.id
                ) AND NOT EXISTS (
                    SELECT 1 FROM sevkiyat_detaylari sd
                    WHERE sd.sevkiyat_plan_id = sevkiyat_planlari.id
                      AND sd.durum <> 'teslim_edildi'
                ) THEN 'teslim_edildi'
                WHEN EXISTS (
                    SELECT 1 FROM sevkiyat_detaylari sd
                    WHERE sd.sevkiyat_plan_id = sevkiyat_planlari.id
                      AND sd.durum = 'yola_cikti'
                ) THEN 'yola_cikti'
                WHEN EXISTS (
                    SELECT 1 FROM sevkiyat_detaylari sd
                    WHERE sd.sevkiyat_plan_id = sevkiyat_planlari.id
                      AND sd.durum = 'hazirlaniyor'
                ) THEN 'hazirlaniyor'
                ELSE 'planlandi'
            END
            WHERE durum <> 'iptal'
        `);
    }

    async insertSampleData(kaydet = true) {
        const tarihOlustur = gunFarki => {
            const tarih = new Date();
            tarih.setDate(tarih.getDate() + gunFarki);
            const yil = tarih.getFullYear();
            const ay = String(tarih.getMonth() + 1).padStart(2, '0');
            const gun = String(tarih.getDate()).padStart(2, '0');
            return `${yil}-${ay}-${gun}`;
        };

        // Örnek müşteriler
        const musteriler = [
            ['Ahmet Yılmaz', 'ahmet@example.com', '0532 123 4567', 'Atatürk Cad. No:1', 'İstanbul'],
            ['Fatma Kaya', 'fatma@example.com', '0543 234 5678', 'İnönü Sok. No:2', 'Ankara'],
            ['Mehmet Demir', 'mehmet@example.com', '0554 345 6789', 'Cumhuriyet Mah. No:3', 'İzmir'],
            ['Ayşe Özkan', 'ayse@example.com', '0565 456 7890', 'Barbaros Blv. No:4', 'Bursa'],
            ['Can Arslan', 'can@example.com', '0576 567 8901', 'Gazi Cad. No:5', 'Antalya'],
            ['Mavi Ofis Teknolojileri A.Ş.', 'satinalma@maviofis.com', '0312 410 22 30', 'Söğütözü Mah. 2176 Cad. No:8', 'Ankara'],
            ['Nova Yazılım Ltd. Şti.', 'operasyon@novayazilim.com', '0212 555 18 90', 'Maslak Mah. Büyükdere Cad. No:245', 'İstanbul'],
            ['Atlas Lojistik A.Ş.', 'tedarik@atlaslojistik.com', '0262 333 44 55', 'Gebze Organize Sanayi Bölgesi 1200 Sok.', 'Kocaeli'],
            ['Ege Tasarım Mobilya Ltd.', 'muhasebe@egetasarim.com', '0232 480 71 20', 'Mersinli Mah. 2823 Sok. No:14', 'İzmir'],
            ['Pera Danışmanlık', 'ofis@peradanismanlik.com', '0224 225 16 40', 'Odunluk Mah. Akademi Cad. No:6', 'Bursa']
        ];

        for (const musteri of musteriler) {
            this.db.run(
                'INSERT INTO musteriler (ad, email, telefon, adres, sehir) VALUES (?, ?, ?, ?, ?)',
                musteri
            );
        }

        // Örnek ürünler
        const urunler = [
            ['URT001', 'Laptop Dell XPS 13', 'Yüksek performanslı ultrabook', 25000.00, 15, 5, 'Elektronik'],
            ['URT002', 'iPhone 14 Pro', 'Apple akıllı telefon', 35000.00, 8, 3, 'Elektronik'],
            ['URT003', 'Samsung 4K TV 55"', '55 inç 4K Smart TV', 18000.00, 12, 4, 'Elektronik'],
            ['URT004', 'Ofis Sandalyesi', 'Ergonomik çalışma sandalyesi', 1500.00, 25, 10, 'Mobilya'],
            ['URT005', 'Çalışma Masası', 'Ahşap çalışma masası 120x60', 2500.00, 18, 8, 'Mobilya'],
            ['URT006', 'Wireless Mouse', 'Kablosuz optik fare', 150.00, 50, 20, 'Aksesuar'],
            ['URT007', 'Mekanik Klavye', 'RGB aydınlatmalı mekanik klavye', 800.00, 30, 15, 'Aksesuar'],
            ['URT008', 'Printer HP LaserJet', 'Siyah beyaz lazer yazıcı', 3500.00, 6, 2, 'Elektronik'],
            ['URT009', 'Tablet Samsung Galaxy', '10.1 inç Android tablet', 4500.00, 10, 5, 'Elektronik'],
            ['URT010', 'Bluetooth Kulaklık', 'Noise cancelling kulaklık', 1200.00, 35, 15, 'Aksesuar'],
            ['URT011', 'Logitech C920 Webcam', 'Full HD kurumsal görüntülü görüşme kamerası', 2750.00, 18, 6, 'Aksesuar'],
            ['URT012', 'USB-C Hub 8-in-1', 'HDMI, Ethernet ve kart okuyuculu USB-C hub', 1650.00, 24, 8, 'Aksesuar'],
            ['URT013', '27 inç QHD Monitör', '2560x1440 IPS profesyonel monitör', 9000.00, 14, 5, 'Elektronik'],
            ['URT014', '1 TB NVMe SSD', 'PCIe 4.0 yüksek hızlı depolama', 3200.00, 32, 10, 'Elektronik'],
            ['URT015', 'Wi-Fi 6 Router', 'Kurumsal kullanıma uygun gigabit router', 4500.00, 11, 4, 'Elektronik']
        ];

        for (const urun of urunler) {
            this.db.run(
                'INSERT INTO urunler (kod, ad, aciklama, birim_fiyat, stok_miktari, minimum_stok, kategori) VALUES (?, ?, ?, ?, ?, ?, ?)',
                urun
            );
        }

        // Örnek siparişler
        const siparisler = [
            ['SIP001', 1, tarihOlustur(-12), 'onaylandi', 26500.00, 'Acil teslimat'],
            ['SIP002', 2, tarihOlustur(-10), 'bekliyor', 35000.00, ''],
            ['SIP003', 3, tarihOlustur(-8), 'sevk_edildi', 4000.00, 'Özel paketleme'],
            ['SIP004', 4, tarihOlustur(-6), 'teslim_edildi', 70000.00, ''],
            ['SIP005', 5, tarihOlustur(-5), 'bekliyor', 3500.00, 'Test gerekli'],
            ['SIP006', 6, tarihOlustur(-4), 'onaylandi', 8250.00, 'Toplantı odası ekipmanı'],
            ['SIP007', 7, tarihOlustur(-3), 'bekliyor', 8250.00, 'Yeni ekip kurulum paketi'],
            ['SIP008', 8, tarihOlustur(-2), 'sevk_edildi', 18000.00, 'Depoya teslim'],
            ['SIP009', 9, tarihOlustur(-1), 'teslim_edildi', 12800.00, 'Proje stoğu']
        ];

        for (const siparis of siparisler) {
            this.db.run(
                'INSERT INTO siparisler (siparis_no, musteri_id, tarih, durum, toplam_tutar, notlar) VALUES (?, ?, ?, ?, ?, ?)',
                siparis
            );
        }

        // Örnek sipariş detayları
        const siparisDetaylari = [
            [1, 1, 1, 25000.00, 25000.00],
            [1, 6, 10, 150.00, 1500.00],
            [2, 2, 1, 35000.00, 35000.00],
            [3, 7, 5, 800.00, 4000.00],
            [4, 2, 2, 35000.00, 70000.00],
            [5, 8, 1, 3500.00, 3500.00],
            [6, 11, 3, 2750.00, 8250.00],
            [7, 12, 5, 1650.00, 8250.00],
            [8, 13, 2, 9000.00, 18000.00],
            [9, 14, 4, 3200.00, 12800.00]
        ];

        for (const detay of siparisDetaylari) {
            this.db.run(
                'INSERT INTO siparis_detaylari (siparis_id, urun_id, miktar, birim_fiyat, toplam) VALUES (?, ?, ?, ?, ?)',
                detay
            );
        }

        console.log('Örnek veriler başarıyla eklendi');
        if (kaydet) {
            this.saveDatabase();
        }
    }

    async demoVerileriniYukle() {
        await this.initPromise;

        const kontrolTablolari = ['musteriler', 'urunler', 'siparisler'];
        for (const tablo of kontrolTablolari) {
            const sonuc = await this.query(`SELECT COUNT(*) AS adet FROM ${tablo}`);
            if ((sonuc[0]?.adet || 0) > 0) {
                throw new Error('Demo verisi yalnızca boş veritabanına yüklenebilir. Önce DB Sıfırla işlemini kullanın.');
            }
        }

        try {
            this.db.exec('BEGIN TRANSACTION');
            this.db.run("DELETE FROM sqlite_sequence WHERE name IN ('musteriler', 'urunler', 'siparisler', 'siparis_detaylari')");
            await this.insertSampleData(false);
            await this.runMigrations();
            this.db.exec('COMMIT');
            this.saveDatabase();

            const [musteriSayisi] = await this.query('SELECT COUNT(*) AS adet FROM musteriler');
            const [urunSayisi] = await this.query('SELECT COUNT(*) AS adet FROM urunler');
            const [siparisSayisi] = await this.query('SELECT COUNT(*) AS adet FROM siparisler');

            return {
                musteri: musteriSayisi?.adet || 0,
                urun: urunSayisi?.adet || 0,
                siparis: siparisSayisi?.adet || 0
            };
        } catch (error) {
            try {
                this.db.exec('ROLLBACK');
            } catch (rollbackError) {
                console.warn('Demo verisi geri alma hatası:', rollbackError);
            }
            throw error;
        }
    }

    // Veritabanını tamamen sıfırla
    async resetDatabase() {
        await this.initPromise;

        const tablolar = [
            'iade_detaylari',
            'iadeler',
            'siparis_gecmisi',
            'fatura_detaylari',
            'faturalar',
            'sevkiyat_takip',
            'sevkiyat_detaylari',
            'sevkiyat_planlari',
            'stok_hareketleri',
            'siparis_detaylari',
            'siparisler',
            'urunler',
            'musteriler'
        ];
        const yedekData = this.db.export();
        let transactionAcik = false;

        try {
            console.log('Veritabanı tamamen sıfırlanıyor...');

            // Mevcut SQLite örneğini doğrudan temizle. Böylece yeni WASM/DB
            // oluşturma veya sayfa yenileme davranışına bağımlı kalmayız.
            this.db.exec('PRAGMA foreign_keys = OFF');
            this.db.exec('BEGIN TRANSACTION');
            transactionAcik = true;

            for (const tablo of tablolar) {
                this.db.run(`DELETE FROM ${tablo}`);
            }

            this.db.run('DELETE FROM sqlite_sequence');
            this.db.exec('COMMIT');
            transactionAcik = false;
            this.db.exec('PRAGMA foreign_keys = ON');

            const kalanKayitlar = {};
            for (const tablo of tablolar) {
                const sonuc = this.db.exec(`SELECT COUNT(*) FROM ${tablo}`);
                kalanKayitlar[tablo] = sonuc[0]?.values[0]?.[0] || 0;
            }

            const toplamKalan = Object.values(kalanKayitlar)
                .reduce((toplam, adet) => toplam + adet, 0);

            if (toplamKalan !== 0) {
                throw new Error(`Sıfırlama doğrulaması başarısız: ${toplamKalan} kayıt kaldı`);
            }

            const kayitSonucu = this.persistDatabaseBytes(this.db.export(), true);
            if (!this.desktopBridge && localStorage.getItem('erp_database') !== kayitSonucu.serializedData) {
                throw new Error('Sıfırlanan veritabanı tarayıcı depolamasına yazılamadı');
            }

            console.log('Veritabanı başarıyla sıfırlandı:', kalanKayitlar);
            return kalanKayitlar;
        } catch (error) {
            if (transactionAcik) {
                try {
                    this.db.exec('ROLLBACK');
                } catch (rollbackError) {
                    console.warn('Sıfırlama geri alma hatası:', rollbackError);
                }
            }

            try {
                this.db.close();
            } catch (closeError) {
                console.warn('Hatalı veritabanı kapatılamadı:', closeError);
            }
            this.db = new this.SQL.Database(yedekData);
            console.error('Veritabanı sıfırlama hatası:', error);
            throw error;
        }
    }

    saveDatabase() {
        try {
            const data = this.db.export();
            this.persistDatabaseBytes(data);
        } catch (error) {
            console.error('Veritabanı kaydetme hatası:', error);
            throw error;
        }
    }

    async query(sql, params = []) {
        await this.initPromise;
        try {
            const stmt = this.db.prepare(sql);
            const result = [];
            
            if (params.length > 0) {
                stmt.bind(params);
            }
            
            while (stmt.step()) {
                result.push(stmt.getAsObject());
            }
            
            stmt.free();
            return result;
        } catch (error) {
            console.error('Sorgu hatası:', error);
            throw error;
        }
    }

    async execute(sql, params = []) {
        await this.initPromise;
        try {
            if (params.length > 0) {
                this.db.run(sql, params);
            } else {
                this.db.run(sql);
            }
            this.saveDatabase();
            return true;
        } catch (error) {
            console.error('Sorgu çalıştırma hatası:', error);
            throw error;
        }
    }

    async getLastInsertId() {
        const result = await this.query('SELECT last_insert_rowid() as id');
        return result[0]?.id || 0;
    }

    // Sipariş ile ilgili sorgulamalar
    async getSiparisler() {
        console.log('getSiparisler fonksiyonu çağrıldı');
        
        // Önce siparişleri al
        const siparisler = await this.query(`
            SELECT 
                s.id,
                s.siparis_no,
                s.tarih,
                s.durum,
                s.toplam_tutar,
                s.notlar,
                s.onay_tarihi,
                s.sevk_tarihi,
                s.teslimat_tarihi,
                COALESCE(m.ad, 'Bilinmeyen Müşteri') as musteri_adi,
                COALESCE(m.telefon, '') as musteri_telefon,
                COALESCE(m.sehir, '') as musteri_sehir,
                COALESCE(m.adres, '') as musteri_adres
            FROM siparisler s
            LEFT JOIN musteriler m ON s.musteri_id = m.id
            ORDER BY s.tarih DESC
        `);
        
        console.log('Ham siparişler:', siparisler);
        
        // Her sipariş için ürün, kalan iade hakkı ve gerçek stok bilgisini al.
        for (let siparis of siparisler) {
            const urunBilgileri = await this.query(`
                SELECT 
                    sd.id as siparis_detay_id,
                    sd.urun_id,
                    u.kod,
                    u.ad,
                    sd.miktar,
                    sd.birim_fiyat,
                    sd.toplam,
                    COALESCE(u.stok_miktari, 0) as mevcut_stok,
                    COALESCE(u.minimum_stok, 0) as minimum_stok,
                    COALESCE((
                        SELECT SUM(idt.miktar)
                        FROM iade_detaylari idt
                        JOIN iadeler i ON i.id = idt.iade_id
                        WHERE idt.siparis_detay_id = sd.id AND i.durum <> 'iptal'
                    ), 0) as iade_miktari
                FROM siparis_detaylari sd
                LEFT JOIN urunler u ON sd.urun_id = u.id
                WHERE sd.siparis_id = ?
                ORDER BY sd.id
            `, [siparis.id]);
            
            console.log(`Sipariş ${siparis.siparis_no} ürün bilgileri:`, urunBilgileri);
            
            if (urunBilgileri && urunBilgileri.length > 0) {
                siparis.detaylar = urunBilgileri;
                siparis.urunler = urunBilgileri.map(item => `${item.ad} (${item.miktar} adet)`).join(', ');
                siparis.toplam_miktar = urunBilgileri.reduce((total, item) => total + (item.miktar || 0), 0);
                siparis.iade_miktari = urunBilgileri.reduce((total, item) => total + (item.iade_miktari || 0), 0);

                if (siparis.durum === 'iptal' || siparis.durum === 'iade_edildi') {
                    siparis.stok_durumu = 'stok_iade';
                } else if (urunBilgileri.some(item => Number(item.mevcut_stok) < 0)) {
                    siparis.stok_durumu = 'stok_yok';
                } else if (urunBilgileri.some(item => Number(item.mevcut_stok) <= Number(item.minimum_stok))) {
                    siparis.stok_durumu = 'dusuk_stok';
                } else {
                    siparis.stok_durumu = 'ayrildi';
                }
            } else {
                siparis.detaylar = [];
                siparis.urunler = 'Ürün bilgisi yok';
                siparis.toplam_miktar = 0;
                siparis.iade_miktari = 0;
                siparis.stok_durumu = 'stok_yok';
            }
        }
        
        console.log('İşlenmiş siparişler:', siparisler);
        return siparisler;
    }

    async getUrunler() {
        return await this.query(`
            SELECT *,
                CASE 
                    WHEN stok_miktari <= 0 THEN 'stok_yok'
                    WHEN stok_miktari <= minimum_stok THEN 'dusuk_stok'
                    ELSE 'normal'
                END as stok_durumu
            FROM urunler
            ORDER BY ad
        `);
    }

    async getMusteriler() {
        return await this.query('SELECT * FROM musteriler ORDER BY ad');
    }

    async getIstatistikler() {
        const [toplamSiparis] = await this.query('SELECT COUNT(*) as sayi FROM siparisler');
        const [bekleyenSiparis] = await this.query("SELECT COUNT(*) as sayi FROM siparisler WHERE durum = 'bekliyor'");
        const [sevkEdilen] = await this.query("SELECT COUNT(*) as sayi FROM siparisler WHERE durum = 'sevk_edildi'");
        const [brutCiro] = await this.query('SELECT SUM(toplam_tutar) as tutar FROM siparisler WHERE durum != "iptal"');
        const [iadeToplami] = await this.query("SELECT SUM(toplam_tutar) as tutar FROM iadeler WHERE durum != 'iptal'");

        return {
            toplamSiparis: toplamSiparis.sayi || 0,
            bekleyenSiparis: bekleyenSiparis.sayi || 0,
            sevkEdilen: sevkEdilen.sayi || 0,
            toplamCiro: Math.max(0, Number(brutCiro.tutar || 0) - Number(iadeToplami.tutar || 0))
        };
    }

    async addSiparis(siparisData) {
        await this.initPromise;
        try {
            console.log('addSiparis çağrıldı:', siparisData);

            const detaylar = this.normalizeSiparisDetaylari(siparisData.detaylar || [{
                urun_id: siparisData.urun_id,
                miktar: siparisData.miktar,
                birim_fiyat: siparisData.birim_fiyat
            }]);

            this.db.exec('BEGIN TRANSACTION');

            for (const detay of detaylar) {
                const urun = this.getRowSync('SELECT ad, stok_miktari FROM urunler WHERE id = ?', [detay.urun_id]);
                if (!urun) throw new Error('Siparişteki ürünlerden biri bulunamadı.');
                if (Number(urun.stok_miktari) < detay.miktar) {
                    throw new Error(`${urun.ad} için yetersiz stok. Mevcut: ${urun.stok_miktari}`);
                }
            }

            this.db.run(
                'INSERT INTO siparisler (siparis_no, musteri_id, toplam_tutar, notlar) VALUES (?, ?, ?, ?)',
                [siparisData.siparis_no, siparisData.musteri_id, siparisData.toplam_tutar, siparisData.notlar || '']
            );

            const [result] = this.db.exec('SELECT last_insert_rowid() as id');
            const siparisId = result.values[0][0];

            for (const detay of detaylar) {
                const satirToplami = detay.miktar * detay.birim_fiyat;
                this.db.run(
                    'INSERT INTO siparis_detaylari (siparis_id, urun_id, miktar, birim_fiyat, toplam) VALUES (?, ?, ?, ?, ?)',
                    [siparisId, detay.urun_id, detay.miktar, detay.birim_fiyat, satirToplami]
                );
                this.db.run(
                    'UPDATE urunler SET stok_miktari = stok_miktari - ? WHERE id = ?',
                    [detay.miktar, detay.urun_id]
                );
                this.db.run(
                    'INSERT INTO stok_hareketleri (urun_id, hareket_tipi, miktar, aciklama) VALUES (?, ?, ?, ?)',
                    [detay.urun_id, 'cikis', detay.miktar, `Sipariş rezervasyonu: ${siparisData.siparis_no}`]
                );
            }

            this.db.run(
                `INSERT INTO siparis_gecmisi
                    (siparis_id, olay_tipi, baslik, aciklama, yeni_durum, kullanici)
                 VALUES (?, 'olusturuldu', 'Sipariş oluşturuldu', ?, 'bekliyor', 'Kullanıcı')`,
                [siparisId, `${detaylar.length} ürün satırı ile sipariş oluşturuldu.`]
            );

            this.db.exec('COMMIT');
            this.saveDatabase();
            return siparisId;
        } catch (error) {
            console.error('addSiparis hatası:', error);
            // Hata durumunda rollback yap
            try {
                this.db.exec('ROLLBACK');
            } catch (rollbackError) {
                console.error('Rollback hatası:', rollbackError);
            }
            throw error;
        }
    }

    getRowSync(sql, params = []) {
        const stmt = this.db.prepare(sql);
        try {
            stmt.bind(params);
            return stmt.step() ? stmt.getAsObject() : null;
        } finally {
            stmt.free();
        }
    }

    normalizeSiparisDetaylari(detaylar) {
        const birlesik = new Map();
        for (const hamDetay of detaylar || []) {
            const detay = {
                urun_id: Number(hamDetay.urun_id),
                miktar: Number(hamDetay.miktar),
                birim_fiyat: Number(hamDetay.birim_fiyat)
            };
            if (!Number.isInteger(detay.urun_id) || detay.urun_id <= 0 ||
                !Number.isInteger(detay.miktar) || detay.miktar <= 0 ||
                !Number.isFinite(detay.birim_fiyat) || detay.birim_fiyat < 0) {
                throw new Error('Sipariş için geçerli ürün, miktar ve fiyat bilgileri gereklidir.');
            }
            const mevcut = birlesik.get(detay.urun_id);
            if (mevcut) {
                mevcut.miktar += detay.miktar;
            } else {
                birlesik.set(detay.urun_id, detay);
            }
        }
        if (!birlesik.size) throw new Error('Siparişte en az bir ürün olmalıdır.');
        return [...birlesik.values()];
    }

    async getSiparisDetay(siparisId) {
        const [siparis] = await this.query(`
            SELECT s.*, m.ad as musteri_adi, m.telefon as musteri_telefon,
                   m.sehir as musteri_sehir, m.adres as musteri_adres
            FROM siparisler s
            LEFT JOIN musteriler m ON m.id = s.musteri_id
            WHERE s.id = ?
        `, [siparisId]);
        if (!siparis) return null;

        siparis.detaylar = await this.query(`
            SELECT sd.*, u.kod as urun_kodu, u.ad as urun_adi,
                   u.stok_miktari as mevcut_stok,
                   COALESCE((
                       SELECT SUM(idt.miktar)
                       FROM iade_detaylari idt
                       JOIN iadeler i ON i.id = idt.iade_id
                       WHERE idt.siparis_detay_id = sd.id AND i.durum <> 'iptal'
                   ), 0) as iade_miktari
            FROM siparis_detaylari sd
            JOIN urunler u ON u.id = sd.urun_id
            WHERE sd.siparis_id = ?
            ORDER BY sd.id
        `, [siparisId]);
        return siparis;
    }

    async updateSiparis(siparisId, siparisData) {
        await this.initPromise;
        const mevcutSiparis = await this.getSiparisDetay(siparisId);
        if (!mevcutSiparis) throw new Error('Sipariş bulunamadı.');
        if (mevcutSiparis.durum !== 'bekliyor') {
            throw new Error('Yalnızca bekleyen siparişler düzenlenebilir.');
        }

        const detaylar = this.normalizeSiparisDetaylari(siparisData.detaylar);

        try {
            this.db.exec('BEGIN TRANSACTION');

            // Önce eski rezervasyonu serbest bırak; hata olursa transaction geri alınır.
            for (const eskiDetay of mevcutSiparis.detaylar) {
                this.db.run('UPDATE urunler SET stok_miktari = stok_miktari + ? WHERE id = ?', [eskiDetay.miktar, eskiDetay.urun_id]);
            }

            for (const detay of detaylar) {
                const urun = this.getRowSync('SELECT ad, stok_miktari FROM urunler WHERE id = ?', [detay.urun_id]);
                if (!urun || Number(urun.stok_miktari) < detay.miktar) {
                    throw new Error(`${urun?.ad || 'Ürün'} için yetersiz stok. Mevcut: ${urun?.stok_miktari || 0}`);
                }
            }

            this.db.run('DELETE FROM siparis_detaylari WHERE siparis_id = ?', [siparisId]);
            for (const detay of detaylar) {
                this.db.run(
                    'INSERT INTO siparis_detaylari (siparis_id, urun_id, miktar, birim_fiyat, toplam) VALUES (?, ?, ?, ?, ?)',
                    [siparisId, detay.urun_id, detay.miktar, detay.birim_fiyat, detay.miktar * detay.birim_fiyat]
                );
                this.db.run('UPDATE urunler SET stok_miktari = stok_miktari - ? WHERE id = ?', [detay.miktar, detay.urun_id]);
            }

            // Stok hareketlerinde düzenleme işlemini net ve denetlenebilir tek olay olarak kaydet.
            const urunIds = new Set([
                ...mevcutSiparis.detaylar.map(item => Number(item.urun_id)),
                ...detaylar.map(item => Number(item.urun_id))
            ]);
            for (const urunId of urunIds) {
                const eski = mevcutSiparis.detaylar.filter(item => Number(item.urun_id) === urunId).reduce((t, item) => t + Number(item.miktar), 0);
                const yeni = detaylar.filter(item => Number(item.urun_id) === urunId).reduce((t, item) => t + Number(item.miktar), 0);
                const fark = eski - yeni;
                if (fark !== 0) {
                    this.db.run(
                        'INSERT INTO stok_hareketleri (urun_id, hareket_tipi, miktar, aciklama) VALUES (?, ?, ?, ?)',
                        [urunId, fark > 0 ? 'giris' : 'cikis', Math.abs(fark), `Sipariş düzenleme: ${mevcutSiparis.siparis_no}`]
                    );
                }
            }

            this.db.run(
                'UPDATE siparisler SET musteri_id = ?, toplam_tutar = ?, notlar = ? WHERE id = ?',
                [siparisData.musteri_id, siparisData.toplam_tutar, siparisData.notlar || '', siparisId]
            );
            this.db.run(
                `INSERT INTO siparis_gecmisi
                    (siparis_id, olay_tipi, baslik, aciklama, kullanici)
                 VALUES (?, 'duzenlendi', 'Sipariş düzenlendi', ?, 'Kullanıcı')`,
                [siparisId, `Müşteri ve ürün satırları güncellendi. Yeni toplam: ${Number(siparisData.toplam_tutar).toFixed(2)} TL`]
            );
            this.db.exec('COMMIT');
            this.saveDatabase();
        } catch (error) {
            try { this.db.exec('ROLLBACK'); } catch (_) {}
            throw error;
        }
    }

    async changeSiparisDurum(siparisId, yeniDurum, baslik, aciklama = '') {
        await this.initPromise;
        const mevcut = this.getRowSync('SELECT durum FROM siparisler WHERE id = ?', [siparisId]);
        if (!mevcut) throw new Error('Sipariş bulunamadı.');
        const tarihAlanlari = {
            onaylandi: 'onay_tarihi = CURRENT_TIMESTAMP',
            sevk_edildi: 'sevk_tarihi = CURRENT_TIMESTAMP',
            teslim_edildi: 'teslimat_tarihi = CURRENT_TIMESTAMP'
        };
        const ekAlan = tarihAlanlari[yeniDurum] ? `, ${tarihAlanlari[yeniDurum]}` : '';
        try {
            this.db.exec('BEGIN TRANSACTION');
            this.db.run(`UPDATE siparisler SET durum = ?${ekAlan} WHERE id = ?`, [yeniDurum, siparisId]);
            this.syncSevkiyatDurumForSiparisSync(siparisId, yeniDurum);
            this.db.run(
                `INSERT INTO siparis_gecmisi
                    (siparis_id, olay_tipi, baslik, aciklama, onceki_durum, yeni_durum, kullanici)
                 VALUES (?, 'durum', ?, ?, ?, ?, 'Kullanıcı')`,
                [siparisId, baslik, aciklama, mevcut.durum, yeniDurum]
            );
            this.db.exec('COMMIT');
            this.saveDatabase();
        } catch (error) {
            try { this.db.exec('ROLLBACK'); } catch (_) {}
            throw error;
        }
    }

    syncSevkiyatDurumForSiparisSync(siparisId, siparisDurumu) {
        const sevkiyatDurumu = ({
            onaylandi: 'planlandi',
            hazirlaniyor: 'hazirlaniyor',
            sevk_edildi: 'yola_cikti',
            kargoya_verildi: 'yola_cikti',
            dagitim_subesinde: 'yola_cikti',
            dagitimda: 'yola_cikti',
            teslim_edildi: 'teslim_edildi'
        })[siparisDurumu];

        // İade/fatura gibi lojistik dışı durumlar mevcut sevkiyat sonucunu değiştirmez.
        if (!sevkiyatDurumu) return;

        this.db.run(
            'UPDATE sevkiyat_detaylari SET durum = ? WHERE siparis_id = ?',
            [sevkiyatDurumu, siparisId]
        );

        // Bir planda birden fazla sipariş varsa planın genel durumunu tüm detaylardan türet.
        this.db.run(`
            UPDATE sevkiyat_planlari
            SET durum = CASE
                WHEN durum = 'iptal' THEN 'iptal'
                WHEN NOT EXISTS (
                    SELECT 1 FROM sevkiyat_detaylari sd
                    WHERE sd.sevkiyat_plan_id = sevkiyat_planlari.id
                      AND sd.durum <> 'teslim_edildi'
                ) THEN 'teslim_edildi'
                WHEN EXISTS (
                    SELECT 1 FROM sevkiyat_detaylari sd
                    WHERE sd.sevkiyat_plan_id = sevkiyat_planlari.id
                      AND sd.durum IN ('yola_cikti', 'sevk_edildi', 'kargoya_verildi', 'dagitim_subesinde', 'dagitimda')
                ) THEN 'yola_cikti'
                WHEN EXISTS (
                    SELECT 1 FROM sevkiyat_detaylari sd
                    WHERE sd.sevkiyat_plan_id = sevkiyat_planlari.id
                      AND sd.durum = 'hazirlaniyor'
                ) THEN 'hazirlaniyor'
                ELSE 'planlandi'
            END
            WHERE id IN (
                SELECT sevkiyat_plan_id FROM sevkiyat_detaylari WHERE siparis_id = ?
            )
        `, [siparisId]);
    }

    async cancelSiparis(siparisId) {
        await this.initPromise;
        const siparis = await this.getSiparisDetay(siparisId);
        if (!siparis) throw new Error('Sipariş bulunamadı.');
        if (siparis.durum !== 'bekliyor') throw new Error('Yalnızca bekleyen siparişler iptal edilebilir.');
        try {
            this.db.exec('BEGIN TRANSACTION');
            for (const detay of siparis.detaylar) {
                this.db.run('UPDATE urunler SET stok_miktari = stok_miktari + ? WHERE id = ?', [detay.miktar, detay.urun_id]);
                this.db.run(
                    'INSERT INTO stok_hareketleri (urun_id, hareket_tipi, miktar, aciklama) VALUES (?, ?, ?, ?)',
                    [detay.urun_id, 'giris', detay.miktar, `Sipariş iptali: ${siparis.siparis_no}`]
                );
            }
            this.db.run("UPDATE siparisler SET durum = 'iptal' WHERE id = ?", [siparisId]);
            this.db.run(
                `INSERT INTO siparis_gecmisi
                    (siparis_id, olay_tipi, baslik, aciklama, onceki_durum, yeni_durum, kullanici)
                 VALUES (?, 'durum', 'Sipariş iptal edildi', 'Ayrılan stok ürünlere geri eklendi.', ?, 'iptal', 'Kullanıcı')`,
                [siparisId, siparis.durum]
            );
            this.db.exec('COMMIT');
            this.saveDatabase();
        } catch (error) {
            try { this.db.exec('ROLLBACK'); } catch (_) {}
            throw error;
        }
    }

    async getSiparisGecmisi(siparisId) {
        return await this.query(`
            SELECT * FROM siparis_gecmisi
            WHERE siparis_id = ?
            ORDER BY datetime(tarih) ASC, id ASC
        `, [siparisId]);
    }

    async createIade(iadeData) {
        await this.initPromise;
        const siparis = await this.getSiparisDetay(iadeData.siparis_id);
        if (!siparis) throw new Error('Sipariş bulunamadı.');
        if (!['teslim_edildi', 'faturalanmis', 'kismi_iade'].includes(siparis.durum)) {
            throw new Error('Yalnızca teslim edilmiş veya faturalanmış siparişlerde iade alınabilir.');
        }

        const satirlar = iadeData.detaylar
            .map(item => ({ siparis_detay_id: Number(item.siparis_detay_id), miktar: Number(item.miktar) }))
            .filter(item => item.miktar > 0);
        if (!satirlar.length) throw new Error('İade edilecek en az bir ürün seçin.');

        let toplamTutar = 0;
        for (const satir of satirlar) {
            const detay = siparis.detaylar.find(item => Number(item.id) === satir.siparis_detay_id);
            if (!detay) throw new Error('İade satırı siparişle eşleşmiyor.');
            const kalan = Number(detay.miktar) - Number(detay.iade_miktari || 0);
            if (satir.miktar > kalan) throw new Error(`${detay.urun_adi} için en fazla ${kalan} adet iade alınabilir.`);
            toplamTutar += satir.miktar * Number(detay.birim_fiyat);
        }

        const iadeNo = `IAD${new Date().toISOString().replace(/\D/g, '').slice(2, 14)}${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`;
        try {
            this.db.exec('BEGIN TRANSACTION');
            this.db.run(
                `INSERT INTO iadeler (iade_no, siparis_id, neden, aciklama, toplam_tutar)
                 VALUES (?, ?, ?, ?, ?)`,
                [iadeNo, siparis.id, iadeData.neden, iadeData.aciklama || '', toplamTutar]
            );
            const [result] = this.db.exec('SELECT last_insert_rowid() as id');
            const iadeId = result.values[0][0];

            for (const satir of satirlar) {
                const detay = siparis.detaylar.find(item => Number(item.id) === satir.siparis_detay_id);
                const toplam = satir.miktar * Number(detay.birim_fiyat);
                this.db.run(
                    `INSERT INTO iade_detaylari
                        (iade_id, siparis_detay_id, urun_id, miktar, birim_fiyat, toplam)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [iadeId, detay.id, detay.urun_id, satir.miktar, detay.birim_fiyat, toplam]
                );
                this.db.run('UPDATE urunler SET stok_miktari = stok_miktari + ? WHERE id = ?', [satir.miktar, detay.urun_id]);
                this.db.run(
                    'INSERT INTO stok_hareketleri (urun_id, hareket_tipi, miktar, aciklama) VALUES (?, ?, ?, ?)',
                    [detay.urun_id, 'giris', satir.miktar, `Müşteri iadesi: ${iadeNo} / ${siparis.siparis_no}`]
                );
            }

            const toplamSiparisMiktari = siparis.detaylar.reduce((t, item) => t + Number(item.miktar), 0);
            const oncekiIade = siparis.detaylar.reduce((t, item) => t + Number(item.iade_miktari || 0), 0);
            const yeniIade = satirlar.reduce((t, item) => t + item.miktar, 0);
            const yeniDurum = oncekiIade + yeniIade >= toplamSiparisMiktari ? 'iade_edildi' : 'kismi_iade';
            this.db.run('UPDATE siparisler SET durum = ? WHERE id = ?', [yeniDurum, siparis.id]);
            this.db.run(
                `INSERT INTO siparis_gecmisi
                    (siparis_id, olay_tipi, baslik, aciklama, onceki_durum, yeni_durum, kullanici)
                 VALUES (?, 'iade', ?, ?, ?, ?, 'Kullanıcı')`,
                [siparis.id, `${iadeNo} numaralı iade oluşturuldu`, `${yeniIade} adet ürün, ${toplamTutar.toFixed(2)} TL tutarla stoğa alındı. Neden: ${iadeData.neden}`, siparis.durum, yeniDurum]
            );
            this.db.exec('COMMIT');
            this.saveDatabase();
            return iadeId;
        } catch (error) {
            try { this.db.exec('ROLLBACK'); } catch (_) {}
            throw error;
        }
    }

    async getSiparisIadeleri(siparisId) {
        return await this.query(`
            SELECT i.*, GROUP_CONCAT(u.ad || ' (' || idt.miktar || ' adet)', ', ') as urunler
            FROM iadeler i
            LEFT JOIN iade_detaylari idt ON idt.iade_id = i.id
            LEFT JOIN urunler u ON u.id = idt.urun_id
            WHERE i.siparis_id = ?
            GROUP BY i.id
            ORDER BY datetime(i.tarih) DESC, i.id DESC
        `, [siparisId]);
    }

    async saveSevkiyatPlan(planData) {
        await this.initPromise;
        const planId = planData.id ? Number(planData.id) : null;
        const izinliDurumlar = ['planlandi', 'hazirlaniyor', 'yola_cikti', 'teslim_edildi'];
        const durum = planData.durum || 'planlandi';
        const siparisIds = [...new Set((planData.siparis_ids || []).map(Number).filter(Number.isInteger))];

        if (!String(planData.plan_adi || '').trim() || !planData.tarih) {
            throw new Error('Plan adı ve sevkiyat tarihi zorunludur.');
        }
        if (!izinliDurumlar.includes(durum)) throw new Error('Geçersiz sevkiyat durumu.');
        if (!siparisIds.length) throw new Error('Plana en az bir sipariş ekleyin.');

        const mevcutPlan = planId
            ? this.getRowSync('SELECT * FROM sevkiyat_planlari WHERE id = ?', [planId])
            : null;
        if (planId && !mevcutPlan) throw new Error('Düzenlenecek sevkiyat planı bulunamadı.');
        if (mevcutPlan?.durum === 'iptal') throw new Error('İptal edilmiş sevkiyat planı düzenlenemez.');

        const mevcutDetaylar = planId
            ? await this.query('SELECT siparis_id FROM sevkiyat_detaylari WHERE sevkiyat_plan_id = ?', [planId])
            : [];
        const mevcutSiparisIds = mevcutDetaylar.map(item => Number(item.siparis_id));
        const cikarilanlar = mevcutSiparisIds.filter(id => !siparisIds.includes(id));

        if (mevcutPlan && ['yola_cikti', 'teslim_edildi'].includes(mevcutPlan.durum) && cikarilanlar.length) {
            throw new Error('Yola çıkmış veya teslim edilmiş plandan sipariş çıkarılamaz.');
        }

        for (const siparisId of siparisIds) {
            const siparis = this.getRowSync('SELECT id, siparis_no, durum FROM siparisler WHERE id = ?', [siparisId]);
            if (!siparis) throw new Error('Seçilen siparişlerden biri bulunamadı.');
            const baskaPlan = this.getRowSync(`
                SELECT sp.plan_adi
                FROM sevkiyat_detaylari sd
                JOIN sevkiyat_planlari sp ON sp.id = sd.sevkiyat_plan_id
                WHERE sd.siparis_id = ? AND sp.durum <> 'iptal' AND sp.id <> ?
                LIMIT 1
            `, [siparisId, planId || 0]);
            if (baskaPlan) throw new Error(`${siparis.siparis_no} zaten "${baskaPlan.plan_adi}" planında.`);
            if (!mevcutSiparisIds.includes(siparisId) && siparis.durum !== 'onaylandi') {
                throw new Error(`${siparis.siparis_no} yalnızca onaylandı durumundayken yeni bir plana eklenebilir.`);
            }
        }

        const detayDurumu = ({
            planlandi: 'planlandi',
            hazirlaniyor: 'hazirlaniyor',
            yola_cikti: 'yola_cikti',
            teslim_edildi: 'teslim_edildi'
        })[durum];
        const siparisDurumu = ({
            planlandi: 'onaylandi',
            hazirlaniyor: 'hazirlaniyor',
            yola_cikti: 'sevk_edildi',
            teslim_edildi: 'teslim_edildi'
        })[durum];

        try {
            this.db.exec('BEGIN TRANSACTION');
            let kaydedilenPlanId = planId;
            if (planId) {
                this.db.run(
                    `UPDATE sevkiyat_planlari
                     SET plan_adi = ?, tarih = ?, durum = ?, aciklama = ?
                     WHERE id = ?`,
                    [String(planData.plan_adi).trim(), planData.tarih, durum, String(planData.aciklama || '').trim(), planId]
                );
            } else {
                this.db.run(
                    `INSERT INTO sevkiyat_planlari (plan_adi, tarih, durum, aciklama)
                     VALUES (?, ?, ?, ?)`,
                    [String(planData.plan_adi).trim(), planData.tarih, durum, String(planData.aciklama || '').trim()]
                );
                const [result] = this.db.exec('SELECT last_insert_rowid() as id');
                kaydedilenPlanId = result.values[0][0];
            }

            // Henüz yola çıkmamış plandan çıkarılan sipariş yeniden planlanabilir.
            for (const siparisId of cikarilanlar) {
                const siparis = this.getRowSync('SELECT siparis_no, durum FROM siparisler WHERE id = ?', [siparisId]);
                if (['onaylandi', 'hazirlaniyor'].includes(siparis?.durum)) {
                    this.db.run("UPDATE siparisler SET durum = 'onaylandi' WHERE id = ?", [siparisId]);
                }
                this.db.run(
                    `INSERT INTO siparis_gecmisi
                        (siparis_id, olay_tipi, baslik, aciklama, kullanici)
                     VALUES (?, 'sevkiyat', 'Sevkiyat planından çıkarıldı', ?, 'Kullanıcı')`,
                    [siparisId, `${mevcutPlan.plan_adi} planından manuel olarak çıkarıldı.`]
                );
            }

            this.db.run('DELETE FROM sevkiyat_detaylari WHERE sevkiyat_plan_id = ?', [kaydedilenPlanId]);
            for (const siparisId of siparisIds) {
                const onceki = this.getRowSync('SELECT durum FROM siparisler WHERE id = ?', [siparisId]);
                this.db.run(
                    `INSERT INTO sevkiyat_detaylari (sevkiyat_plan_id, siparis_id, durum)
                     VALUES (?, ?, ?)`,
                    [kaydedilenPlanId, siparisId, detayDurumu]
                );

                const tarihGuncellemesi = siparisDurumu === 'sevk_edildi'
                    ? ', sevk_tarihi = COALESCE(sevk_tarihi, CURRENT_TIMESTAMP)'
                    : (siparisDurumu === 'teslim_edildi'
                        ? ', teslimat_tarihi = COALESCE(teslimat_tarihi, CURRENT_TIMESTAMP)'
                        : '');
                this.db.run(`UPDATE siparisler SET durum = ?${tarihGuncellemesi} WHERE id = ?`, [siparisDurumu, siparisId]);

                const yeniEklendi = !mevcutSiparisIds.includes(siparisId);
                if (yeniEklendi || onceki?.durum !== siparisDurumu) {
                    this.db.run(
                        `INSERT INTO siparis_gecmisi
                            (siparis_id, olay_tipi, baslik, aciklama, onceki_durum, yeni_durum, kullanici)
                         VALUES (?, 'sevkiyat', ?, ?, ?, ?, 'Kullanıcı')`,
                        [
                            siparisId,
                            yeniEklendi ? 'Manuel sevkiyat planına eklendi' : 'Sevkiyat planı manuel güncellendi',
                            `${String(planData.plan_adi).trim()} · ${planData.tarih}`,
                            onceki?.durum || null,
                            siparisDurumu
                        ]
                    );
                }
            }

            this.db.exec('COMMIT');
            this.saveDatabase();
            return kaydedilenPlanId;
        } catch (error) {
            try { this.db.exec('ROLLBACK'); } catch (_) {}
            throw error;
        }
    }

    async musteriKontrolEtVeyaEkle(musteriAdi, musteriTelefon, musteriSehir, musteriAdres) {
        await this.initPromise;
        try {
            // Önce müşteriyi ara (ad ve telefon ile)
            const mevcutMusteri = await this.query('SELECT id FROM musteriler WHERE ad = ? AND telefon = ?', [musteriAdi, musteriTelefon]);
            
            if (mevcutMusteri.length > 0) {
                // Mevcut müşterinin bilgilerini güncelle
                await this.execute('UPDATE musteriler SET sehir = ?, adres = ? WHERE id = ?', [musteriSehir, musteriAdres, mevcutMusteri[0].id]);
                return mevcutMusteri[0].id;
            }
            
            // Müşteri yoksa ekle
            this.db.run('INSERT INTO musteriler (ad, telefon, sehir, adres) VALUES (?, ?, ?, ?)', [musteriAdi, musteriTelefon, musteriSehir, musteriAdres]);
            const [result] = this.db.exec('SELECT last_insert_rowid() as id');
            const musteriId = result.values[0][0];
            
            this.saveDatabase();
            
            console.log('Yeni müşteri eklendi:', musteriAdi, 'ID:', musteriId);
            return musteriId;
        } catch (error) {
            console.error('Müşteri kontrol/ekleme hatası:', error);
            throw error;
        }
    }

    async createFatura(faturaData) {
        await this.initPromise;
        try {
            console.log('createFatura çağrıldı:', faturaData);
            
            // Transaction başlat
            this.db.exec('BEGIN TRANSACTION');
            
            // Faturayı ekle
            this.db.run(
                `INSERT INTO faturalar (
                    fatura_no, siparis_id, musteri_id, vade_tarihi, 
                    ara_toplam, kdv_orani, kdv_tutari, toplam_tutar, 
                    odeme_sekli, notlar
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    faturaData.fatura_no, faturaData.siparis_id, faturaData.musteri_id,
                    faturaData.vade_tarihi, faturaData.ara_toplam, faturaData.kdv_orani,
                    faturaData.kdv_tutari, faturaData.toplam_tutar, faturaData.odeme_sekli,
                    faturaData.notlar
                ]
            );
            
            // Son eklenen faturanın ID'sini al
            const [result] = this.db.exec('SELECT last_insert_rowid() as id');
            const faturaId = result.values[0][0];
            
            console.log('Fatura eklendi, ID:', faturaId);
            
            // Fatura detaylarını ekle
            for (const detay of faturaData.detaylar) {
                this.db.run(
                    `INSERT INTO fatura_detaylari (
                        fatura_id, urun_id, miktar, birim_fiyat, 
                        kdv_orani, ara_toplam, kdv_tutari, toplam
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        faturaId, detay.urun_id, detay.miktar, detay.birim_fiyat,
                        detay.kdv_orani, detay.ara_toplam, detay.kdv_tutari, detay.toplam
                    ]
                );
            }
            
            // Faturalama bir lojistik durum değildir; siparişin sevkiyat akışını
            // bozmadan zaman çizelgesine ayrı bir olay olarak ekle.
            this.db.run(
                `INSERT INTO siparis_gecmisi
                    (siparis_id, olay_tipi, baslik, aciklama, kullanici)
                 VALUES (?, 'fatura', 'Fatura oluşturuldu', ?, 'Kullanıcı')`,
                [faturaData.siparis_id, `${faturaData.fatura_no} numaralı fatura oluşturuldu.`]
            );
            
            // Transaction'ı commit et
            this.db.exec('COMMIT');
            
            // Veritabanını kaydet
            this.saveDatabase();
            
            console.log('Fatura transaction tamamlandı');
            return faturaId;
            
        } catch (error) {
            console.error('createFatura hatası:', error);
            // Hata durumunda rollback yap
            try {
                this.db.exec('ROLLBACK');
            } catch (rollbackError) {
                console.error('Rollback hatası:', rollbackError);
            }
            throw error;
        }
    }

    async getFaturalar() {
        console.log('getFaturalar fonksiyonu çağrıldı');
        
        return await this.query(`
            SELECT 
                f.id,
                f.fatura_no,
                f.tarih,
                f.vade_tarihi,
                f.durum,
                f.ara_toplam,
                f.kdv_tutari,
                f.toplam_tutar,
                f.odeme_sekli,
                f.notlar,
                s.siparis_no,
                COALESCE(m.ad, 'Bilinmeyen Müşteri') as musteri_adi,
                COALESCE(m.telefon, '') as musteri_telefon,
                COALESCE(m.sehir, '') as musteri_sehir
            FROM faturalar f
            LEFT JOIN siparisler s ON f.siparis_id = s.id
            LEFT JOIN musteriler m ON f.musteri_id = m.id
            ORDER BY f.tarih DESC
        `);
    }

    async getFaturaDetaylari(faturaId) {
        return await this.query(`
            SELECT 
                fd.*,
                u.ad as urun_adi,
                u.kod as urun_kodu
            FROM fatura_detaylari fd
            LEFT JOIN urunler u ON fd.urun_id = u.id
            WHERE fd.fatura_id = ?
        `, [faturaId]);
    }

    async getFaturaWithDetails(faturaId) {
        const [fatura] = await this.query(`
            SELECT 
                f.*,
                s.siparis_no,
                m.ad as musteri_adi,
                m.telefon as musteri_telefon,
                m.sehir as musteri_sehir,
                m.adres as musteri_adres
            FROM faturalar f
            LEFT JOIN siparisler s ON f.siparis_id = s.id
            LEFT JOIN musteriler m ON f.musteri_id = m.id
            WHERE f.id = ?
        `, [faturaId]);

        if (fatura) {
            fatura.detaylar = await this.getFaturaDetaylari(faturaId);
        }

        return fatura;
    }

    async addSevkiyatTakip(takipData) {
        await this.initPromise;
        try {
            console.log('Sevkiyat takip ekleniyor:', takipData);
            const mevcut = this.getRowSync('SELECT durum FROM siparisler WHERE id = ?', [takipData.siparis_id]);
            if (!mevcut) throw new Error('Sipariş bulunamadı.');
            this.db.exec('BEGIN TRANSACTION');

            // Önce sevkiyat takip kaydını ekle
            this.db.run(
                `INSERT INTO sevkiyat_takip (siparis_id, durum, aciklama, konum, kullanici) 
                 VALUES (?, ?, ?, ?, ?)`,
                [takipData.siparis_id, takipData.durum, takipData.aciklama, takipData.konum, takipData.kullanici]
            );
            
            console.log('Sevkiyat takip kaydı eklendi, şimdi sipariş durumu güncelleniyor...');
            
            // Siparişin ana durumunu da güncelle
            this.db.run(
                'UPDATE siparisler SET durum = ? WHERE id = ?',
                [takipData.durum, takipData.siparis_id]
            );
            this.syncSevkiyatDurumForSiparisSync(takipData.siparis_id, takipData.durum);

            this.db.run(
                `INSERT INTO siparis_gecmisi
                    (siparis_id, olay_tipi, baslik, aciklama, onceki_durum, yeni_durum, kullanici)
                 VALUES (?, 'sevkiyat', 'Sevkiyat durumu güncellendi', ?, ?, ?, ?)`,
                [
                    takipData.siparis_id,
                    [takipData.aciklama, takipData.konum].filter(Boolean).join(' · '),
                    mevcut.durum,
                    takipData.durum,
                    takipData.kullanici || 'Kullanıcı'
                ]
            );
            
            console.log('Sipariş durumu güncellendi:', takipData.durum, 'için sipariş ID:', takipData.siparis_id);
            
            this.db.exec('COMMIT');
            this.saveDatabase();
            console.log('Veritabanı kaydedildi');
            
        } catch (error) {
            try { this.db.exec('ROLLBACK'); } catch (_) {}
            console.error('Sevkiyat takip ekleme hatası:', error);
            throw error;
        }
    }

    async getSevkiyatTakip(siparisId) {
        return await this.query(`
            SELECT * FROM sevkiyat_takip 
            WHERE siparis_id = ? 
            ORDER BY tarih ASC
        `, [siparisId]);
    }

    async getSiparislerWithTakip() {
        const siparisler = await this.getSiparisler();
        
        // Her sipariş için son takip durumunu al
        for (let siparis of siparisler) {
            const sonTakip = await this.query(`
                SELECT * FROM sevkiyat_takip 
                WHERE siparis_id = ? 
                ORDER BY tarih DESC 
                LIMIT 1
            `, [siparis.id]);
            
            siparis.son_takip = sonTakip.length > 0 ? sonTakip[0] : null;
            siparis.son_durum = siparis.son_takip ? siparis.son_takip.durum : siparis.durum;
        }
        
        return siparisler;
    }

    async updateSiparisDurum(siparisId, yeniDurum) {
        return await this.changeSiparisDurum(
            siparisId,
            yeniDurum,
            'Sipariş durumu güncellendi',
            `Yeni durum: ${yeniDurum}`
        );
    }
}

// Global veritabanı nesnesi
const db = new DatabaseManager();
