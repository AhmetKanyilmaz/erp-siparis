// Sipariş Yönetimi
class SiparisManager {
    constructor() {
        this.siparisler = [];
        this.filtrelenmis_siparisler = [];
        this.urunler = [];
        this.sepet = [];
        this.urunSatirSayaci = 0;
        this.duzenlemeRezervasyonlari = new Map();
        this.aktifIadeSiparisi = null;
        this.sayfa = 1;
        this.sayfaBoyutu = 10;
        this.init();
    }

    async init() {
        await this.siparisleriYukle();
        this.eventListenerEkle();
        this.filtreleriUygula();
    }

    eventListenerEkle() {
        document.getElementById('yeniSiparisBtn')?.addEventListener('click', () => this.yeniSiparisModalAc());
        document.getElementById('yeniSiparisForm')?.addEventListener('submit', event => {
            event.preventDefault();
            this.siparisKaydet();
        });
        document.getElementById('urunSatiriEkleBtn')?.addEventListener('click', () => this.yeniUrunSatiriEkle());
        document.getElementById('siparisUrunSatirlari')?.addEventListener('change', event => {
            if (event.target.matches('.order-line-product')) {
                this.urunSatiriUrunGuncelle(Number(event.target.dataset.rowId), Number(event.target.value));
            }
        });
        document.getElementById('siparisUrunSatirlari')?.addEventListener('input', event => {
            if (event.target.matches('.order-line-quantity')) {
                this.urunSatiriMiktarGuncelle(Number(event.target.dataset.rowId), event.target.value);
            }
        });
        document.getElementById('siparisUrunSatirlari')?.addEventListener('click', event => {
            const silBtn = event.target.closest('[data-order-line-remove]');
            if (silBtn) this.urunSatiriSil(Number(silBtn.dataset.orderLineRemove));
        });

        document.getElementById('siparisArama')?.addEventListener('input', () => this.filtreleriUygula(true));
        [
            'siparisDurumFiltre', 'siparisBaslangicTarihi', 'siparisBitisTarihi',
            'siparisSehirFiltre', 'siparisMinTutar', 'siparisMaxTutar', 'siparisSirala'
        ].forEach(id => document.getElementById(id)?.addEventListener('change', () => this.filtreleriUygula(true)));
        document.getElementById('siparisMinTutar')?.addEventListener('input', () => this.filtreleriUygula(true));
        document.getElementById('siparisMaxTutar')?.addEventListener('input', () => this.filtreleriUygula(true));
        document.getElementById('siparisFiltreTemizleBtn')?.addEventListener('click', () => this.filtreleriTemizle());
        document.getElementById('siparisYenileBtn')?.addEventListener('click', async () => {
            await this.yenile();
            this.basariGoster('Sipariş listesi yenilendi');
        });
        document.getElementById('siparisSayfalama')?.addEventListener('click', event => {
            const btn = event.target.closest('[data-page]');
            if (!btn || btn.disabled) return;
            this.sayfa = Number(btn.dataset.page);
            this.tabloGuncelle();
        });
        document.getElementById('siparisIadeForm')?.addEventListener('submit', event => {
            event.preventDefault();
            this.iadeKaydet();
        });
        document.getElementById('iadeUrunListesi')?.addEventListener('input', () => this.iadeToplaminiGuncelle());
    }

    async yenile() {
        await this.siparisleriYukle();
        this.filtreleriUygula();
        if (window.app) await window.app.istatistikleriGuncelle();
        if (window.stokManager) {
            await window.stokManager.urunleriYukle?.();
            window.stokManager.stokTabloGuncelle?.();
        }
        if (window.sevkiyatManager) {
            await window.sevkiyatManager.sevkiyatPlanlariYukle?.();
            window.sevkiyatManager.sevkiyatCardsGuncelle?.();
        }
    }

    async siparisleriYukle() {
        try {
            this.siparisler = await db.getSiparisler();
            this.sehirFiltresiniDoldur();
            if (document.getElementById('siparisDurumFiltre')) {
                this.filtreleriUygula();
            } else {
                this.filtrelenmis_siparisler = [...this.siparisler];
            }
        } catch (error) {
            console.error('Siparişler yüklenirken hata:', error);
            this.hataGoster('Siparişler yüklenirken bir hata oluştu');
        }
    }

