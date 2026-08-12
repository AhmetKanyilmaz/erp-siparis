// Fatura Yönetimi
class FaturaManager {
    constructor() {
        this.faturalar = [];
        this.filtrelenmis_faturalar = [];
        console.log('FaturaManager constructor çağrıldı');
        this.init();
    }

    async init() {
        console.log('FaturaManager init başlatıldı');
        
        // DOM elementlerinin yüklenmesini bekle
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await this.faturalariYukle();
        this.eventListenerEkle();
        this.tabloGuncelle();
        console.log('FaturaManager init tamamlandı');
    }

    eventListenerEkle() {
        console.log('Fatura event listener\'ları ekleniyor...');
        
        // Fatura oluştur butonu
        const faturaOlusturBtn = document.getElementById('faturaOlusturBtn');
        if (faturaOlusturBtn) {
            faturaOlusturBtn.addEventListener('click', () => {
                console.log('Fatura oluştur butonuna tıklandı');
                this.faturaOlusturModalAc();
            });
            console.log('Fatura oluştur butonu event listener eklendi');
        } else {
            console.error('faturaOlusturBtn bulunamadı!');
        }

        // Fatura formu submit
        document.getElementById('faturaForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.faturaOlustur();
        });

        // Fatura arama
        document.getElementById('faturaArama').addEventListener('input', (e) => {
            this.faturaAra(e.target.value);
        });

        // Ödeme şekli değişikliği
        document.getElementById('odemeSekli').addEventListener('change', (e) => {
            this.odemeSecimiGuncelle(e.target.value);
        });

        // KDV oranı değişikliği
        document.getElementById('kdvOrani').addEventListener('change', () => {
            this.tutarlariHesapla();
        });

