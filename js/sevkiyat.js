// Sevkiyat Yönetimi
class SevkiyatManager {
    constructor() {
        this.sevkiyatPlanlari = [];
        this.init();
    }

    async init() {
        await this.sevkiyatPlanlariYukle();
        this.eventListenerEkle();
        this.sevkiyatCardsGuncelle();
    }

    eventListenerEkle() {
        // Sevkiyat planla butonu
        document.getElementById('sevkiyatPlanlaBtn').addEventListener('click', () => {
            this.yeniSevkiyatPlanModalAc();
        });

        // Sevkiyat takip butonu
        document.getElementById('sevkiyatTakipBtn').addEventListener('click', () => {
            this.sevkiyatTakipModalAc();
        });
    }

    async sevkiyatPlanlariYukle() {
        try {
            const planlar = await db.query(`
                SELECT 
                    sp.*,
                    COUNT(sd.id) as toplam_siparis,
                    GROUP_CONCAT(s.siparis_no) as siparis_nolari,
                    GROUP_CONCAT(DISTINCT m.sehir) as hedef_sehirler,
                    GROUP_CONCAT(
                        CASE WHEN s.id IS NOT NULL THEN
                            s.siparis_no || '::' || COALESCE(NULLIF(TRIM(m.adres), ''), 'Adres belirtilmemiş')
                        END,
                        '|||'
                    ) as teslimat_adresleri,
                    COALESCE(SUM((
                        SELECT COALESCE(SUM(sipdet.miktar), 0)
                        FROM siparis_detaylari sipdet
                        WHERE sipdet.siparis_id = s.id
                    )), 0) as toplam_urun_adedi
                FROM sevkiyat_planlari sp
                LEFT JOIN sevkiyat_detaylari sd ON sp.id = sd.sevkiyat_plan_id
                LEFT JOIN siparisler s ON sd.siparis_id = s.id
                LEFT JOIN musteriler m ON s.musteri_id = m.id
                GROUP BY sp.id
                ORDER BY sp.tarih DESC
            `);

            this.sevkiyatPlanlari = planlar.map(plan => ({
                ...plan,
                aciklama: this.maliyetAciklamasiniGuncelle(plan)
            }));
        } catch (error) {
            console.error('Sevkiyat planları yüklenirken hata:', error);
            this.hataGoster('Sevkiyat planları yüklenirken bir hata oluştu');
        }
    }