    sehirFiltresiniDoldur() {
        const select = document.getElementById('siparisSehirFiltre');
        if (!select) return;
        const onceki = select.value;
        const sehirler = [...new Set(this.siparisler.map(item => item.musteri_sehir).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'tr'));
        select.innerHTML = '<option value="">Tüm şehirler</option>' +
            sehirler.map(sehir => `<option value="${this.escapeHtml(sehir)}">${this.escapeHtml(sehir)}</option>`).join('');
        if (sehirler.includes(onceki)) select.value = onceki;
    }

    async urunleriYukle(siparisDetaylari = []) {
        this.urunler = await db.getUrunler();
        this.duzenlemeRezervasyonlari = new Map();
        siparisDetaylari.forEach(detay => {
            const urunId = Number(detay.urun_id);
            this.duzenlemeRezervasyonlari.set(
                urunId,
                (this.duzenlemeRezervasyonlari.get(urunId) || 0) + Number(detay.miktar)
            );
        });

    }

    kullanilabilirStok(urunId) {
        const urun = this.urunler.find(item => Number(item.id) === Number(urunId));
        return Number(urun?.stok_miktari || 0) + Number(this.duzenlemeRezervasyonlari.get(Number(urunId)) || 0);
    }

    async yeniSiparisModalAc() {
        try {
            document.getElementById('yeniSiparisForm').reset();
            document.getElementById('siparisDuzenlemeId').value = '';
            document.getElementById('siparisFormBaslik').textContent = 'Yeni Sipariş Oluştur';
            document.getElementById('siparisKaydetBtn').textContent = 'Sipariş Oluştur';
            this.sepet = [];
            this.urunSatirSayaci = 0;
            await this.urunleriYukle();
            this.yeniUrunSatiriEkle();
            this.sepetiGoster();
            this.modalAc('yeniSiparisModal');
        } catch (error) {
            this.hataGoster('Sipariş formu açılamadı: ' + error.message);
        }
    }

    async siparisDuzenle(siparisId) {
        try {
            const siparis = await db.getSiparisDetay(siparisId);
            if (!siparis) throw new Error('Sipariş bulunamadı.');
            if (siparis.durum !== 'bekliyor') throw new Error('Yalnızca bekleyen siparişler düzenlenebilir.');

            const form = document.getElementById('yeniSiparisForm');
            form.reset();
            document.getElementById('siparisDuzenlemeId').value = siparis.id;
            document.getElementById('siparisFormBaslik').textContent = `${siparis.siparis_no} Siparişini Düzenle`;
            document.getElementById('siparisKaydetBtn').textContent = 'Değişiklikleri Kaydet';
            document.getElementById('musteriAdi').value = siparis.musteri_adi || '';
            document.getElementById('musteriTelefon').value = siparis.musteri_telefon || '';
            document.getElementById('musteriSehir').value = siparis.musteri_sehir || '';
            document.getElementById('musteriAdres').value = siparis.musteri_adres || '';
            document.getElementById('siparisNotlari').value = siparis.notlar || '';

            await this.urunleriYukle(siparis.detaylar);
            this.urunSatirSayaci = 0;
            this.sepet = siparis.detaylar.map(detay => ({
                row_id: ++this.urunSatirSayaci,
                urun_id: Number(detay.urun_id),
                kod: detay.urun_kodu,
                ad: detay.urun_adi,
                miktar: Number(detay.miktar),
                birim_fiyat: Number(detay.birim_fiyat)
            }));
            this.sepetiGoster();
            this.modalAc('yeniSiparisModal');
        } catch (error) {
            this.hataGoster(error.message);
        }
    }

    yeniUrunSatiriEkle() {
        this.sepet.push({
            row_id: ++this.urunSatirSayaci,
            urun_id: null,
            kod: '',
            ad: '',
            miktar: 1,
            birim_fiyat: 0
        });
        this.sepetiGoster();
    }

    urunSatiriUrunGuncelle(rowId, urunId) {
        const satir = this.sepet.find(item => item.row_id === rowId);
        if (!satir) return;
        if (!urunId) {
            Object.assign(satir, { urun_id: null, kod: '', ad: '', miktar: 1, birim_fiyat: 0 });
            this.sepetiGoster();
            return;
        }
        const baskaSatirda = this.sepet.some(item => item.row_id !== rowId && item.urun_id === urunId);
        if (baskaSatirda) {
            this.hataGoster('Bu ürün başka bir satırda zaten seçildi. Miktarı o satırdan değiştirebilirsiniz.');
            this.sepetiGoster();
            return;
        }
        const urun = this.urunler.find(item => Number(item.id) === urunId);
        if (!urun || this.kullanilabilirStok(urunId) <= 0) {
            this.hataGoster('Bu ürün için kullanılabilir stok bulunmuyor.');
            this.sepetiGoster();
            return;
        }
        Object.assign(satir, {
            urun_id: urunId,
            kod: urun.kod,
            ad: urun.ad,
            miktar: 1,
            birim_fiyat: Number(urun.birim_fiyat)
        });
        this.sepetiGoster();
    }