        // Vade gün değişikliği
        document.getElementById('vadeGun').addEventListener('change', () => {
            this.vadeTarihiHesapla();
        });
    }

    async faturalariYukle() {
        try {
            this.faturalar = await db.getFaturalar();
            this.filtrelenmis_faturalar = [...this.faturalar];
            console.log('Faturalar yüklendi:', this.faturalar);
        } catch (error) {
            console.error('Faturalar yüklenirken hata:', error);
        }
    }

    async faturaOlusturModalAc() {
        // Faturası olmayan siparişleri getir
        const faturaOlmayanSiparisler = await this.getFaturaOlmayanSiparisler();
        
        if (faturaOlmayanSiparisler.length === 0) {
            this.hataGoster('Faturası kesilecek sipariş bulunamadı!');
            return;
        }

        // Sipariş seçim listesini doldur
        this.siparisListesiDoldur(faturaOlmayanSiparisler);
        
        // Modal'ı aç
        this.modalAc('faturaModal');
    }

    async getFaturaOlmayanSiparisler() {
        return await db.query(`
            SELECT s.*, m.ad as musteri_adi, m.telefon, m.sehir, m.adres
            FROM siparisler s
            LEFT JOIN musteriler m ON s.musteri_id = m.id
            WHERE s.durum IN ('onaylandi', 'sevk_edildi', 'teslim_edildi')
            AND s.id NOT IN (SELECT siparis_id FROM faturalar)
            ORDER BY s.tarih DESC
        `);
    }

    siparisListesiDoldur(siparisler) {
        const select = document.getElementById('siparisSecim');
        select.innerHTML = '<option value="">Sipariş Seçin</option>';
        
        siparisler.forEach(siparis => {
            const option = document.createElement('option');
            option.value = siparis.id;
            option.textContent = `${siparis.siparis_no} - ${siparis.musteri_adi} - ${this.formatTutar(siparis.toplam_tutar)}`;
            option.dataset.siparisData = JSON.stringify(siparis);
            select.appendChild(option);
        });

        // Sipariş seçimi event listener
        select.addEventListener('change', (e) => {
            if (e.target.value) {
                const siparisData = JSON.parse(e.target.selectedOptions[0].dataset.siparisData);
                this.siparisSecimiYapildi(siparisData);
            }
        });
    }

    async siparisSecimiYapildi(siparis) {
        console.log('Seçilen sipariş:', siparis);
        
        // Sipariş detaylarını getir
        const detaylar = await db.query(`
            SELECT sd.*, u.ad as urun_adi, u.kod
            FROM siparis_detaylari sd
            LEFT JOIN urunler u ON sd.urun_id = u.id
            WHERE sd.siparis_id = ?
        `, [siparis.id]);

        // Form alanlarını doldur
        document.getElementById('musteriAdiFatura').value = siparis.musteri_adi;
        document.getElementById('musteriTelefonFatura').value = siparis.telefon || '';
        document.getElementById('musteriAdresFatura').value = siparis.adres || '';
        
        // Fatura detaylarını göster
        this.faturaDetaylariGoster(detaylar, siparis.toplam_tutar);
        
        // Tutarları hesapla
        this.tutarlariHesapla();
        
        // Vade tarihini hesapla
        this.vadeTarihiHesapla();
    }

    faturaDetaylariGoster(detaylar, toplamTutar) {
        const tbody = document.getElementById('faturaDetaylariBody');
        tbody.innerHTML = '';
        
        detaylar.forEach(detay => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${detay.kod}</td>
                <td>${detay.urun_adi}</td>
                <td class="text-center">${detay.miktar}</td>
                <td class="text-right">${this.formatTutar(detay.birim_fiyat)}</td>
                <td class="text-right">${this.formatTutar(detay.toplam)}</td>
            `;
            tbody.appendChild(row);
        });
        
        // Toplam satırı ekle
        const toplamRow = document.createElement('tr');
        toplamRow.classList.add('font-bold', 'bg-gray-50');
        toplamRow.innerHTML = `
            <td colspan="4" class="text-right"><strong>Ara Toplam:</strong></td>
            <td class="text-right"><strong>${this.formatTutar(toplamTutar)}</strong></td>
        `;
        tbody.appendChild(toplamRow);
    }

    tutarlariHesapla() {
        const siparisSelect = document.getElementById('siparisSecim');
        if (!siparisSelect.value) return;
        
        const siparisData = JSON.parse(siparisSelect.selectedOptions[0].dataset.siparisData);
        const araToplam = siparisData.toplam_tutar;
        const kdvOrani = parseFloat(document.getElementById('kdvOrani').value);
        
        const kdvTutari = (araToplam * kdvOrani) / 100;
        const toplamTutar = araToplam + kdvTutari;
        
        document.getElementById('araToplam').value = araToplam.toFixed(2);
        document.getElementById('kdvTutari').value = kdvTutari.toFixed(2);
        document.getElementById('toplamTutarFatura').value = toplamTutar.toFixed(2);
    }

    vadeTarihiHesapla() {
        const vadeGun = parseInt(document.getElementById('vadeGun').value);
        const bugun = new Date();
        const vadeTarihi = new Date(bugun.getTime() + (vadeGun * 24 * 60 * 60 * 1000));
        
        document.getElementById('vadeTarihi').value = vadeTarihi.toISOString().split('T')[0];
    }

    odemeSecimiGuncelle(odemeSekli) {
        // Ödeme şekline göre özel işlemler yapılabilir
        console.log('Ödeme şekli seçildi:', odemeSekli);
    }

    async faturaOlustur() {
        try {
            const siparisSelect = document.getElementById('siparisSecim');
            if (!siparisSelect.value) {
                this.hataGoster('Lütfen bir sipariş seçin');
                return;
            }

            const siparisData = JSON.parse(siparisSelect.selectedOptions[0].dataset.siparisData);
            const formData = new FormData(document.getElementById('faturaForm'));
            
            // Fatura numarası oluştur
            const faturaNo = await this.yeniFaturaNoOlustur();
            
            // Sipariş detaylarını al
            const siparisDetaylari = await db.query(`
                SELECT sd.*, u.ad as urun_adi
                FROM siparis_detaylari sd
                LEFT JOIN urunler u ON sd.urun_id = u.id
                WHERE sd.siparis_id = ?
            `, [siparisData.id]);

            const kdvOrani = parseFloat(formData.get('kdvOrani'));
            const araToplam = parseFloat(formData.get('araToplam'));
            const kdvTutari = parseFloat(formData.get('kdvTutari'));
            const toplamTutar = parseFloat(formData.get('toplamTutarFatura'));

            // Fatura detaylarını hazırla
            const faturaDetaylari = siparisDetaylari.map(detay => {
                const detayAraToplam = detay.toplam;
                const detayKdvTutari = (detayAraToplam * kdvOrani) / 100;
                const detayToplam = detayAraToplam + detayKdvTutari;
                
                return {
                    urun_id: detay.urun_id,
                    miktar: detay.miktar,
                    birim_fiyat: detay.birim_fiyat,
                    kdv_orani: kdvOrani,
                    ara_toplam: detayAraToplam,
                    kdv_tutari: detayKdvTutari,
                    toplam: detayToplam
                };
            });

            const faturaData = {
                fatura_no: faturaNo,
                siparis_id: siparisData.id,
                musteri_id: siparisData.musteri_id,
                vade_tarihi: formData.get('vadeTarihi'),
                ara_toplam: araToplam,
                kdv_orani: kdvOrani,
                kdv_tutari: kdvTutari,
                toplam_tutar: toplamTutar,
                odeme_sekli: formData.get('odemeSekli'),
                notlar: formData.get('faturaNotlari'),
                detaylar: faturaDetaylari
            };

            console.log('Fatura oluşturuluyor:', faturaData);

            const faturaId = await db.createFatura(faturaData);
            
            this.basariGoster('Fatura başarıyla oluşturuldu!');
            this.modalKapat('faturaModal');
            
            // Listeyi yenile
            await this.faturalariYukle();
            this.tabloGuncelle();
            
            // İstatistikleri güncelle
            if (window.app) {
                await window.app.istatistikleriGuncelle();
            }

        } catch (error) {
            console.error('Fatura oluşturma hatası:', error);
            this.hataGoster('Fatura oluşturulurken bir hata oluştu');
        }
    }

    async yeniFaturaNoOlustur() {
        const tarih = new Date();
        const yil = tarih.getFullYear().toString().slice(-2);
        const ay = (tarih.getMonth() + 1).toString().padStart(2, '0');
        
        // Bugünkü fatura sayısını al
        const bugunFaturalar = await db.query(`
            SELECT COUNT(*) as sayi 
            FROM faturalar 
            WHERE DATE(tarih) = DATE('now')
        `);
        
        const faturaNo = (bugunFaturalar[0].sayi + 1).toString().padStart(4, '0');
        
        return `FTR${yil}${ay}${faturaNo}`;
    }

    faturaAra(aramaMetni) {
        if (!aramaMetni.trim()) {
            this.filtrelenmis_faturalar = [...this.faturalar];
        } else {
            const aranan = aramaMetni.toLowerCase();
            this.filtrelenmis_faturalar = this.faturalar.filter(fatura => 
                fatura.fatura_no.toLowerCase().includes(aranan) ||
                fatura.musteri_adi.toLowerCase().includes(aranan) ||
                fatura.durum.toLowerCase().includes(aranan)
            );
        }
        this.tabloGuncelle();
    }

    tabloGuncelle() {
        console.log('Fatura tablosu güncelleniyor, fatura sayısı:', this.filtrelenmis_faturalar.length);
        const tbody = document.getElementById('faturaListesiBody');
        tbody.innerHTML = '';

        if (this.filtrelenmis_faturalar.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center">
                        <div class="empty-state">
                            <i class="fas fa-file-invoice"></i>
                            <h3>Henüz fatura bulunmuyor</h3>
                            <p>İlk faturanızı oluşturmak için "Fatura Oluştur" butonuna tıklayın</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        this.filtrelenmis_faturalar.forEach((fatura, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="font-semibold">${fatura.fatura_no}</td>
                <td>
                    <div class="font-medium">${fatura.musteri_adi}</div>
                    <div class="text-gray-500 text-sm">${fatura.musteri_telefon || ''}</div>
                </td>
                <td>${this.formatTarih(fatura.tarih)}</td>
                <td>${this.formatTarih(fatura.vade_tarihi)}</td>
                <td>
                    <span class="status-badge ${this.getFaturaStatusClass(fatura.durum)}">
                        ${this.getFaturaStatusText(fatura.durum)}
                    </span>
                </td>
                <td class="text-right">${this.formatTutar(fatura.toplam_tutar)}</td>
                <td class="text-center">${fatura.odeme_sekli || '-'}</td>
                <td class="text-center">
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-info" onclick="faturaManager.faturaGoruntule(${fatura.id})" title="Görüntüle">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-primary" onclick="faturaManager.faturaYazdir(${fatura.id})" title="Yazdır">
                            <i class="fas fa-print"></i>
                        </button>
                        ${fatura.durum === 'bekliyor' ? `
                            <button class="btn btn-sm btn-success" onclick="faturaManager.faturaOdendiIsaretle(${fatura.id})" title="Ödendi">
                                <i class="fas fa-check"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    getFaturaStatusClass(durum) {
        const statusMap = {
            'bekliyor': 'warning',
            'odendi': 'success',
            'gecikti': 'danger',
            'iptal': 'secondary'
        };
        return statusMap[durum] || 'secondary';
    }

    getFaturaStatusText(durum) {
        const statusMap = {
            'bekliyor': 'Bekliyor',
            'odendi': 'Ödendi',
            'gecikti': 'Gecikti',
            'iptal': 'İptal'
        };
        return statusMap[durum] || durum;
    }

    async faturaGoruntule(faturaId) {
        try {
            const fatura = await db.getFaturaWithDetails(faturaId);
            this.faturaDetayModalGoster(fatura);
        } catch (error) {
            console.error('Fatura görüntüleme hatası:', error);
            this.hataGoster('Fatura görüntülenirken hata oluştu');
        }
    }

    faturaDetayModalGoster(fatura) {
        // Fatura detay modal'ını güncelle ve göster
        document.getElementById('detayFaturaNo').textContent = fatura.fatura_no;
        document.getElementById('detayMusteriAdi').textContent = fatura.musteri_adi;
        document.getElementById('detayFaturaTarihi').textContent = this.formatTarih(fatura.tarih);
        document.getElementById('detayVadeTarihi').textContent = this.formatTarih(fatura.vade_tarihi);
        document.getElementById('detayDurum').textContent = this.getFaturaStatusText(fatura.durum);
        document.getElementById('detayToplamTutar').textContent = this.formatTutar(fatura.toplam_tutar);

        // Detayları listele
        const tbody = document.getElementById('faturaDetayTabloBody');
        tbody.innerHTML = '';
        
        fatura.detaylar.forEach(detay => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${detay.urun_kodu}</td>
                <td>${detay.urun_adi}</td>
                <td class="text-center">${detay.miktar}</td>
                <td class="text-right">${this.formatTutar(detay.birim_fiyat)}</td>
                <td class="text-center">%${detay.kdv_orani}</td>
                <td class="text-right">${this.formatTutar(detay.toplam)}</td>
            `;
            tbody.appendChild(row);
        });

        this.modalAc('faturaDetayModal');
    }

    async faturaYazdir(faturaId) {
        try {
            const fatura = await db.getFaturaWithDetails(faturaId);
            this.faturaYazdirmaEkraniAc(fatura);
        } catch (error) {
            console.error('Fatura yazdırma hatası:', error);
            this.hataGoster('Fatura yazdırılırken hata oluştu');
        }
    }

    faturaYazdirmaEkraniAc(fatura) {
        const yazdirmaIcerigi = this.faturaYazdirmaHTMLOlustur(fatura);
        const yeniPencere = window.open('', '_blank');
        yeniPencere.document.write(yazdirmaIcerigi);
        yeniPencere.document.close();
        yeniPencere.print();
    }

    faturaYazdirmaHTMLOlustur(fatura) {
        let detaylarHTML = '';
        fatura.detaylar.forEach(detay => {
            detaylarHTML += `
                <tr>
                    <td>${detay.urun_kodu}</td>
                    <td>${detay.urun_adi}</td>
                    <td style="text-align: center;">${detay.miktar}</td>
                    <td style="text-align: right;">${this.formatTutar(detay.birim_fiyat)}</td>
                    <td style="text-align: center;">%${detay.kdv_orani}</td>
                    <td style="text-align: right;">${this.formatTutar(detay.toplam)}</td>
                </tr>
            `;
        });

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Fatura - ${fatura.fatura_no}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .header { text-align: center; margin-bottom: 30px; }
                    .company { font-size: 24px; font-weight: bold; }
                    .invoice-info { display: flex; justify-content: space-between; margin-bottom: 30px; }
                    .customer-info, .invoice-details { width: 45%; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                    .total-row { font-weight: bold; background-color: #f8f9fa; }
                    .text-right { text-align: right; }
                    .text-center { text-align: center; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="company">ERP SİPARİŞ YÖNETİMİ</div>
                    <div>FATURA</div>
                </div>
                
                <div class="invoice-info">
                    <div class="customer-info">
                        <h3>Müşteri Bilgileri</h3>
                        <p><strong>Ad:</strong> ${fatura.musteri_adi}</p>
                        <p><strong>Telefon:</strong> ${fatura.musteri_telefon || '-'}</p>
                        <p><strong>Şehir:</strong> ${fatura.musteri_sehir || '-'}</p>
                        <p><strong>Adres:</strong> ${fatura.musteri_adres || '-'}</p>
                    </div>
                    <div class="invoice-details">
                        <h3>Fatura Bilgileri</h3>
                        <p><strong>Fatura No:</strong> ${fatura.fatura_no}</p>
                        <p><strong>Tarih:</strong> ${this.formatTarih(fatura.tarih)}</p>
                        <p><strong>Vade Tarihi:</strong> ${this.formatTarih(fatura.vade_tarihi)}</p>
                        <p><strong>Sipariş No:</strong> ${fatura.siparis_no}</p>
                    </div>
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th>Ürün Kodu</th>
                            <th>Ürün Adı</th>
                            <th>Miktar</th>
                            <th>Birim Fiyat</th>
                            <th>KDV</th>
                            <th>Toplam</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${detaylarHTML}
                        <tr class="total-row">
                            <td colspan="4" class="text-right">Ara Toplam:</td>
                            <td colspan="2" class="text-right">${this.formatTutar(fatura.ara_toplam)}</td>
                        </tr>
                        <tr class="total-row">
                            <td colspan="4" class="text-right">KDV (%${fatura.kdv_orani}):</td>
                            <td colspan="2" class="text-right">${this.formatTutar(fatura.kdv_tutari)}</td>
                        </tr>
                        <tr class="total-row">
                            <td colspan="4" class="text-right"><strong>GENEL TOPLAM:</strong></td>
                            <td colspan="2" class="text-right"><strong>${this.formatTutar(fatura.toplam_tutar)}</strong></td>
                        </tr>
                    </tbody>
                </table>
                
                <p><strong>Ödeme Şekli:</strong> ${fatura.odeme_sekli || '-'}</p>
                ${fatura.notlar ? `<p><strong>Notlar:</strong> ${fatura.notlar}</p>` : ''}
            </body>
            </html>
        `;
    }

    async faturaOdendiIsaretle(faturaId) {
        try {
            await db.execute('UPDATE faturalar SET durum = ? WHERE id = ?', ['odendi', faturaId]);
            await this.faturalariYukle();
            this.tabloGuncelle();
            this.basariGoster('Fatura ödendi olarak işaretlendi');
        } catch (error) {
            console.error('Fatura güncelleme hatası:', error);
            this.hataGoster('Fatura güncellenirken hata oluştu');
        }
    }

    // Utility fonksiyonlar
    formatTutar(tutar) {
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: 'TRY'
        }).format(tutar || 0);
    }

    formatTarih(tarih) {
        return new Date(tarih).toLocaleDateString('tr-TR');
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
        
        // Form'u temizle
        if (modalId === 'faturaModal') {
            document.getElementById('faturaForm').reset();
            document.getElementById('faturaDetaylariBody').innerHTML = '';
        }
    }

    basariGoster(mesaj) {
        if (window.app) {
            window.app.toastGoster(mesaj, 'success');
        }
    }

    hataGoster(mesaj) {
        if (window.app) {
            window.app.toastGoster(mesaj, 'error');
        }
    }
}

// Not: FaturaManager app.js'te başlatılıyor
