// Stok Yönetimi
class StokManager {
    constructor() {
        this.urunler = [];
        this.filtrelenmis_urunler = [];
        this.init();
    }

    async init() {
        await this.urunleriYukle();
        this.eventListenerEkle();
        this.stokTabloGuncelle();
    }

    eventListenerEkle() {
        // Stok güncelleme butonu
        document.getElementById('stokGuncelleBtn').addEventListener('click', () => {
            this.yeniUrunEkle();
        });

        // Modal kapama
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-close') || e.target.dataset.modal) {
                const modalId = e.target.dataset.modal || e.target.closest('.modal').id;
                if (document.getElementById(modalId)) {
                    this.modalKapat(modalId);
                }
            }
        });

        // Stok güncelleme formu
        document.getElementById('stokGuncelleForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.stokGuncelle();
        });
    }

    async urunleriYukle() {
        try {
            this.urunler = await db.getUrunler();
            this.filtrelenmis_urunler = [...this.urunler];
        } catch (error) {
            console.error('Ürünler yüklenirken hata:', error);
            this.hataGoster('Ürünler yüklenirken bir hata oluştu');
        }
    }

    stokTabloGuncelle() {
        const tbody = document.getElementById('stokListesiBody');
        tbody.innerHTML = '';

        if (this.filtrelenmis_urunler.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center">
                        <div class="empty-state">
                            <i class="fas fa-boxes"></i>
                            <h3>Henüz ürün bulunmuyor</h3>
                            <p>İlk ürününüzü eklemek için "Stok Güncelle" butonuna tıklayın</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        this.filtrelenmis_urunler.forEach(urun => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="font-semibold">${urun.kod}</td>
                <td>
                    <div class="font-medium">${urun.ad}</div>
                    <div class="text-gray-500 text-sm">${urun.aciklama || ''}</div>
                </td>
                <td class="text-center">
                    <span class="font-semibold ${this.getStokRenkClass(urun.stok_miktari, urun.minimum_stok)}">
                        ${urun.stok_miktari}
                    </span>
                </td>
                <td class="text-center">${urun.minimum_stok}</td>
                <td class="font-semibold">${this.formatTutar(urun.birim_fiyat)}</td>
                <td>
                    <span class="status-badge ${this.getStokDurumClass(urun.stok_durumu)}">
                        ${this.getStokDurumText(urun.stok_durumu)}
                    </span>
                </td>
                <td>
                    <div class="actions">
                        <button class="btn btn-primary btn-sm" onclick="stokManager.stokGuncelleModalAc('${urun.id}')">
                            <i class="fas fa-edit"></i> Güncelle
                        </button>
                        <button class="btn btn-info btn-sm" onclick="stokManager.stokHareketleriGoster('${urun.id}')">
                            <i class="fas fa-history"></i> Hareketler
                        </button>
                        <button class="btn btn-warning btn-sm" onclick="stokManager.fiyatGuncelle('${urun.id}')">
                            <i class="fas fa-tag"></i> Fiyat
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    getStokRenkClass(stokMiktari, minimumStok) {
        if (stokMiktari <= 0) return 'text-danger';
        if (stokMiktari <= minimumStok) return 'text-warning';
        return 'text-success';
    }

    getStokDurumClass(durum) {
        const durumClasses = {
            'stok_yok': 'out-of-stock',
            'dusuk_stok': 'low-stock',
            'normal': 'in-stock'
        };
        return durumClasses[durum] || 'in-stock';
    }

    getStokDurumText(durum) {
        const durumTexts = {
            'stok_yok': 'Stok Yok',
            'dusuk_stok': 'Düşük Stok',
            'normal': 'Yeterli'
        };
        return durumTexts[durum] || 'Bilinmeyen';
    }

    async stokGuncelleModalAc(urunId) {
        try {
            const urun = this.urunler.find(u => u.id == urunId);
            if (!urun) {
                this.hataGoster('Ürün bulunamadı');
                return;
            }

            document.getElementById('stokUrunKodu').value = urun.kod;
            document.getElementById('stokUrunAdi').value = urun.ad;
            document.getElementById('yeniStokMiktari').value = urun.stok_miktari;
            
            // Form'a ürün ID'sini ekle
            document.getElementById('stokGuncelleForm').dataset.urunId = urunId;
            
            this.modalAc('stokGuncelleModal');
        } catch (error) {
            console.error('Modal açma hatası:', error);
            this.hataGoster('Modal açılırken bir hata oluştu');
        }
    }

    async stokGuncelle() {
        try {
            const form = document.getElementById('stokGuncelleForm');
            const urunId = form.dataset.urunId;
            const yeniMiktar = parseInt(document.getElementById('yeniStokMiktari').value);

            if (isNaN(yeniMiktar) || yeniMiktar < 0) {
                this.hataGoster('Geçerli bir miktar girin');
                return;
            }

            // Eski miktarı al
            const urun = this.urunler.find(u => u.id == urunId);
            const eskiMiktar = urun.stok_miktari;
            const fark = yeniMiktar - eskiMiktar;

            // Stoku güncelle
            await db.execute(`
                UPDATE urunler 
                SET stok_miktari = ? 
                WHERE id = ?
            `, [yeniMiktar, urunId]);

            // Stok hareketi kaydet
            if (fark !== 0) {
                await db.execute(`
                    INSERT INTO stok_hareketleri (urun_id, hareket_tipi, miktar, aciklama)
                    VALUES (?, ?, ?, ?)
                `, [
                    urunId, 
                    'duzeltme', 
                    Math.abs(fark), 
                    `Stok düzeltmesi: ${eskiMiktar} → ${yeniMiktar}`
                ]);
            }

            this.basariGoster('Stok başarıyla güncellendi');
            this.modalKapat('stokGuncelleModal');
            
            await this.urunleriYukle();
            this.stokTabloGuncelle();
            
        } catch (error) {
            console.error('Stok güncelleme hatası:', error);
            this.hataGoster('Stok güncellenirken bir hata oluştu');
        }
    }

    async yeniUrunEkle() {
        await this.urunleriYukle();
        const otomatikKod = await this.yeniUrunKoduOlustur();

        // Yeni ürün ekleme ve mevcut ürün düzenleme modalı oluştur
        const modalHtml = `
            <div class="modal active" id="yeniUrunModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Ürün ve Stok Yönetimi</h3>
                        <button class="modal-close" data-modal="yeniUrunModal">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="yeniUrunForm">
                            <div class="form-group">
                                <label for="mevcutUrunSecim">Mevcut Ürün / Yeni Ürün</label>
                                <select id="mevcutUrunSecim">
                                    <option value="">+ Yeni ürün oluştur</option>
                                </select>
                                <small class="text-gray-500">Mevcut bir ürünü seçerseniz bilgileri ve stok miktarını güncelleyebilirsiniz.</small>
                            </div>

                            <div class="form-row">
                                <div class="form-group">
                                    <label for="yeniUrunKodu">Ürün Kodu</label>
                                    <input type="text" id="yeniUrunKodu" value="${otomatikKod}" readonly required>
                                </div>
                                <div class="form-group">
                                    <label for="yeniUrunAdi">Ürün Adı</label>
                                    <input type="text" id="yeniUrunAdi" required>
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label for="yeniUrunAciklama">Açıklama</label>
                                <textarea id="yeniUrunAciklama" rows="3"></textarea>
                            </div>
                            
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="yeniUrunFiyat">Birim Fiyat</label>
                                    <input type="number" id="yeniUrunFiyat" step="0.01" min="0" required>
                                </div>
                                <div class="form-group">
                                    <label for="yeniUrunKategori">Kategori</label>
                                    <select id="yeniUrunKategori">
                                        <option value="">Kategori seçin...</option>
                                        <option value="Elektronik">Elektronik</option>
                                        <option value="Mobilya">Mobilya</option>
                                        <option value="Aksesuar">Aksesuar</option>
                                        <option value="Tekstil">Tekstil</option>
                                        <option value="Diğer">Diğer</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="yeniUrunStok">Başlangıç Stok</label>
                                    <input type="number" id="yeniUrunStok" min="0" value="0" required>
                                </div>
                                <div class="form-group">
                                    <label for="yeniUrunMinStok">Minimum Stok</label>
                                    <input type="number" id="yeniUrunMinStok" min="0" value="10" required>
                                </div>
                            </div>
                            
                            <div class="form-actions">
                                <button type="button" class="btn btn-secondary" data-modal="yeniUrunModal">İptal</button>
                                <button type="submit" class="btn btn-primary" id="urunKaydetBtn">Ürün Ekle</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;

        // Modal'ı sayfaya ekle
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const mevcutUrunSecim = document.getElementById('mevcutUrunSecim');
        this.urunler.forEach(urun => {
            const option = document.createElement('option');
            option.value = urun.id;
            option.textContent = `${urun.kod} - ${urun.ad} (${urun.stok_miktari} adet)`;
            mevcutUrunSecim.appendChild(option);
        });

        mevcutUrunSecim.addEventListener('change', e => {
            this.urunFormunuDoldur(e.target.value, otomatikKod);
        });

        // Event listener ekle
        document.getElementById('yeniUrunForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.yeniUrunKaydet();
        });

        // Modal kapama event'leri
        document.querySelectorAll('[data-modal="yeniUrunModal"]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.modalKapat('yeniUrunModal');
                document.getElementById('yeniUrunModal').remove();
            });
        });
    }

    async yeniUrunKoduOlustur() {
        const sonuc = await db.query(`
            SELECT kod
            FROM urunler
            WHERE kod LIKE 'URT%'
            ORDER BY CAST(SUBSTR(kod, 4) AS INTEGER) DESC
            LIMIT 1
        `);

        const sonKod = sonuc[0]?.kod || 'URT000';
        const sonNumara = parseInt(sonKod.replace(/^URT/i, ''), 10) || 0;
        return `URT${String(sonNumara + 1).padStart(3, '0')}`;
    }

    urunFormunuDoldur(urunId, otomatikKod) {
        const form = document.getElementById('yeniUrunForm');
        const kaydetBtn = document.getElementById('urunKaydetBtn');
        const alanlar = {
            kod: document.getElementById('yeniUrunKodu'),
            ad: document.getElementById('yeniUrunAdi'),
            aciklama: document.getElementById('yeniUrunAciklama'),
            fiyat: document.getElementById('yeniUrunFiyat'),
            kategori: document.getElementById('yeniUrunKategori'),
            stok: document.getElementById('yeniUrunStok'),
            minStok: document.getElementById('yeniUrunMinStok')
        };

        if (!urunId) {
            form.dataset.urunId = '';
            alanlar.kod.value = otomatikKod;
            alanlar.ad.value = '';
            alanlar.aciklama.value = '';
            alanlar.fiyat.value = '';
            alanlar.kategori.value = '';
            alanlar.stok.value = 0;
            alanlar.minStok.value = 10;
            kaydetBtn.innerHTML = '<i class="fas fa-plus"></i> Ürün Ekle';
            return;
        }

        const urun = this.urunler.find(item => item.id == urunId);
        if (!urun) {
            this.hataGoster('Ürün bulunamadı');
            return;
        }

        form.dataset.urunId = urun.id;
        alanlar.kod.value = urun.kod;
        alanlar.ad.value = urun.ad;
        alanlar.aciklama.value = urun.aciklama || '';
        alanlar.fiyat.value = urun.birim_fiyat;
        alanlar.kategori.value = urun.kategori || '';
        alanlar.stok.value = urun.stok_miktari;
        alanlar.minStok.value = urun.minimum_stok;
        kaydetBtn.innerHTML = '<i class="fas fa-save"></i> Değişiklikleri Kaydet';
    }

    async yeniUrunKaydet() {
        try {
            const form = document.getElementById('yeniUrunForm');
            const urunId = form.dataset.urunId;
            const kod = document.getElementById('yeniUrunKodu').value.trim();
            const ad = document.getElementById('yeniUrunAdi').value.trim();
            const aciklama = document.getElementById('yeniUrunAciklama').value.trim();
            const fiyat = parseFloat(document.getElementById('yeniUrunFiyat').value);
            const kategori = document.getElementById('yeniUrunKategori').value;
            const stok = parseInt(document.getElementById('yeniUrunStok').value);
            const minStok = parseInt(document.getElementById('yeniUrunMinStok').value);

            // Validasyon
            if (!kod || !ad || isNaN(fiyat) || fiyat <= 0 ||
                isNaN(stok) || stok < 0 || isNaN(minStok) || minStok < 0) {
                this.hataGoster('Lütfen tüm zorunlu alanları doğru şekilde doldurun');
                return;
            }

            if (urunId) {
                const mevcutUrun = this.urunler.find(urun => urun.id == urunId);
                if (!mevcutUrun) {
                    this.hataGoster('Güncellenecek ürün bulunamadı');
                    return;
                }

                await db.execute(`
                    UPDATE urunler
                    SET ad = ?, aciklama = ?, birim_fiyat = ?, stok_miktari = ?, minimum_stok = ?, kategori = ?
                    WHERE id = ?
                `, [ad, aciklama, fiyat, stok, minStok, kategori, urunId]);

                const stokFarki = stok - mevcutUrun.stok_miktari;
                if (stokFarki !== 0) {
                    await db.execute(`
                        INSERT INTO stok_hareketleri (urun_id, hareket_tipi, miktar, aciklama)
                        VALUES (?, 'duzeltme', ?, ?)
                    `, [urunId, Math.abs(stokFarki), `Stok düzeltmesi: ${mevcutUrun.stok_miktari} → ${stok}`]);
                }

                this.basariGoster('Ürün ve stok bilgileri güncellendi');
            } else {
                // Otomatik oluşan kodun yine de benzersiz olduğunu kayıt anında doğrula.
                const kodKontrol = await db.query('SELECT id FROM urunler WHERE kod = ?', [kod]);
                if (kodKontrol.length > 0) {
                    this.hataGoster('Otomatik ürün kodu kullanımda. Formu kapatıp yeniden açın.');
                    return;
                }

                await db.execute(`
                    INSERT INTO urunler (kod, ad, aciklama, birim_fiyat, stok_miktari, minimum_stok, kategori)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [kod, ad, aciklama, fiyat, stok, minStok, kategori]);

                if (stok > 0) {
                    const [yeniUrun] = await db.query('SELECT id FROM urunler WHERE kod = ?', [kod]);
                    const yeniUrunId = yeniUrun?.id;

                    if (!yeniUrunId) {
                        throw new Error('Yeni ürün kaydı doğrulanamadı');
                    }

                    await db.execute(`
                        INSERT INTO stok_hareketleri (urun_id, hareket_tipi, miktar, aciklama)
                        VALUES (?, 'giris', ?, ?)
                    `, [yeniUrunId, stok, 'Başlangıç stoku']);
                }

                this.basariGoster(`${kod} kodlu ürün başarıyla eklendi`);
            }

            this.modalKapat('yeniUrunModal');
            document.getElementById('yeniUrunModal').remove();
            
            await this.urunleriYukle();
            this.stokTabloGuncelle();
            
        } catch (error) {
            console.error('Ürün kaydetme hatası:', error);
            this.hataGoster('Ürün kaydedilirken bir hata oluştu');
        }
    }

    async stokHareketleriGoster(urunId) {
        try {
            const hareketler = await db.query(`
                SELECT *
                FROM stok_hareketleri
                WHERE urun_id = ?
                ORDER BY tarih DESC
                LIMIT 50
            `, [urunId]);

            const urun = this.urunler.find(u => u.id == urunId);

            let hareketlerHtml = '';
            if (hareketler.length === 0) {
                hareketlerHtml = '<p class="text-center text-gray-500">Henüz stok hareketi bulunmuyor</p>';
            } else {
                hareketlerHtml = `
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Tarih</th>
                                    <th>Tip</th>
                                    <th>Miktar</th>
                                    <th>Açıklama</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${hareketler.map(hareket => `
                                    <tr>
                                        <td>${this.formatTarih(hareket.tarih)}</td>
                                        <td>
                                            <span class="status-badge ${this.getHareketTipClass(hareket.hareket_tipi)}">
                                                ${this.getHareketTipText(hareket.hareket_tipi)}
                                            </span>
                                        </td>
                                        <td class="font-semibold">${hareket.miktar}</td>
                                        <td>${hareket.aciklama || '-'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }

            const modalHtml = `
                <div class="modal active" id="stokHareketleriModal">
                    <div class="modal-content" style="max-width: 800px;">
                        <div class="modal-header">
                            <h3>${urun.ad} - Stok Hareketleri</h3>
                            <button class="modal-close" data-modal="stokHareketleriModal">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div class="modal-body">
                            ${hareketlerHtml}
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            // Modal kapama event'i
            document.querySelector('[data-modal="stokHareketleriModal"]').addEventListener('click', () => {
                this.modalKapat('stokHareketleriModal');
                document.getElementById('stokHareketleriModal').remove();
            });

        } catch (error) {
            console.error('Stok hareketleri gösterme hatası:', error);
            this.hataGoster('Stok hareketleri gösterilirken bir hata oluştu');
        }
    }

    getHareketTipClass(tip) {
        const tipClasses = {
            'giris': 'in-stock',
            'cikis': 'out-of-stock',
            'duzeltme': 'pending'
        };
        return tipClasses[tip] || 'pending';
    }

    getHareketTipText(tip) {
        const tipTexts = {
            'giris': 'Giriş',
            'cikis': 'Çıkış',
            'duzeltme': 'Düzeltme'
        };
        return tipTexts[tip] || 'Bilinmeyen';
    }

    async fiyatGuncelle(urunId) {
        const urun = this.urunler.find(u => u.id == urunId);
        if (!urun) return;

        const yeniFiyat = prompt(`${urun.ad} için yeni fiyat girin (Mevcut: ${this.formatTutar(urun.birim_fiyat)}):`, urun.birim_fiyat);
        
        if (yeniFiyat !== null && !isNaN(yeniFiyat) && parseFloat(yeniFiyat) > 0) {
            try {
                await db.execute(`
                    UPDATE urunler 
                    SET birim_fiyat = ? 
                    WHERE id = ?
                `, [parseFloat(yeniFiyat), urunId]);

                this.basariGoster('Fiyat başarıyla güncellendi');
                await this.urunleriYukle();
                this.stokTabloGuncelle();
            } catch (error) {
                console.error('Fiyat güncelleme hatası:', error);
                this.hataGoster('Fiyat güncellenirken bir hata oluştu');
            }
        }
    }

    // Yardımcı fonksiyonlar
    formatTarih(tarih) {
        return new Date(tarih).toLocaleDateString('tr-TR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    formatTutar(tutar) {
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: 'TRY'
        }).format(tutar);
    }

    modalAc(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    modalKapat(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    basariGoster(mesaj) {
        this.toastGoster(mesaj, 'success');
    }

    hataGoster(mesaj) {
        this.toastGoster(mesaj, 'error');
    }

    toastGoster(mesaj, tip) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${tip}`;
        toast.textContent = mesaj;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: white;
            z-index: 9999;
            font-weight: 500;
            background-color: ${tip === 'success' ? '#059669' : '#dc2626'};
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
}

// Global stok yöneticisi
const stokManager = new StokManager();