    urunSatiriMiktarGuncelle(rowId, miktarDegeri) {
        const satir = this.sepet.find(item => item.row_id === rowId);
        if (!satir?.urun_id) return;
        const miktar = Number(miktarDegeri);
        const kullanilabilir = this.kullanilabilirStok(satir.urun_id);
        if (!Number.isInteger(miktar) || miktar < 1) {
            satir.miktar = 1;
        } else if (miktar > kullanilabilir) {
            satir.miktar = kullanilabilir;
            this.hataGoster(`${satir.ad} için en fazla ${kullanilabilir} adet seçebilirsiniz.`);
        } else {
            satir.miktar = miktar;
        }
        this.sepetiGoster();
    }

    urunSatiriSil(rowId) {
        this.sepet = this.sepet.filter(item => item.row_id !== rowId);
        if (!this.sepet.length) {
            this.sepet.push({ row_id: ++this.urunSatirSayaci, urun_id: null, kod: '', ad: '', miktar: 1, birim_fiyat: 0 });
        }
        this.sepetiGoster();
    }

    urunSecenekleriniOlustur(aktifSatir) {
        const digerSecimler = new Set(
            this.sepet
                .filter(item => item.row_id !== aktifSatir.row_id && item.urun_id)
                .map(item => item.urun_id)
        );
        return '<option value="">Ürün seçin...</option>' + this.urunler.map(urun => {
            const urunId = Number(urun.id);
            const stok = this.kullanilabilirStok(urunId);
            const secili = aktifSatir.urun_id === urunId;
            const devreDisi = !secili && (stok <= 0 || digerSecimler.has(urunId));
            return `<option value="${urunId}" ${secili ? 'selected' : ''} ${devreDisi ? 'disabled' : ''}>${this.escapeHtml(urun.kod)} - ${this.escapeHtml(urun.ad)} (${stok} adet)</option>`;
        }).join('');
    }

    sepetiGoster() {
        const alan = document.getElementById('siparisUrunSatirlari');
        alan.innerHTML = this.sepet.map((item, index) => {
            const stok = item.urun_id ? this.kullanilabilirStok(item.urun_id) : 0;
            const satirToplami = item.urun_id ? item.miktar * item.birim_fiyat : 0;
            return `
                <div class="order-line" data-row-id="${item.row_id}">
                    <div class="order-line-field order-line-product-field">
                        <label>Ürün ${index + 1}</label>
                        <select class="order-line-product" data-row-id="${item.row_id}">${this.urunSecenekleriniOlustur(item)}</select>
                    </div>
                    <div class="order-line-value" data-label="Stok">${item.urun_id ? `${stok} adet` : '-'}</div>
                    <div class="order-line-field">
                        <label>Miktar</label>
                        <input class="order-line-quantity" data-row-id="${item.row_id}" type="number" min="1" max="${stok || 1}" value="${item.miktar}" ${item.urun_id ? '' : 'disabled'}>
                    </div>
                    <div class="order-line-value" data-label="Birim Fiyat">${item.urun_id ? this.formatTutar(item.birim_fiyat) : '-'}</div>
                    <div class="order-line-value order-line-total" data-label="Toplam">${item.urun_id ? this.formatTutar(satirToplami) : '-'}</div>
                    <button type="button" class="btn btn-danger btn-sm order-line-remove" data-order-line-remove="${item.row_id}" title="Satırı sil" ${this.sepet.length === 1 && !item.urun_id ? 'disabled' : ''}><i class="fas fa-trash"></i></button>
                </div>`;
        }).join('');
        const seciliSatirlar = this.sepet.filter(item => item.urun_id);
        const toplam = seciliSatirlar.reduce((tutar, item) => tutar + item.miktar * item.birim_fiyat, 0);
        document.getElementById('toplamTutar').value = toplam.toFixed(2);
        document.getElementById('sepetGenelToplam').textContent = this.formatTutar(toplam);
    }