    sevkiyatCardsGuncelle() {
        const container = document.getElementById('sevkiyatCards');
        container.innerHTML = '';

        if (this.sevkiyatPlanlari.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <i class="fas fa-truck"></i>
                    <h3>Henüz sevkiyat planı bulunmuyor</h3>
                    <p>İlk sevkiyat planınızı oluşturmak için "Yeni Plan" butonuna tıklayın</p>
                </div>
            `;
            return;
        }

        this.sevkiyatPlanlari.forEach(plan => {
            const card = document.createElement('div');
            card.className = 'sevkiyat-card';
            card.innerHTML = `
                <div class="sevkiyat-card-header">
                    <div>
                        <div class="sevkiyat-card-title">${plan.plan_adi}</div>
                        <div class="sevkiyat-card-date">${this.formatTarih(plan.tarih)}</div>
                        ${plan.hedef_sehirler ? `<div class="sevkiyat-card-cities">🎯 ${plan.hedef_sehirler}</div>` : ''}
                    </div>
                    <span class="status-badge ${this.getSevkiyatDurumClass(plan.durum)}">
                        ${this.getSevkiyatDurumText(plan.durum)}
                    </span>
                </div>
                
                <div class="sevkiyat-items">
                    <div class="sevkiyat-item">
                        <div class="sevkiyat-item-info">
                            <div class="sevkiyat-item-name">Toplam Sipariş</div>
                            <div class="sevkiyat-item-details">${plan.toplam_siparis || 0} adet</div>
                        </div>
                    </div>
                    
                    ${plan.hedef_sehirler ? `
                        <div class="sevkiyat-item">
                            <div class="sevkiyat-item-info">
                                <div class="sevkiyat-item-name">🏙️ Teslimat Şehri</div>
                                <div class="sevkiyat-item-details">${plan.hedef_sehirler}</div>
                            </div>
                        </div>
                    ` : ''}

                    ${plan.teslimat_adresleri ? `
                        <div class="sevkiyat-item sevkiyat-address-item">
                            <div class="sevkiyat-item-info">
                                <div class="sevkiyat-item-name">📍 Tam Teslimat Adresi</div>
                                <div class="sevkiyat-address-list">${this.teslimatAdresleriniGoster(plan.teslimat_adresleri)}</div>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${plan.siparis_nolari ? `
                        <div class="sevkiyat-item">
                            <div class="sevkiyat-item-info">
                                <div class="sevkiyat-item-name">📦 Sipariş Numaraları</div>
                                <div class="sevkiyat-item-details">${plan.siparis_nolari}</div>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${plan.aciklama ? `
                        <div class="sevkiyat-item">
                            <div class="sevkiyat-item-info">
                                <div class="sevkiyat-item-name">Açıklama</div>
                                <div class="sevkiyat-item-details" style="white-space: pre-line;">${plan.aciklama}</div>
                            </div>
                        </div>
                    ` : ''}
                </div>
                
                <div class="sevkiyat-actions">
                    ${this.getSevkiyatActionButtons(plan)}
                </div>
            `;
            container.appendChild(card);
        });
    }

    getSevkiyatDurumClass(durum) {
        const durumClasses = {
            'bekliyor': 'pending',
            'planlandi': 'pending',
            'onaylandi': 'pending',
            'hazirlaniyor': 'warning',
            'sevk_edildi': 'shipped',
            'kargoya_verildi': 'shipped',
            'dagitim_subesinde': 'shipped',
            'dagitimda': 'shipped',
            'yola_cikti': 'shipped',
            'teslim_edildi': 'delivered',
            'iptal': 'cancelled'
        };
        return durumClasses[durum] || 'pending';
    }

    getSevkiyatDurumText(durum) {
        const durumTexts = {
            'bekliyor': 'Planlandı',
            'planlandi': 'Planlandı',
            'onaylandi': 'Planlandı',
            'hazirlaniyor': 'Hazırlanıyor',
            'sevk_edildi': 'Yola Çıktı',
            'kargoya_verildi': 'Yola Çıktı',
            'dagitim_subesinde': 'Yola Çıktı',
            'dagitimda': 'Yola Çıktı',
            'yola_cikti': 'Yola Çıktı',
            'teslim_edildi': 'Teslim Edildi',
            'iptal': 'İptal'
        };
        return durumTexts[durum] || 'Bilinmeyen';
    }

    getSevkiyatActionButtons(plan) {
        let buttons = '';
        
        if (plan.durum === 'planlandi') {
            buttons += `
                <button class="btn btn-primary btn-sm" onclick="sevkiyatManager.sevkiyatBaslat('${plan.id}')">
                    <i class="fas fa-play"></i> Başlat
                </button>
                <button class="btn btn-warning btn-sm" onclick="sevkiyatManager.sevkiyatPlanDuzenleModalAc('${plan.id}')">
                    <i class="fas fa-edit"></i> Düzenle
                </button>
                <button class="btn btn-secondary btn-sm" onclick="sevkiyatManager.sevkiyatDetayGoster('${plan.id}')"><i class="fas fa-eye"></i> Detay</button>
                <button class="btn btn-danger btn-sm" onclick="sevkiyatManager.sevkiyatIptalEt('${plan.id}')">
                    <i class="fas fa-times"></i> İptal
                </button>
            `;
        } else if (plan.durum === 'hazirlaniyor') {
            buttons += `
                <button class="btn btn-success btn-sm" onclick="sevkiyatManager.sevkiyatYolaCikar('${plan.id}')">
                    <i class="fas fa-truck"></i> Yola Çıkar
                </button>
                <button class="btn btn-warning btn-sm" onclick="sevkiyatManager.sevkiyatPlanDuzenleModalAc('${plan.id}')"><i class="fas fa-edit"></i> Düzenle</button>
                <button class="btn btn-secondary btn-sm" onclick="sevkiyatManager.sevkiyatDetayGoster('${plan.id}')">
                    <i class="fas fa-eye"></i> Detay
                </button>
            `;
        } else if (plan.durum === 'yola_cikti') {
            buttons += `
                <button class="btn btn-success btn-sm" onclick="sevkiyatManager.sevkiyatTeslimEt('${plan.id}')">
                    <i class="fas fa-check"></i> Teslim Et
                </button>
                <button class="btn btn-warning btn-sm" onclick="sevkiyatManager.sevkiyatPlanDuzenleModalAc('${plan.id}')"><i class="fas fa-edit"></i> Düzenle</button>
                <button class="btn btn-info btn-sm" onclick="sevkiyatManager.sevkiyatTakipGoster('${plan.id}')">
                    <i class="fas fa-map-marker-alt"></i> Takip
                </button>
            `;
        } else {
            buttons += `
                ${plan.durum !== 'iptal' ? `<button class="btn btn-warning btn-sm" onclick="sevkiyatManager.sevkiyatPlanDuzenleModalAc('${plan.id}')"><i class="fas fa-edit"></i> Düzenle</button>` : ''}
                <button class="btn btn-secondary btn-sm" onclick="sevkiyatManager.sevkiyatDetayGoster('${plan.id}')">
                    <i class="fas fa-eye"></i> Detay
                </button>
            `;
        }
        
        return buttons;
    }

    async yeniSevkiyatPlanModalAc(planId = null) {
        try {
            const duzenlenenPlan = planId
                ? await db.query('SELECT * FROM sevkiyat_planlari WHERE id = ?', [planId])
                : [];
            const plan = duzenlenenPlan[0] || null;
            if (planId && !plan) throw new Error('Sevkiyat planı bulunamadı.');
            const siparisSecimiKilitli = plan && ['yola_cikti', 'teslim_edildi'].includes(plan.durum);

            // Onaylı ve başka aktif plana bağlı olmayan siparişleri; düzenlemede
            // ayrıca bu plana zaten ekli olan siparişleri getir.
            const siparisler = await db.query(`
                SELECT s.*, m.ad as musteri_adi, m.sehir as musteri_sehir, m.adres as musteri_adres,
                       CASE WHEN EXISTS (
                           SELECT 1 FROM sevkiyat_detaylari mevcut
                           WHERE mevcut.siparis_id = s.id AND mevcut.sevkiyat_plan_id = ?
                       ) THEN 1 ELSE 0 END as secili
                FROM siparisler s
                LEFT JOIN musteriler m ON s.musteri_id = m.id
                WHERE EXISTS (
                    SELECT 1 FROM sevkiyat_detaylari mevcut
                    WHERE mevcut.siparis_id = s.id AND mevcut.sevkiyat_plan_id = ?
                ) OR (
                    s.durum = 'onaylandi'
                    AND NOT EXISTS (
                        SELECT 1
                        FROM sevkiyat_detaylari sd
                        JOIN sevkiyat_planlari sp ON sp.id = sd.sevkiyat_plan_id
                        WHERE sd.siparis_id = s.id AND sp.durum <> 'iptal' AND sp.id <> ?
                    )
                )
                ORDER BY s.tarih
            `, [planId || 0, planId || 0, planId || 0]);

            let siparislerHtml = '';
            if (siparisler.length === 0) {
                siparislerHtml = '<p class="text-center text-gray-500">Plana eklenebilecek onaylı sipariş bulunmuyor.</p>';
            } else {
                siparislerHtml = `
                    <div class="form-group">
                        <label>Sevk Edilecek Siparişler</label>
                        <div class="siparis-liste" style="max-height: 200px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px;">
                            ${siparisler.map(siparis => `
                                <label class="siparis-item" style="display: flex; align-items: center; margin-bottom: 8px; cursor: pointer;">
                                    ${siparisSecimiKilitli && siparis.secili ? `<input type="hidden" name="secili_siparisler" value="${siparis.id}">` : ''}
                                    <input type="checkbox" ${siparisSecimiKilitli ? 'disabled' : 'name="secili_siparisler"'} value="${siparis.id}" ${siparis.secili ? 'checked' : ''} style="margin-right: 8px;">
                                    <div style="flex: 1;">
                                        <div style="font-weight: 500;">${siparis.siparis_no} - ${siparis.musteri_adi}</div>
                                        <div style="font-size: 0.875rem; color: #6b7280;">
                                            <i class="fas fa-map-marker-alt text-primary"></i> ${siparis.musteri_sehir || 'Belirtilmemiş'} | 
                                            ${this.formatTutar(siparis.toplam_tutar)} | ${this.formatTarih(siparis.tarih)}
                                        </div>
                                        <div style="font-size: 0.8125rem; color: #4b5563; margin-top: 3px; line-height: 1.4;">
                                            <i class="fas fa-location-dot"></i> ${this.escapeHtml(siparis.musteri_adres || 'Adres belirtilmemiş')}
                                        </div>
                                    </div>
                                </label>
                            `).join('')}
                        </div>
                        ${siparisSecimiKilitli ? '<small class="text-gray-500">Yola çıkmış veya teslim edilmiş planda sipariş listesi değiştirilemez; plan bilgileri ve durum düzenlenebilir.</small>' : ''}
                    </div>
                `;
            }

            const modalHtml = `
                <div class="modal active" id="yeniSevkiyatModal">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>${plan ? 'Sevkiyat Planını Düzenle' : 'Yeni Sevkiyat Planı'}</h3>
                            <button class="modal-close" data-modal="yeniSevkiyatModal">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div class="modal-body">
                            <form id="yeniSevkiyatForm">
                                <div class="form-group">
                                    <label for="sevkiyatPlanAdi">Plan Adı</label>
                                    <input type="text" id="sevkiyatPlanAdi" required placeholder="Örn: İstanbul Sevkiyatı" value="${this.escapeHtml(plan?.plan_adi || '')}">
                                </div>
                                
                                <div class="form-group">
                                    <label for="sevkiyatTarihi">Sevkiyat Tarihi</label>
                                    <input type="date" id="sevkiyatTarihi" required value="${plan?.tarih ? String(plan.tarih).slice(0, 10) : new Date().toISOString().split('T')[0]}">
                                </div>

                                <div class="form-group">
                                    <label for="sevkiyatPlanDurumu">Plan Durumu</label>
                                    <select id="sevkiyatPlanDurumu" required>
                                        <option value="planlandi" ${!plan || ['planlandi', 'bekliyor'].includes(plan.durum) ? 'selected' : ''}>Planlandı</option>
                                        <option value="hazirlaniyor" ${plan?.durum === 'hazirlaniyor' ? 'selected' : ''}>Hazırlanıyor</option>
                                        <option value="yola_cikti" ${plan?.durum === 'yola_cikti' ? 'selected' : ''}>Yola Çıktı</option>
                                        <option value="teslim_edildi" ${plan?.durum === 'teslim_edildi' ? 'selected' : ''}>Teslim Edildi</option>
                                    </select>
                                </div>
                                
                                ${siparislerHtml}
                                
                                <div class="form-group">
                                    <label for="sevkiyatAciklama">Açıklama</label>
                                    <textarea id="sevkiyatAciklama" rows="3" placeholder="İsteğe bağlı açıklama...">${this.escapeHtml(plan?.aciklama || '')}</textarea>
                                </div>
                                
                                <div class="form-actions">
                                    <button type="button" class="btn btn-secondary" data-modal="yeniSevkiyatModal">İptal</button>
                                    <button type="submit" class="btn btn-primary">${plan ? 'Değişiklikleri Kaydet' : 'Plan Oluştur'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            // Event listener'ları ekle
            document.getElementById('yeniSevkiyatForm').addEventListener('submit', (e) => {
                e.preventDefault();
                this.sevkiyatPlaniKaydet(planId);
            });

            document.querySelectorAll('[data-modal="yeniSevkiyatModal"]').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.modalKapat('yeniSevkiyatModal');
                    document.getElementById('yeniSevkiyatModal').remove();
                });
            });

        } catch (error) {
            console.error('Sevkiyat plan modal açma hatası:', error);
            this.hataGoster('Modal açılırken bir hata oluştu');
        }
    }

    async sevkiyatPlanDuzenleModalAc(planId) {
        return await this.yeniSevkiyatPlanModalAc(Number(planId));
    }

    async sevkiyatPlaniKaydet(planId = null) {
        try {
            const planAdi = document.getElementById('sevkiyatPlanAdi').value.trim();
            const tarih = document.getElementById('sevkiyatTarihi').value;
            const aciklama = document.getElementById('sevkiyatAciklama').value.trim();
            const durum = document.getElementById('sevkiyatPlanDurumu').value;
            
            const seciliSiparisler = Array.from(document.querySelectorAll('input[name="secili_siparisler"]'))
                .filter(input => input.type === 'hidden' || input.checked)
                .map(cb => cb.value);

            if (!planAdi || !tarih) {
                this.hataGoster('Plan adı ve tarih alanları zorunludur');
                return;
            }

            if (seciliSiparisler.length === 0) {
                this.hataGoster('En az bir sipariş seçmelisiniz');
                return;
            }

            await db.saveSevkiyatPlan({
                id: planId,
                plan_adi: planAdi,
                tarih,
                durum,
                aciklama,
                siparis_ids: seciliSiparisler
            });

            this.basariGoster(planId ? 'Sevkiyat planı güncellendi' : 'Sevkiyat planı başarıyla oluşturuldu');
            this.modalKapat('yeniSevkiyatModal');
            document.getElementById('yeniSevkiyatModal').remove();
            
            await this.sevkiyatPlanlariYukle();
            this.sevkiyatCardsGuncelle();
            if (window.siparisManager) await window.siparisManager.siparisleriYukle();
            if (window.app) await window.app.istatistikleriGuncelle();

        } catch (error) {
            console.error('Sevkiyat planı oluşturma hatası:', error);
            this.hataGoster(error.message || 'Sevkiyat planı kaydedilirken bir hata oluştu');
        }
    }

    async sevkiyatBaslat(planId) {
        if (confirm('Bu sevkiyat planını başlatmak istediğinizden emin misiniz?')) {
            try {
                const planSiparisleri = await db.query(
                    'SELECT siparis_id FROM sevkiyat_detaylari WHERE sevkiyat_plan_id = ?',
                    [planId]
                );
                for (const kayit of planSiparisleri) {
                    await db.changeSiparisDurum(
                        kayit.siparis_id,
                        'hazirlaniyor',
                        'Sevkiyat hazırlığı başladı',
                        'Sipariş sevkiyat planı kapsamında hazırlanmaya başladı.'
                    );
                }

                this.basariGoster('Sevkiyat planı başlatıldı');
                await this.sevkiyatPlanlariYukle();
                this.sevkiyatCardsGuncelle();
                if (window.siparisManager) await window.siparisManager.siparisleriYukle();
            } catch (error) {
                console.error('Sevkiyat başlatma hatası:', error);
                this.hataGoster('Sevkiyat başlatılırken bir hata oluştu');
            }
        }
    }

    async sevkiyatYolaCikar(planId) {
        if (confirm('Bu sevkiyatın yola çıktığını onaylıyor musunuz?')) {
            try {
                await db.execute(`
                    UPDATE sevkiyat_planlari 
                    SET durum = 'yola_cikti' 
                    WHERE id = ?
                `, [planId]);

                // İlgili siparişleri zaman çizelgesi kaydıyla birlikte güncelle
                const sevkSiparisleri = await db.query(
                    'SELECT siparis_id FROM sevkiyat_detaylari WHERE sevkiyat_plan_id = ?',
                    [planId]
                );
                for (const kayit of sevkSiparisleri) {
                    await db.changeSiparisDurum(
                        kayit.siparis_id,
                        'sevk_edildi',
                        'Sevkiyat yola çıktı',
                        'Sipariş sevkiyat planı kapsamında yola çıktı.'
                    );
                }

                this.basariGoster('Sevkiyat yola çıktı olarak işaretlendi');
                await this.sevkiyatPlanlariYukle();
                this.sevkiyatCardsGuncelle();

                // Sipariş listesini de güncelle
                if (window.siparisManager) {
                    await window.siparisManager.siparisleriYukle();
                    window.siparisManager.tabloGuncelle();
                }
            } catch (error) {
                console.error('Sevkiyat yola çıkarma hatası:', error);
                this.hataGoster('Sevkiyat yola çıkarılırken bir hata oluştu');
            }
        }
    }

    async sevkiyatTeslimEt(planId) {
        if (confirm('Bu sevkiyatın teslim edildiğini onaylıyor musunuz?')) {
            try {
                await db.execute(`
                    UPDATE sevkiyat_planlari 
                    SET durum = 'teslim_edildi' 
                    WHERE id = ?
                `, [planId]);

                // İlgili siparişleri zaman çizelgesi kaydıyla birlikte güncelle
                const teslimSiparisleri = await db.query(
                    'SELECT siparis_id FROM sevkiyat_detaylari WHERE sevkiyat_plan_id = ?',
                    [planId]
                );
                for (const kayit of teslimSiparisleri) {
                    await db.changeSiparisDurum(
                        kayit.siparis_id,
                        'teslim_edildi',
                        'Sevkiyat teslim edildi',
                        'Sipariş sevkiyat planı kapsamında teslim edildi.'
                    );
                }

                this.basariGoster('Sevkiyat teslim edildi olarak işaretlendi');
                await this.sevkiyatPlanlariYukle();
                this.sevkiyatCardsGuncelle();

                // Sipariş listesini de güncelle
                if (window.siparisManager) {
                    await window.siparisManager.siparisleriYukle();
                    window.siparisManager.tabloGuncelle();
                }
            } catch (error) {
                console.error('Sevkiyat teslim etme hatası:', error);
                this.hataGoster('Sevkiyat teslim edilirken bir hata oluştu');
            }
        }
    }

    async sevkiyatIptalEt(planId) {
        if (confirm('Bu sevkiyat planını iptal etmek istediğinizden emin misiniz? Bu işlem geri alınamaz.')) {
            try {
                await db.execute(`
                    UPDATE sevkiyat_planlari 
                    SET durum = 'iptal' 
                    WHERE id = ?
                `, [planId]);

                this.basariGoster('Sevkiyat planı iptal edildi');
                await this.sevkiyatPlanlariYukle();
                this.sevkiyatCardsGuncelle();
            } catch (error) {
                console.error('Sevkiyat iptal hatası:', error);
                this.hataGoster('Sevkiyat planı iptal edilirken bir hata oluştu');
            }
        }
    }

    async sevkiyatDetayGoster(planId) {
        try {
            const plan = this.sevkiyatPlanlari.find(p => p.id == planId);
            const detaylar = await db.query(`
                SELECT 
                    sd.*,
                    s.siparis_no,
                    s.toplam_tutar,
                    m.ad as musteri_adi,
                    m.sehir as musteri_sehir,
                    m.adres as musteri_adres,
                    m.telefon as musteri_telefon,
                    CASE
                        WHEN s.durum IN ('teslim_edildi', 'faturalanmis', 'kismi_iade', 'iade_edildi') THEN 'teslim_edildi'
                        WHEN s.durum IN ('sevk_edildi', 'kargoya_verildi', 'dagitim_subesinde', 'dagitimda') THEN 'yola_cikti'
                        WHEN s.durum = 'hazirlaniyor' THEN 'hazirlaniyor'
                        WHEN sd.durum = 'bekliyor' THEN 'planlandi'
                        ELSE sd.durum
                    END as sevkiyat_durumu,
                    COALESCE(SUM(sipdet.miktar), 0) as toplam_miktar
                FROM sevkiyat_detaylari sd
                LEFT JOIN siparisler s ON sd.siparis_id = s.id
                LEFT JOIN musteriler m ON s.musteri_id = m.id
                LEFT JOIN siparis_detaylari sipdet ON s.id = sipdet.siparis_id
                WHERE sd.sevkiyat_plan_id = ?
                GROUP BY sd.id, s.siparis_no, s.toplam_tutar, m.ad, m.sehir, m.adres, m.telefon
            `, [planId]);

            let detaylarHtml = '';
            if (detaylar.length === 0) {
                detaylarHtml = '<p class="text-center text-gray-500">Bu plana ait sipariş bulunamadı</p>';
            } else {
                detaylarHtml = `
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Sipariş No</th>
                                    <th>Müşteri</th>
                                    <th>Teslimat Bilgileri</th>
                                    <th>Miktar</th>
                                    <th>Tutar</th>
                                    <th>Durum</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${detaylar.map(detay => `
                                    <tr>
                                        <td class="font-semibold">${detay.siparis_no}</td>
                                        <td>
                                            <div class="font-medium">${detay.musteri_adi}</div>
                                            <div class="text-gray-500 text-sm">${detay.musteri_telefon || ''}</div>
                                        </td>
                                        <td>
                                            <div class="font-medium text-primary">🏙️ ${detay.musteri_sehir || 'Şehir belirtilmemiş'}</div>
                                            <div class="text-gray-500 text-sm">📍 ${detay.musteri_adres || 'Adres belirtilmemiş'}</div>
                                        </td>
                                        <td class="text-center">${detay.toplam_miktar}</td>
                                        <td class="font-semibold">${this.formatTutar(detay.toplam_tutar)}</td>
                                        <td>
                                            <span class="status-badge ${this.getSevkiyatDurumClass(detay.sevkiyat_durumu)}">
                                                ${this.getSevkiyatDurumText(detay.sevkiyat_durumu)}
                                            </span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }

            const modalHtml = `
                <div class="modal active" id="sevkiyatDetayModal">
                    <div class="modal-content" style="max-width: 800px;">
                        <div class="modal-header">
                            <h3>${plan.plan_adi} - Detaylar</h3>
                            <button class="modal-close" data-modal="sevkiyatDetayModal">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-4 p-4 bg-gray-50 rounded">
                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <strong>Plan Adı:</strong> ${plan.plan_adi}<br>
                                        <strong>Tarih:</strong> ${this.formatTarih(plan.tarih)}<br>
                                    </div>
                                    <div>
                                        <strong>Durum:</strong> 
                                        <span class="status-badge ${this.getSevkiyatDurumClass(plan.durum)}">
                                            ${this.getSevkiyatDurumText(plan.durum)}
                                        </span><br>
                                        <strong>Sipariş Sayısı:</strong> ${plan.toplam_siparis || 0}
                                    </div>
                                </div>
                                ${plan.aciklama ? `<div class="mt-2"><strong>Açıklama:</strong> ${plan.aciklama}</div>` : ''}
                            </div>
                            
                            ${detaylarHtml}
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            document.querySelector('[data-modal="sevkiyatDetayModal"]').addEventListener('click', () => {
                this.modalKapat('sevkiyatDetayModal');
                document.getElementById('sevkiyatDetayModal').remove();
            });

        } catch (error) {
            console.error('Sevkiyat detay gösterme hatası:', error);
            this.hataGoster('Sevkiyat detayları gösterilirken bir hata oluştu');
        }
    }

    // Yardımcı fonksiyonlar
    formatTarih(tarih) {
        return new Date(tarih).toLocaleDateString('tr-TR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }

    formatTutar(tutar) {
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: 'TRY'
        }).format(tutar);
    }

    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, karakter => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[karakter]);
    }

    teslimatAdresleriniGoster(adresVerisi) {
        return String(adresVerisi || '')
            .split('|||')
            .filter(Boolean)
            .map(kayit => {
                const ayirac = kayit.indexOf('::');
                const siparisNo = ayirac >= 0 ? kayit.slice(0, ayirac) : '';
                const adres = ayirac >= 0 ? kayit.slice(ayirac + 2) : kayit;
                return `<div class="sevkiyat-address-row">
                    ${siparisNo ? `<strong>${this.escapeHtml(siparisNo)}</strong>` : ''}
                    <span>${this.escapeHtml(adres)}</span>
                </div>`;
            })
            .join('');
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

    // Onaylanan siparişi sevkiyat planına ekleme
    async onaylananSiparisEkle(siparisId) {
        console.log('onaylananSiparisEkle çağrıldı:', siparisId);
        try {
            // Aynı sipariş için yeniden çağrılırsa ikinci bir otomatik plan üretme.
            const mevcutPlan = await db.query(`
                SELECT sp.id, sp.plan_adi
                FROM sevkiyat_detaylari sd
                JOIN sevkiyat_planlari sp ON sp.id = sd.sevkiyat_plan_id
                WHERE sd.siparis_id = ? AND sp.durum <> 'iptal'
                ORDER BY sp.id DESC
                LIMIT 1
            `, [siparisId]);

            if (mevcutPlan.length > 0) {
                await this.sevkiyatPlanlariYukle();
                this.sevkiyatCardsGuncelle();
                this.basariGoster(`Sipariş mevcut sevkiyat planında: ${mevcutPlan[0].plan_adi}`);
                return mevcutPlan[0].id;
            }

            // Sipariş bilgilerini al
            const siparis = await db.query(`
                SELECT s.*, m.ad as musteri_adi, m.telefon as musteri_telefon
                FROM siparisler s
                LEFT JOIN musteriler m ON s.musteri_id = m.id
                WHERE s.id = ? AND s.durum = 'onaylandi'
            `, [siparisId]);

            console.log('Sipariş sorgu sonucu:', siparis);

            if (siparis.length === 0) {
                console.error('Onaylanan sipariş bulunamadı');
                throw new Error('Onaylanan sipariş bulunamadı');
            }

            const siparisData = siparis[0];
            console.log('Sipariş verileri:', siparisData);

            // Bildirim göster
            this.basariGoster(`${siparisData.siparis_no} numaralı sipariş sevkiyat planlaması için hazır!`);

            // Otomatik sevkiyat planı oluştur
            return await this.otomatikSevkiyatPlaniOlustur(siparisData);

        } catch (error) {
            console.error('Onaylanan sipariş ekleme hatası:', error);
            this.hataGoster(error.message || 'Sipariş sevkiyat planına eklenirken hata oluştu');
            throw error;
        }
    }

    async otomatikSevkiyatPlaniOlustur(siparis) {
        console.log('otomatikSevkiyatPlaniOlustur çağrıldı:', siparis);
        try {
            // Müşteri şehir bilgisini al
            const musteriData = await db.query(`
                SELECT sehir, adres FROM musteriler WHERE id = ?
            `, [siparis.musteri_id]);

            const musteriSehir = musteriData[0]?.sehir || 'Bilinmeyen';
            console.log('Müşteri şehri:', musteriSehir);

            const [siparisOzeti] = await db.query(`
                SELECT COALESCE(SUM(miktar), 1) AS toplam_urun_adedi
                FROM siparis_detaylari
                WHERE siparis_id = ?
            `, [siparis.id]);
            const toplamUrunAdedi = Math.max(1, parseInt(siparisOzeti?.toplam_urun_adedi, 10) || 1);

            // Şehir mesafesi ve siparişteki ürün adedine göre sevkiyat hesaplaması
            const sevkiyatBilgisi = this.hesaplaSevkiyatSuresi(musteriSehir, toplamUrunAdedi);
            
            // Sevkiyat tarihini hesapla
            const bugun = new Date();
            const sevkiyatTarihi = new Date(bugun);
            sevkiyatTarihi.setDate(bugun.getDate() + sevkiyatBilgisi.hazirlikGunu);

            const teslimatTarihi = new Date(sevkiyatTarihi);
            teslimatTarihi.setDate(sevkiyatTarihi.getDate() + sevkiyatBilgisi.teslimatGunu);

            const planAdi = `${siparis.siparis_no} - ${musteriSehir} Sevkiyatı`;
            const sevkiyatTarihiStr = sevkiyatTarihi.toISOString().slice(0, 10);

            const aciklama = `${siparis.siparis_no} numaralı sipariş için otomatik oluşturulan sevkiyat planı
                
📍 Teslimat Şehri: ${musteriSehir}
🚚 Sevkiyat Mesafesi: ${sevkiyatBilgisi.mesafe}
⏱️ Tahmini Teslimat: ${teslimatTarihi.toLocaleDateString('tr-TR')}
📦 Kargo Tipi: ${sevkiyatBilgisi.kargoTipi}
📦 Toplam Ürün Adedi: ${toplamUrunAdedi}
💰 Tahmini Maliyet: ${sevkiyatBilgisi.maliyet}
ℹ️ Maliyet Notu: ${sevkiyatBilgisi.maliyetAciklamasi}`;

            console.log('Plan oluşturuluyor:', { planAdi, sevkiyatTarihiStr, sevkiyatBilgisi });

            // Sevkiyat planı oluştur
            await db.execute(`
                INSERT INTO sevkiyat_planlari (plan_adi, tarih, durum, aciklama)
                VALUES (?, ?, 'planlandi', ?)
            `, [planAdi, sevkiyatTarihiStr, aciklama]);

            const [yeniPlan] = await db.query(`
                SELECT id FROM sevkiyat_planlari ORDER BY id DESC LIMIT 1
            `);
            const planId = yeniPlan?.id;
            if (!planId) {
                throw new Error('Oluşturulan sevkiyat planı doğrulanamadı');
            }
            console.log('Plan oluşturuldu, ID:', planId);

            // Siparişi sevkiyat planına ekle
            await db.execute(`
                INSERT INTO sevkiyat_detaylari (sevkiyat_plan_id, siparis_id, durum)
                VALUES (?, ?, 'planlandi')
            `, [planId, siparis.id]);

            await db.execute(`
                INSERT INTO siparis_gecmisi
                    (siparis_id, olay_tipi, baslik, aciklama, kullanici)
                VALUES (?, 'sevkiyat', 'Sevkiyat planı oluşturuldu', ?, 'Sistem')
            `, [siparis.id, `${planAdi} planına otomatik olarak eklendi.`]);

            console.log('Sipariş sevkiyat planına eklendi');

            // Sevkiyat planlarını yeniden yükle
            await this.sevkiyatPlanlariYukle();
            this.sevkiyatCardsGuncelle();

            console.log('Sevkiyat planları güncellendi');

            this.basariGoster(`"${planAdi}" sevkiyat planı otomatik olarak oluşturuldu! Tahmini teslimat: ${teslimatTarihi.toLocaleDateString('tr-TR')}`);
            return planId;

        } catch (error) {
            console.error('Otomatik sevkiyat planı oluşturma hatası:', error);
            throw new Error('Otomatik sevkiyat planı oluşturulamadı: ' + error.message);
        }
    }

    // Şehir bazlı sevkiyat süresi hesaplama
    hesaplaSevkiyatSuresi(sehir, toplamUrunAdedi = 1) {
        // Önceki kayıtlarda ilçe veya eski il adları bulunuyorsa güncel il adına eşleştir.
        const sehirTakmaAdlari = {
            'Adapazarı': 'Sakarya',
            'Afyon': 'Afyonkarahisar',
            'Gebze': 'Kocaeli',
            'İzmit': 'Kocaeli',
            'Tarsus': 'Mersin',
            'Usak': 'Uşak'
        };
        const standartSehir = sehirTakmaAdlari[sehir] || sehir;
        
        // Şehir kategorilerine göre sevkiyat bilgileri
        const sevkiyatHaritas = {
            // Merkez ve yakın şehirler (0-1 gün teslimat)
            'İstanbul': { mesafe: 'Merkez', hazirlikGunu: 0, teslimatGunu: 1, kargoTipi: 'Motorlu Kurye', maliyet: '₺15-25' },
            'Kocaeli': { mesafe: '100 km', hazirlikGunu: 1, teslimatGunu: 1, kargoTipi: 'Karayolu', maliyet: '₺20-30' },
            'İzmit': { mesafe: '100 km', hazirlikGunu: 1, teslimatGunu: 1, kargoTipi: 'Karayolu', maliyet: '₺20-30' },
            'Yalova': { mesafe: '90 km', hazirlikGunu: 1, teslimatGunu: 1, kargoTipi: 'Karayolu', maliyet: '₺20-30' },
            'Tekirdağ': { mesafe: '140 km', hazirlikGunu: 1, teslimatGunu: 1, kargoTipi: 'Karayolu', maliyet: '₺25-35' },
            'Edirne': { mesafe: '230 km', hazirlikGunu: 1, teslimatGunu: 1, kargoTipi: 'Karayolu', maliyet: '₺30-40' },
            'Kırklareli': { mesafe: '180 km', hazirlikGunu: 1, teslimatGunu: 1, kargoTipi: 'Karayolu', maliyet: '₺25-35' },
            'Çanakkale': { mesafe: '320 km', hazirlikGunu: 1, teslimatGunu: 1, kargoTipi: 'Karayolu', maliyet: '₺35-45' },

            // Marmara Bölgesi (1-2 gün teslimat)
            'Bursa': { mesafe: '150 km', hazirlikGunu: 1, teslimatGunu: 1, kargoTipi: 'Karayolu', maliyet: '₺25-35' },
            'Balıkesir': { mesafe: '290 km', hazirlikGunu: 1, teslimatGunu: 2, kargoTipi: 'Karayolu', maliyet: '₺30-40' },
            'Bilecik': { mesafe: '200 km', hazirlikGunu: 1, teslimatGunu: 1, kargoTipi: 'Karayolu', maliyet: '₺25-35' },
            'Sakarya': { mesafe: '150 km', hazirlikGunu: 1, teslimatGunu: 1, kargoTipi: 'Karayolu', maliyet: '₺25-35' },
            'Düzce': { mesafe: '200 km', hazirlikGunu: 1, teslimatGunu: 2, kargoTipi: 'Karayolu', maliyet: '₺30-40' },
            'Bolu': { mesafe: '250 km', hazirlikGunu: 1, teslimatGunu: 2, kargoTipi: 'Karayolu', maliyet: '₺30-40' },

            // Ege Bölgesi (2-3 gün teslimat)
            'İzmir': { mesafe: '450 km', hazirlikGunu: 1, teslimatGunu: 2, kargoTipi: 'Karayolu', maliyet: '₺40-50' },
            'Manisa': { mesafe: '480 km', hazirlikGunu: 1, teslimatGunu: 2, kargoTipi: 'Karayolu', maliyet: '₺40-50' },
            'Aydın': { mesafe: '520 km', hazirlikGunu: 1, teslimatGunu: 2, kargoTipi: 'Karayolu', maliyet: '₺40-50' },
            'Muğla': { mesafe: '680 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺50-60' },
            'Denizli': { mesafe: '580 km', hazirlikGunu: 1, teslimatGunu: 2, kargoTipi: 'Karayolu', maliyet: '₺45-55' },
            'Uşak': { mesafe: '550 km', hazirlikGunu: 1, teslimatGunu: 2, kargoTipi: 'Karayolu', maliyet: '₺45-55' },
            'Afyonkarahisar': { mesafe: '460 km', hazirlikGunu: 1, teslimatGunu: 2, kargoTipi: 'Karayolu', maliyet: '₺40-50' },
            'Kütahya': { mesafe: '380 km', hazirlikGunu: 1, teslimatGunu: 2, kargoTipi: 'Karayolu', maliyet: '₺35-45' },

            // İç Anadolu (2-3 gün teslimat)
            'Ankara': { mesafe: '450 km', hazirlikGunu: 1, teslimatGunu: 2, kargoTipi: 'Karayolu', maliyet: '₺40-50' },
            'Konya': { mesafe: '650 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺50-60' },
            'Eskişehir': { mesafe: '300 km', hazirlikGunu: 1, teslimatGunu: 2, kargoTipi: 'Karayolu', maliyet: '₺35-45' },
            'Kayseri': { mesafe: '750 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺55-65' },
            'Sivas': { mesafe: '680 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺50-60' },
            'Çankırı': { mesafe: '320 km', hazirlikGunu: 1, teslimatGunu: 2, kargoTipi: 'Karayolu', maliyet: '₺35-45' },
            'Kırıkkale': { mesafe: '280 km', hazirlikGunu: 1, teslimatGunu: 2, kargoTipi: 'Karayolu', maliyet: '₺35-45' },
            'Aksaray': { mesafe: '650 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺50-60' },
            'Nevşehir': { mesafe: '720 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺55-65' },
            'Kırşehir': { mesafe: '550 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺45-55' },
            'Yozgat': { mesafe: '580 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺50-60' },
            'Niğde': { mesafe: '720 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺55-65' },
            'Karaman': { mesafe: '620 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺50-60' },

            // Akdeniz Bölgesi (2-4 gün teslimat)
            'Antalya': { mesafe: '720 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺55-65' },
            'Mersin': { mesafe: '920 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺60-70' },
            'Adana': { mesafe: '950 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺60-70' },
            'Isparta': { mesafe: '550 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺45-55' },
            'Burdur': { mesafe: '520 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺45-55' },
            'Kahramanmaraş': { mesafe: '850 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺55-65' },
            'Osmaniye': { mesafe: '920 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺60-70' },
            'Hatay': { mesafe: '1050 km', hazirlikGunu: 2, teslimatGunu: 4, kargoTipi: 'Karayolu', maliyet: '₺70-80' },

            // Karadeniz Bölgesi (2-4 gün teslimat)
            'Zonguldak': { mesafe: '320 km', hazirlikGunu: 1, teslimatGunu: 2, kargoTipi: 'Karayolu', maliyet: '₺35-45' },
            'Bartın': { mesafe: '380 km', hazirlikGunu: 1, teslimatGunu: 2, kargoTipi: 'Karayolu', maliyet: '₺35-45' },
            'Karabük': { mesafe: '420 km', hazirlikGunu: 1, teslimatGunu: 2, kargoTipi: 'Karayolu', maliyet: '₺40-50' },
            'Kastamonu': { mesafe: '350 km', hazirlikGunu: 1, teslimatGunu: 2, kargoTipi: 'Karayolu', maliyet: '₺35-45' },
            'Sinop': { mesafe: '450 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺40-50' },
            'Samsun': { mesafe: '550 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺45-55' },
            'Amasya': { mesafe: '480 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺40-50' },
            'Tokat': { mesafe: '520 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺45-55' },
            'Çorum': { mesafe: '380 km', hazirlikGunu: 1, teslimatGunu: 2, kargoTipi: 'Karayolu', maliyet: '₺35-45' },
            'Ordu': { mesafe: '650 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺50-60' },
            'Giresun': { mesafe: '680 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺50-60' },
            'Trabzon': { mesafe: '780 km', hazirlikGunu: 1, teslimatGunu: 4, kargoTipi: 'Karayolu', maliyet: '₺55-65' },
            'Rize': { mesafe: '850 km', hazirlikGunu: 1, teslimatGunu: 4, kargoTipi: 'Karayolu', maliyet: '₺60-70' },
            'Artvin': { mesafe: '950 km', hazirlikGunu: 2, teslimatGunu: 4, kargoTipi: 'Karayolu', maliyet: '₺65-75' },
            'Gümüşhane': { mesafe: '750 km', hazirlikGunu: 1, teslimatGunu: 4, kargoTipi: 'Karayolu', maliyet: '₺55-65' },
            'Bayburt': { mesafe: '720 km', hazirlikGunu: 1, teslimatGunu: 4, kargoTipi: 'Karayolu', maliyet: '₺55-65' },

            // Doğu Anadolu (3-5 gün teslimat)
            'Erzurum': { mesafe: '950 km', hazirlikGunu: 2, teslimatGunu: 4, kargoTipi: 'Karayolu', maliyet: '₺65-75' },
            'Erzincan': { mesafe: '680 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺50-60' },
            'Malatya': { mesafe: '720 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺55-65' },
            'Elazığ': { mesafe: '850 km', hazirlikGunu: 1, teslimatGunu: 4, kargoTipi: 'Karayolu', maliyet: '₺60-70' },
            'Tunceli': { mesafe: '780 km', hazirlikGunu: 1, teslimatGunu: 4, kargoTipi: 'Karayolu', maliyet: '₺55-65' },
            'Bingöl': { mesafe: '920 km', hazirlikGunu: 2, teslimatGunu: 4, kargoTipi: 'Karayolu', maliyet: '₺65-75' },
            'Muş': { mesafe: '1050 km', hazirlikGunu: 2, teslimatGunu: 5, kargoTipi: 'Karayolu', maliyet: '₺70-80' },
            'Bitlis': { mesafe: '1150 km', hazirlikGunu: 2, teslimatGunu: 5, kargoTipi: 'Karayolu', maliyet: '₺75-85' },
            'Van': { mesafe: '1280 km', hazirlikGunu: 2, teslimatGunu: 5, kargoTipi: 'Karayolu', maliyet: '₺80-90' },
            'Ağrı': { mesafe: '1180 km', hazirlikGunu: 2, teslimatGunu: 5, kargoTipi: 'Karayolu', maliyet: '₺75-85' },
            'Iğdır': { mesafe: '1250 km', hazirlikGunu: 2, teslimatGunu: 5, kargoTipi: 'Karayolu', maliyet: '₺80-90' },
            'Kars': { mesafe: '1120 km', hazirlikGunu: 2, teslimatGunu: 5, kargoTipi: 'Karayolu', maliyet: '₺75-85' },
            'Ardahan': { mesafe: '1050 km', hazirlikGunu: 2, teslimatGunu: 5, kargoTipi: 'Karayolu', maliyet: '₺70-80' },

            // Güneydoğu Anadolu (3-5 gün teslimat)
            'Gaziantep': { mesafe: '850 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺55-65' },
            'Şanlıurfa': { mesafe: '950 km', hazirlikGunu: 2, teslimatGunu: 4, kargoTipi: 'Karayolu', maliyet: '₺65-75' },
            'Diyarbakır': { mesafe: '1050 km', hazirlikGunu: 2, teslimatGunu: 4, kargoTipi: 'Karayolu', maliyet: '₺70-80' },
            'Adıyaman': { mesafe: '780 km', hazirlikGunu: 1, teslimatGunu: 3, kargoTipi: 'Karayolu', maliyet: '₺55-65' },
            'Mardin': { mesafe: '1180 km', hazirlikGunu: 2, teslimatGunu: 5, kargoTipi: 'Karayolu', maliyet: '₺75-85' },
            'Batman': { mesafe: '1120 km', hazirlikGunu: 2, teslimatGunu: 4, kargoTipi: 'Karayolu', maliyet: '₺75-85' },
            'Şırnak': { mesafe: '1250 km', hazirlikGunu: 2, teslimatGunu: 5, kargoTipi: 'Karayolu', maliyet: '₺80-90' },
            'Siirt': { mesafe: '1180 km', hazirlikGunu: 2, teslimatGunu: 5, kargoTipi: 'Karayolu', maliyet: '₺75-85' },
            'Hakkari': { mesafe: '1350 km', hazirlikGunu: 2, teslimatGunu: 5, kargoTipi: 'Karayolu', maliyet: '₺85-95' },
            'Kilis': { mesafe: '920 km', hazirlikGunu: 1, teslimatGunu: 4, kargoTipi: 'Karayolu', maliyet: '₺60-70' }
        };

        const sevkiyatBilgisi = sevkiyatHaritas[standartSehir] || {
            mesafe: 'Bilinmeyen',
            hazirlikGunu: 2,
            teslimatGunu: 4,
            kargoTipi: 'Karayolu'
        };

        const bulunanMesafe = parseInt(sevkiyatBilgisi.mesafe, 10);
        const mesafeKm = Number.isNaN(bulunanMesafe)
            ? (standartSehir === 'İstanbul' ? 0 : 800)
            : bulunanMesafe;

        return {
            ...sevkiyatBilgisi,
            maliyet: this.hesaplaTahminiSevkiyatMaliyeti(
                mesafeKm,
                toplamUrunAdedi,
                standartSehir === 'İstanbul'
            ),
            maliyetAciklamasi: 'İstanbul çıkışlı standart paketleme ve karayolu gönderimi varsayımıdır.'
        };
    }

    hesaplaTahminiSevkiyatMaliyeti(mesafeKm, toplamUrunAdedi = 1, merkezTeslimat = false) {
        const urunAdedi = Math.max(1, parseInt(toplamUrunAdedi, 10) || 1);
        const tabanMaliyet = merkezTeslimat ? 190 : 230 + (Math.max(0, mesafeKm) * 0.28);
        const ekUrunMaliyeti = (urunAdedi - 1) * 65;
        const altSinir = Math.ceil((tabanMaliyet + ekUrunMaliyeti) / 10) * 10;
        const ustSinir = Math.ceil((altSinir * 1.25) / 10) * 10;
        const paraFormatla = tutar => new Intl.NumberFormat('tr-TR').format(tutar);

        return `${paraFormatla(altSinir)} - ${paraFormatla(ustSinir)} TL`;
    }

    maliyetAciklamasiniGuncelle(plan) {
        const aciklama = plan.aciklama || '';
        if (!/Tahmini Maliyet:/i.test(aciklama)) {
            return aciklama;
        }

        const hedefSehir = (plan.hedef_sehirler || '').split(',')[0].trim();
        const toplamUrunAdedi = Math.max(1, parseInt(plan.toplam_urun_adedi, 10) || 1);
        const sevkiyatBilgisi = this.hesaplaSevkiyatSuresi(hedefSehir, toplamUrunAdedi);
        let guncelAciklama = aciklama.replace(
            /Tahmini Maliyet:\s*[^\r\n]*/i,
            `Tahmini Maliyet: ${sevkiyatBilgisi.maliyet}`
        );

        if (!/Toplam Ürün Adedi:/i.test(guncelAciklama)) {
            guncelAciklama = guncelAciklama.replace(
                /(Tahmini Maliyet:)/i,
                `Toplam Ürün Adedi: ${toplamUrunAdedi}\n💰 $1`
            );
        }

        if (!/Maliyet Notu:/i.test(guncelAciklama)) {
            guncelAciklama += `\nℹ️ Maliyet Notu: ${sevkiyatBilgisi.maliyetAciklamasi}`;
        }

        return guncelAciklama;
    }

    // Sevkiyat Takip Fonksiyonları
    async sevkiyatTakipModalAc() {
        try {
            // Onaylanmış siparişleri getir
            const siparisler = await db.query(`
                SELECT s.*, m.ad as musteri_adi, m.sehir
                FROM siparisler s
                LEFT JOIN musteriler m ON s.musteri_id = m.id
                WHERE s.durum IN ('onaylandi', 'hazirlaniyor', 'kargoya_verildi', 'dagitim_subesinde', 'dagitimda')
                ORDER BY s.tarih DESC
            `);

            if (siparisler.length === 0) {
                this.hataGoster('Takip edilebilir sipariş bulunamadı!');
                return;
            }

            this.siparisListesiDoldurTakip(siparisler);
            this.modalAc('sevkiyatTakipModal');
        } catch (error) {
            console.error('Sevkiyat takip modal açma hatası:', error);
            this.hataGoster('Sevkiyat takip ekranı açılırken hata oluştu');
        }
    }

    siparisListesiDoldurTakip(siparisler) {
        const select = document.getElementById('takipSiparisSecim');
        select.innerHTML = '<option value="">Sipariş Seçin</option>';
        
        siparisler.forEach(siparis => {
            const option = document.createElement('option');
            option.value = siparis.id;
            option.textContent = `${siparis.siparis_no} - ${siparis.musteri_adi} - ${siparis.sehir}`;
            option.dataset.siparisData = JSON.stringify(siparis);
            select.appendChild(option);
        });

        // Sipariş seçimi event listener
        select.addEventListener('change', async (e) => {
            if (e.target.value) {
                const siparisData = JSON.parse(e.target.selectedOptions[0].dataset.siparisData);
                await this.siparisSecildiTakip(siparisData);
            }
        });
    }

    async siparisSecildiTakip(siparis) {
        console.log('Takip için seçilen sipariş:', siparis);
        
        // Mevcut takip geçmişini göster
        await this.takipGecmisiGoster(siparis.id);
        
        // Form alanlarını doldur
        document.getElementById('takipMusteriAdi').value = siparis.musteri_adi;
        document.getElementById('takipSiparisNo').value = siparis.siparis_no;
        document.getElementById('takipMevcutDurum').value = this.getDurumText(siparis.durum);
        
        // Bir sonraki olası durumları göster
        this.sonrakiDurumlariGoster(siparis.durum);
    }

    async takipGecmisiGoster(siparisId) {
        const takipGecmisi = await db.getSevkiyatTakip(siparisId);
        const tbody = document.getElementById('takipGecmisiBody');
        tbody.innerHTML = '';
        
        if (takipGecmisi.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center">Henüz takip kaydı yok</td>
                </tr>
            `;
            return;
        }

        takipGecmisi.forEach(takip => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${this.formatTarih(takip.tarih)}</td>
                <td>
                    <span class="status-badge ${this.getDurumClass(takip.durum)}">
                        ${this.getDurumText(takip.durum)}
                    </span>
                </td>
                <td>${takip.konum || '-'}</td>
                <td>${takip.aciklama || '-'}</td>
            `;
            tbody.appendChild(row);
        });
    }

    sonrakiDurumlariGoster(mevcutDurum) {
        const durumSirasi = [
            'onaylandi',
            'hazirlaniyor', 
            'kargoya_verildi',
            'dagitim_subesinde',
            'dagitimda',
            'teslim_edildi'
        ];

        const mevcutIndex = durumSirasi.indexOf(mevcutDurum);
        const select = document.getElementById('yeniDurum');
        select.innerHTML = '<option value="">Yeni Durum Seçin</option>';

        // Sonraki durumları ekle
        for (let i = mevcutIndex + 1; i < durumSirasi.length; i++) {
            const durum = durumSirasi[i];
            const option = document.createElement('option');
            option.value = durum;
            option.textContent = this.getDurumText(durum);
            select.appendChild(option);
        }
    }

    getDurumText(durum) {
        const durumMap = {
            'bekliyor': 'Bekliyor',
            'onaylandi': 'Onaylandı',
            'hazirlaniyor': 'Hazırlanıyor',
            'kargoya_verildi': 'Kargoya Verildi',
            'dagitim_subesinde': 'Dağıtım Şubesinde',
            'dagitimda': 'Dağıtımda',
            'teslim_edildi': 'Teslim Edildi',
            'iptal': 'İptal'
        };
        return durumMap[durum] || durum;
    }

    getDurumClass(durum) {
        const classMap = {
            'bekliyor': 'warning',
            'onaylandi': 'info',
            'hazirlaniyor': 'primary',
            'kargoya_verildi': 'success',
            'dagitim_subesinde': 'success',
            'dagitimda': 'success',
            'teslim_edildi': 'success',
            'iptal': 'danger'
        };
        return classMap[durum] || 'secondary';
    }

    async takipEkle() {
        try {
            const formData = new FormData(document.getElementById('takipForm'));
            const siparisId = document.getElementById('takipSiparisSecim').value;
            
            if (!siparisId) {
                this.hataGoster('Lütfen bir sipariş seçin');
                return;
            }

            const takipData = {
                siparis_id: siparisId,
                durum: formData.get('yeniDurum'),
                aciklama: formData.get('takipAciklama'),
                konum: formData.get('takipKonum'),
                kullanici: 'Sistem' // Gerçek uygulamada login kullanıcısı
            };

            if (!takipData.durum) {
                this.hataGoster('Lütfen yeni durum seçin');
                return;
            }

            console.log('Takip ekleniyor:', takipData);

            // Sevkiyat takibi ekle (bu fonksiyon zaten sipariş durumunu da güncelliyor)
            await db.addSevkiyatTakip(takipData);
            
            console.log('Takip eklendi, listeleri güncelleniyor...');
            
            this.basariGoster('Sevkiyat takibi güncellendi!');
            this.modalKapat('sevkiyatTakipModal');
            
            // Önce sipariş listesini güncelle
            if (window.siparisManager) {
                console.log('Sipariş listesi güncelleniyor...');
                await window.siparisManager.siparisleriYukle();
                window.siparisManager.tabloGuncelle();
                console.log('Sipariş listesi güncellendi');
            }
            
            // Sonra sevkiyat listesini güncelle
            await this.sevkiyatTakipListele();

        } catch (error) {
            console.error('Takip ekleme hatası:', error);
            this.hataGoster('Takip eklenirken hata oluştu: ' + error.message);
        }
    }

    async siparisDetaylariniGorSevkiyat(siparisId) {
        try {
            const takipGecmisi = await db.getSevkiyatTakip(siparisId);
            
            let takipHTML = '';
            if (takipGecmisi.length > 0) {
                takipHTML = '<h4>Sevkiyat Takibi:</h4><div class="takip-timeline">';
                takipGecmisi.forEach(takip => {
                    takipHTML += `
                        <div class="takip-step">
                            <div class="takip-date">${this.formatTarih(takip.tarih)}</div>
                            <div class="takip-status">${this.getDurumText(takip.durum)}</div>
                            <div class="takip-location">${takip.konum || ''}</div>
                            <div class="takip-description">${takip.aciklama || ''}</div>
                        </div>
                    `;
                });
                takipHTML += '</div>';
            } else {
                takipHTML = '<p>Henüz sevkiyat takip kaydı yok.</p>';
            }

            // Modal göster
            const modal = document.createElement('div');
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Sevkiyat Detayları</h3>
                        <button class="modal-close" onclick="this.closest('.modal').remove()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        ${takipHTML}
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

        } catch (error) {
            console.error('Sevkiyat detay görüntüleme hatası:', error);
            this.hataGoster('Sevkiyat detayları görüntülenirken hata oluştu');
        }
    }

    // Sevkiyat takip listesini güncelle
    async sevkiyatTakipListele() {
        try {
            console.log('Sevkiyat takip listesi güncelleniyor...');
            // Bu fonksiyon sevkiyat takip listesini güncellemek için
            // Şu an için sadece log yazdırıyoruz
            // Gelecekte sevkiyat listesi UI'ı varsa burada güncellenecek
        } catch (error) {
            console.error('Sevkiyat takip listesi güncelleme hatası:', error);
        }
    }
}

// Global sevkiyat yöneticisi
const sevkiyatManager = new SevkiyatManager();

// Global erişim için window objesine ekle
window.sevkiyatManager = sevkiyatManager;