    async siparisKaydet() {
        const form = document.getElementById('yeniSiparisForm');
        const musteriAdi = document.getElementById('musteriAdi').value.trim();
        const musteriTelefon = document.getElementById('musteriTelefon').value.trim();
        const musteriSehir = document.getElementById('musteriSehir').value.trim();
        const musteriAdres = document.getElementById('musteriAdres').value.trim();
        const duzenlemeId = Number(document.getElementById('siparisDuzenlemeId').value) || null;

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }
        const seciliSatirlar = this.sepet.filter(satir => satir.urun_id);
        if (!seciliSatirlar.length) return this.hataGoster('Siparişe en az bir ürün seçin.');
        for (const satir of seciliSatirlar) {
            if (satir.miktar > this.kullanilabilirStok(satir.urun_id)) {
                return this.hataGoster(`${satir.ad} için stok yetersiz.`);
            }
        }

        try {
            const musteriId = await db.musteriKontrolEtVeyaEkle(musteriAdi, musteriTelefon, musteriSehir, musteriAdres);
            const toplamTutar = seciliSatirlar.reduce((tutar, item) => tutar + item.miktar * item.birim_fiyat, 0);
            const payload = {
                musteri_id: musteriId,
                toplam_tutar: toplamTutar,
                notlar: document.getElementById('siparisNotlari').value.trim(),
                detaylar: seciliSatirlar.map(item => ({
                    urun_id: item.urun_id,
                    miktar: item.miktar,
                    birim_fiyat: item.birim_fiyat
                }))
            };

            if (duzenlemeId) {
                await db.updateSiparis(duzenlemeId, payload);
                this.basariGoster('Sipariş ve stok rezervasyonları güncellendi.');
            } else {
                payload.siparis_no = await this.yeniSiparisNoOlustur();
                await db.addSiparis(payload);
                this.basariGoster('Çok ürünlü sipariş oluşturuldu.');
            }
            this.modalKapat('yeniSiparisModal');
            await this.yenile();
        } catch (error) {
            console.error('Sipariş kaydetme hatası:', error);
            this.hataGoster(error.message || 'Sipariş kaydedilemedi.');
        }
    }

    async yeniSiparisNoOlustur() {
        const tarih = new Date();
        const yil = String(tarih.getFullYear()).slice(-2);
        const ay = String(tarih.getMonth() + 1).padStart(2, '0');
        const gun = String(tarih.getDate()).padStart(2, '0');
        const bugunSiparisler = await db.query("SELECT COUNT(*) as sayi FROM siparisler WHERE DATE(tarih) = DATE('now', 'localtime')");
        return `SIP${yil}${ay}${gun}${String(Number(bugunSiparisler[0]?.sayi || 0) + 1).padStart(3, '0')}`;
    }

    filtreleriUygula(sayfayiSifirla = false) {
        if (sayfayiSifirla) this.sayfa = 1;
        const arama = document.getElementById('siparisArama')?.value.trim().toLocaleLowerCase('tr') || '';
        const durum = document.getElementById('siparisDurumFiltre')?.value || '';
        const baslangic = document.getElementById('siparisBaslangicTarihi')?.value || '';
        const bitis = document.getElementById('siparisBitisTarihi')?.value || '';
        const sehir = document.getElementById('siparisSehirFiltre')?.value || '';
        const minDeger = document.getElementById('siparisMinTutar')?.value;
        const maxDeger = document.getElementById('siparisMaxTutar')?.value;
        const minTutar = minDeger === '' ? null : Number(minDeger);
        const maxTutar = maxDeger === '' ? null : Number(maxDeger);

        this.filtrelenmis_siparisler = this.siparisler.filter(siparis => {
            const metin = `${siparis.siparis_no} ${siparis.musteri_adi} ${siparis.musteri_telefon} ${siparis.urunler}`.toLocaleLowerCase('tr');
            const tarih = String(siparis.tarih || '').slice(0, 10);
            return (!arama || metin.includes(arama)) &&
                (!durum || siparis.durum === durum) &&
                (!baslangic || tarih >= baslangic) &&
                (!bitis || tarih <= bitis) &&
                (!sehir || siparis.musteri_sehir === sehir) &&
                (minTutar === null || Number(siparis.toplam_tutar) >= minTutar) &&
                (maxTutar === null || Number(siparis.toplam_tutar) <= maxTutar);
        });

        const siralama = document.getElementById('siparisSirala')?.value || 'tarih_desc';
        const siralamalar = {
            tarih_desc: (a, b) => new Date(b.tarih) - new Date(a.tarih),
            tarih_asc: (a, b) => new Date(a.tarih) - new Date(b.tarih),
            tutar_desc: (a, b) => Number(b.toplam_tutar) - Number(a.toplam_tutar),
            tutar_asc: (a, b) => Number(a.toplam_tutar) - Number(b.toplam_tutar),
            musteri_asc: (a, b) => a.musteri_adi.localeCompare(b.musteri_adi, 'tr')
        };
        this.filtrelenmis_siparisler.sort(siralamalar[siralama]);
        const toplamSayfa = Math.max(1, Math.ceil(this.filtrelenmis_siparisler.length / this.sayfaBoyutu));
        this.sayfa = Math.min(this.sayfa, toplamSayfa);
        document.getElementById('siparisFiltreOzeti').textContent =
            `${this.filtrelenmis_siparisler.length} sipariş gösteriliyor · Toplam ${this.formatTutar(this.filtrelenmis_siparisler.reduce((t, s) => t + Number(s.toplam_tutar || 0), 0))}`;
        this.tabloGuncelle();
    }

    filtreleriTemizle() {
        document.getElementById('siparisArama').value = '';
        ['siparisDurumFiltre', 'siparisBaslangicTarihi', 'siparisBitisTarihi', 'siparisSehirFiltre', 'siparisMinTutar', 'siparisMaxTutar']
            .forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('siparisSirala').value = 'tarih_desc';
        this.filtreleriUygula(true);
    }

    siparisAra() {
        this.filtreleriUygula(true);
    }

    tabloGuncelle() {
        const tbody = document.getElementById('siparisListesiBody');
        const baslangic = (this.sayfa - 1) * this.sayfaBoyutu;
        const sayfaKayitlari = this.filtrelenmis_siparisler.slice(baslangic, baslangic + this.sayfaBoyutu);
        if (!sayfaKayitlari.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center"><div class="empty-state"><i class="fas fa-inbox"></i><h3>Sipariş bulunamadı</h3><p>Filtreleri temizleyin veya yeni sipariş oluşturun.</p></div></td></tr>';
        } else {
            tbody.innerHTML = sayfaKayitlari.map(siparis => `
                <tr>
                    <td class="font-semibold">${this.escapeHtml(siparis.siparis_no)}</td>
                    <td>
                        <div class="font-medium">${this.escapeHtml(siparis.musteri_adi)}</div>
                        <div class="text-gray-500 text-sm">${this.escapeHtml(siparis.musteri_telefon || '')}</div>
                        <div class="text-gray-500 text-sm">${this.escapeHtml(siparis.musteri_sehir || '')}</div>
                    </td>
                    <td>${this.formatTarih(siparis.tarih)}</td>
                    <td><div class="text-sm">${this.escapeHtml(siparis.urunler)}</div></td>
                    <td class="text-center">${siparis.toplam_miktar || 0}${siparis.iade_miktari ? `<div class="text-gray-500 text-sm">${siparis.iade_miktari} iade</div>` : ''}</td>
                    <td class="font-semibold">${this.formatTutar(siparis.toplam_tutar)}</td>
                    <td><span class="status-badge ${this.getDurumClass(siparis.durum)}">${this.getDurumText(siparis.durum)}</span></td>
                    <td><span class="status-badge ${this.getStokDurumuClass(siparis)}">${this.getStokDurumuText(siparis)}</span></td>
                    <td><div class="actions">${this.getActionButtons(siparis)}</div></td>
                </tr>
            `).join('');
        }
        this.sayfalamaGuncelle();
    }

    sayfalamaGuncelle() {
        const alan = document.getElementById('siparisSayfalama');
        const toplam = this.filtrelenmis_siparisler.length;
        const toplamSayfa = Math.max(1, Math.ceil(toplam / this.sayfaBoyutu));
        const ilk = toplam ? (this.sayfa - 1) * this.sayfaBoyutu + 1 : 0;
        const son = Math.min(this.sayfa * this.sayfaBoyutu, toplam);
        alan.innerHTML = `
            <span>${ilk}-${son} / ${toplam} kayıt</span>
            <div class="pagination-buttons">
                <button class="btn btn-secondary btn-sm" data-page="${this.sayfa - 1}" ${this.sayfa <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
                <span class="btn btn-sm">${this.sayfa} / ${toplamSayfa}</span>
                <button class="btn btn-secondary btn-sm" data-page="${this.sayfa + 1}" ${this.sayfa >= toplamSayfa ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
            </div>`;
    }

    getDurumClass(durum) {
        return ({
            bekliyor: 'pending', onaylandi: 'approved', hazirlaniyor: 'preparing',
            sevk_edildi: 'shipped', kargoya_verildi: 'shipped', dagitim_subesinde: 'in-transit',
            dagitimda: 'out-for-delivery', teslim_edildi: 'delivered', faturalanmis: 'invoiced',
            kismi_iade: 'partial-return', iade_edildi: 'returned', iptal: 'cancelled'
        })[durum] || 'pending';
    }

    getDurumText(durum) {
        return ({
            bekliyor: 'Bekliyor', onaylandi: 'Onaylandı', hazirlaniyor: 'Hazırlanıyor',
            sevk_edildi: 'Sevk Edildi', kargoya_verildi: 'Kargoya Verildi', dagitim_subesinde: 'Dağıtım Şubesinde',
            dagitimda: 'Dağıtımda', teslim_edildi: 'Teslim Edildi', faturalanmis: 'Faturalandı',
            kismi_iade: 'Kısmi İade', iade_edildi: 'İade Edildi', iptal: 'İptal'
        })[durum] || durum || 'Bilinmeyen';
    }

    getStokDurumuClass(siparis) {
        return ({ ayrildi: 'in-stock', dusuk_stok: 'low-stock', stok_yok: 'out-of-stock', stok_iade: 'returned' })[siparis.stok_durumu] || 'in-stock';
    }

    getStokDurumuText(siparis) {
        return ({
            ayrildi: 'Stok Ayrıldı',
            dusuk_stok: 'Ayrıldı / Düşük Bakiye',
            stok_yok: 'Stok Sorunu',
            stok_iade: siparis.durum === 'iptal' ? 'Stok Geri Alındı' : 'İade Stoğa Alındı'
        })[siparis.stok_durumu] || 'Stok Ayrıldı';
    }

    getActionButtons(siparis) {
        const id = Number(siparis.id);
        let buttons = '';
        if (siparis.durum === 'bekliyor') {
            buttons += `<button class="btn btn-secondary btn-sm" onclick="siparisManager.siparisDuzenle(${id})"><i class="fas fa-pen"></i> Düzenle</button>`;
            buttons += `<button class="btn btn-success btn-sm" onclick="siparisManager.siparisOnayla(${id})"><i class="fas fa-check"></i> Onayla</button>`;
            buttons += `<button class="btn btn-danger btn-sm" onclick="siparisManager.siparisIptalEt(${id})"><i class="fas fa-times"></i> İptal</button>`;
        } else if (siparis.durum === 'onaylandi') {
            buttons += `<button class="btn btn-primary btn-sm" onclick="siparisManager.siparisSevkEt(${id})"><i class="fas fa-truck"></i> Sevk Et</button>`;
        } else if (['sevk_edildi', 'kargoya_verildi', 'dagitim_subesinde', 'dagitimda'].includes(siparis.durum)) {
            buttons += `<button class="btn btn-success btn-sm" onclick="siparisManager.siparisTeslimEt(${id})"><i class="fas fa-check-circle"></i> Teslim Et</button>`;
        }
        if (['teslim_edildi', 'faturalanmis', 'kismi_iade'].includes(siparis.durum)) {
            buttons += `<button class="btn btn-danger btn-sm" onclick="siparisManager.iadeModalAc(${id})"><i class="fas fa-rotate-left"></i> İade</button>`;
        }
        buttons += `<button class="btn btn-secondary btn-sm" onclick="siparisManager.siparisDetayGoster(${id})"><i class="fas fa-eye"></i> Detay</button>`;
        return buttons;
    }

    async siparisOnayla(siparisId) {
        if (!confirm('Bu siparişi onaylamak istediğinizden emin misiniz?')) return;
        try {
            await db.changeSiparisDurum(siparisId, 'onaylandi', 'Sipariş onaylandı', 'Sipariş sevkiyat planlamasına hazır.');
            await this.yenile();

            // Onaylanan siparişi önceki akışta olduğu gibi doğrudan sevkiyat
            // ekranına taşı ve otomatik sevkiyat planına bağla.
            if (window.app) {
                window.app.sectionGoster('sevkiyatPlan');
            }
            if (window.sevkiyatManager) {
                await window.sevkiyatManager.onaylananSiparisEkle(siparisId);
            } else {
                this.hataGoster('Sipariş onaylandı ancak sevkiyat yöneticisi hazır değil. Sevkiyat Planı ekranından manuel plan oluşturabilirsiniz.');
            }
        } catch (error) { this.hataGoster(error.message); }
    }

    async siparisIptalEt(siparisId) {
        if (!confirm('Sipariş iptal edilecek ve ayrılan stok geri alınacak. Devam edilsin mi?')) return;
        try {
            await db.cancelSiparis(siparisId);
            await this.yenile();
            this.basariGoster('Sipariş iptal edildi; stok geri alındı.');
        } catch (error) { this.hataGoster(error.message); }
    }

    async siparisSevkEt(siparisId) {
        if (!confirm('Bu sipariş sevk edildi olarak işaretlensin mi?')) return;
        try {
            await db.changeSiparisDurum(siparisId, 'sevk_edildi', 'Sipariş sevk edildi', 'Sipariş taşıyıcıya teslim edildi.');
            await this.yenile();
            this.basariGoster('Sipariş sevk edildi.');
        } catch (error) { this.hataGoster(error.message); }
    }

    async siparisTeslimEt(siparisId) {
        if (!confirm('Siparişin teslim edildiğini onaylıyor musunuz?')) return;
        try {
            await db.changeSiparisDurum(siparisId, 'teslim_edildi', 'Sipariş teslim edildi', 'Teslimat başarıyla tamamlandı.');
            await this.yenile();
            this.basariGoster('Sipariş teslim edildi.');
        } catch (error) { this.hataGoster(error.message); }
    }

    async siparisDetayGoster(siparisId) {
        try {
            const [siparis, gecmis, iadeler] = await Promise.all([
                db.getSiparisDetay(siparisId),
                db.getSiparisGecmisi(siparisId),
                db.getSiparisIadeleri(siparisId)
            ]);
            if (!siparis) throw new Error('Sipariş bulunamadı.');
            document.getElementById('siparisDetayAltBaslik').textContent = `${siparis.siparis_no} · ${this.getDurumText(siparis.durum)}`;
            document.getElementById('siparisDetayBilgileri').innerHTML = [
                ['Müşteri', siparis.musteri_adi],
                ['Telefon', siparis.musteri_telefon || '-'],
                ['Şehir', siparis.musteri_sehir || '-'],
                ['Sipariş Tarihi', this.formatTarih(siparis.tarih)],
                ['Toplam', this.formatTutar(siparis.toplam_tutar)],
                ['Teslimat Adresi', siparis.musteri_adres || '-'],
                ['Sipariş Notu', siparis.notlar || '-']
            ].map(([etiket, deger]) => `<div class="detail-info-card"><span>${etiket}</span><strong>${this.escapeHtml(deger)}</strong></div>`).join('');
            document.getElementById('siparisDetayUrunler').innerHTML = siparis.detaylar.map(detay => `
                <tr>
                    <td>${this.escapeHtml(detay.urun_kodu)}</td>
                    <td>${this.escapeHtml(detay.urun_adi)}</td>
                    <td>${detay.miktar}</td>
                    <td>${detay.iade_miktari || 0}</td>
                    <td>${this.formatTutar(detay.birim_fiyat)}</td>
                    <td>${this.formatTutar(detay.toplam)}</td>
                    <td>${detay.mevcut_stok} adet</td>
                </tr>`).join('');
            document.getElementById('siparisZamanCizelgesi').innerHTML = gecmis.length ? gecmis.map(olay => `
                <div class="order-timeline-item ${olay.olay_tipi === 'iade' ? 'is-return' : ''}">
                    <div class="timeline-title">${this.escapeHtml(olay.baslik)}</div>
                    <div class="timeline-date">${this.formatTarih(olay.tarih)}</div>
                    ${olay.aciklama ? `<div class="timeline-description">${this.escapeHtml(olay.aciklama)}</div>` : ''}
                    <div class="timeline-user"><i class="fas fa-user"></i> ${this.escapeHtml(olay.kullanici || 'Sistem')}</div>
                </div>`).join('') : '<p class="text-gray-500">Henüz geçmiş kaydı yok.</p>';
            document.getElementById('siparisIadeGecmisi').innerHTML = iadeler.length ? `
                <div class="return-history"><h4 class="detail-section-title">İade Geçmişi</h4>
                ${iadeler.map(iade => `<div class="return-history-card">
                    <div class="return-history-card-header"><strong>${this.escapeHtml(iade.iade_no)}</strong><span>${this.formatTutar(iade.toplam_tutar)}</span></div>
                    <p>${this.escapeHtml(iade.urunler || '')}</p><p><strong>${this.escapeHtml(iade.neden)}</strong> · ${this.formatTarih(iade.tarih)}</p>
                </div>`).join('')}</div>` : '';
            this.modalAc('siparisDetayModal');
        } catch (error) { this.hataGoster(error.message); }
    }

    async iadeModalAc(siparisId) {
        try {
            const siparis = await db.getSiparisDetay(siparisId);
            if (!siparis) throw new Error('Sipariş bulunamadı.');
            const iadeEdilebilir = siparis.detaylar.filter(detay => Number(detay.miktar) > Number(detay.iade_miktari || 0));
            if (!iadeEdilebilir.length) throw new Error('Bu siparişte iade edilebilir ürün kalmadı.');
            this.aktifIadeSiparisi = siparis;
            document.getElementById('siparisIadeForm').reset();
            document.getElementById('iadeSiparisId').value = siparis.id;
            document.getElementById('iadeSiparisBilgisi').textContent = `${siparis.siparis_no} · ${siparis.musteri_adi}`;
            document.getElementById('iadeUrunListesi').innerHTML = iadeEdilebilir.map(detay => {
                const kalan = Number(detay.miktar) - Number(detay.iade_miktari || 0);
                return `<div class="return-product-row">
                    <div class="return-product-info"><strong>${this.escapeHtml(detay.urun_adi)}</strong><small>${this.escapeHtml(detay.urun_kodu)} · Satın alınan: ${detay.miktar} · Önceki iade: ${detay.iade_miktari || 0} · Birim: ${this.formatTutar(detay.birim_fiyat)}</small></div>
                    <div class="form-group mb-0"><label>İade miktarı</label><input class="return-quantity" type="number" min="0" max="${kalan}" value="0" data-detay-id="${detay.id}" data-fiyat="${detay.birim_fiyat}"></div>
                </div>`;
            }).join('');
            this.iadeToplaminiGuncelle();
            this.modalAc('siparisIadeModal');
        } catch (error) { this.hataGoster(error.message); }
    }

    iadeToplaminiGuncelle() {
        let toplam = 0;
        document.querySelectorAll('#iadeUrunListesi .return-quantity').forEach(input => {
            const miktar = Math.min(Number(input.value || 0), Number(input.max));
            if (Number(input.value) > Number(input.max)) input.value = input.max;
            toplam += Math.max(0, miktar) * Number(input.dataset.fiyat);
        });
        document.getElementById('iadeToplamTutar').textContent = this.formatTutar(toplam);
    }

    async iadeKaydet() {
        const neden = document.getElementById('iadeNedeni').value;
        if (!neden) return this.hataGoster('İade nedenini seçin.');
        const detaylar = [...document.querySelectorAll('#iadeUrunListesi .return-quantity')]
            .map(input => ({ siparis_detay_id: Number(input.dataset.detayId), miktar: Number(input.value) }))
            .filter(item => item.miktar > 0);
        if (!detaylar.length) return this.hataGoster('İade edilecek en az bir ürün için miktar girin.');
        if (!confirm('Seçilen ürünler stoğa geri alınacak. İade tamamlansın mı?')) return;
        try {
            await db.createIade({
                siparis_id: this.aktifIadeSiparisi.id,
                neden,
                aciklama: document.getElementById('iadeAciklama').value.trim(),
                detaylar
            });
            this.modalKapat('siparisIadeModal');
            await this.yenile();
            this.basariGoster('İade kaydedildi ve ürünler stoğa geri alındı.');
        } catch (error) {
            console.error('İade hatası:', error);
            this.hataGoster(error.message || 'İade kaydedilemedi.');
        }
    }

    formatTarih(tarih) {
        if (!tarih) return '-';
        const hamTarih = String(tarih);
        const value = hamTarih.length === 10
            ? `${hamTarih}T00:00:00`
            : (hamTarih.includes('T') ? hamTarih : hamTarih.replace(' ', 'T'));
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(tarih) : date.toLocaleString('tr-TR', {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });
    }

    formatTutar(tutar) {
        return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(tutar) || 0);
    }

    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, karakter => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[karakter]);
    }

    modalAc(modalId) {
        document.getElementById(modalId)?.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    modalKapat(modalId) {
        document.getElementById(modalId)?.classList.remove('active');
        document.body.style.overflow = '';
    }

    basariGoster(mesaj) { this.toastGoster(mesaj, 'success'); }
    hataGoster(mesaj) { this.toastGoster(mesaj, 'error'); }

    toastGoster(mesaj, tip) {
        if (window.app?.toastGoster) {
            window.app.toastGoster(mesaj, tip);
            return;
        }
        const toast = document.createElement('div');
        toast.className = `toast toast-${tip}`;
        toast.textContent = mesaj;
        toast.style.cssText = `position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:6px;color:white;z-index:9999;font-weight:500;background:${tip === 'success' ? '#059669' : '#dc2626'};box-shadow:0 4px 12px rgba(0,0,0,.15)`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }
}

const siparisManager = new SiparisManager();
