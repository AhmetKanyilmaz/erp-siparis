// Ana Uygulama
class ERPApp {
    constructor() {
        this.activeSection = 'siparisListesi';
        this.sidebarCollapsed = false;
        this.init();
    }

    async init() {
        this.eventListenerEkle();
        await this.istatistikleriGuncelle();
        this.sayfaYuklendi();
    }

    eventListenerEkle() {
        // Sidebar toggle
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            this.sidebarToggle();
        });

        // Navigation menü
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const module = e.currentTarget.dataset.module;
                this.moduleDegistir(module);
            });
        });

        // Action buttons
        document.getElementById('siparisListesiBtn').addEventListener('click', () => {
            this.sectionGoster('siparisListesi');
        });

        document.getElementById('stokDurumuBtn').addEventListener('click', () => {
            this.sectionGoster('stokDurumu');
        });

        document.getElementById('sevkiyatPlanBtn').addEventListener('click', () => {
            this.sectionGoster('sevkiyatPlan');
        });

        document.getElementById('faturalamaBtnMain').addEventListener('click', () => {
            this.sectionGoster('faturalama');
        });

        document.getElementById('raporlarBtn').addEventListener('click', () => {
            this.sectionGoster('raporlar');
        });

        // Boş veritabanına canlı demo için örnek verileri yükle
        const demoDataBtn = document.getElementById('demoDataBtn');
        demoDataBtn.addEventListener('click', async () => {
            const oncekiIcerik = demoDataBtn.innerHTML;
            demoDataBtn.disabled = true;
            demoDataBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Yükleniyor...';

            try {
                const sonuc = await db.demoVerileriniYukle();
                await this.tumEkranlariYenile();
                this.toastGoster(
                    `${sonuc.musteri} müşteri, ${sonuc.urun} ürün ve ${sonuc.siparis} sipariş yüklendi`,
                    'success'
                );
            } catch (error) {
                console.error('Demo verisi yükleme hatası:', error);
                this.toastGoster(error.message || 'Demo verileri yüklenemedi', 'error');
            } finally {
                demoDataBtn.disabled = false;
                demoDataBtn.innerHTML = oncekiIcerik;
            }
        });

        // Veritabanını tamamen sıfırla
        const resetDbBtn = document.getElementById('resetDbBtn');
        resetDbBtn.addEventListener('click', async () => {
            if (!confirm('Tüm veriler silinecek! Devam etmek istediğinizden emin misiniz?')) {
                return;
            }

            const oncekiIcerik = resetDbBtn.innerHTML;
            resetDbBtn.disabled = true;
            resetDbBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sıfırlanıyor...';

            try {
                await db.resetDatabase();
                await this.tumEkranlariYenile();
                this.toastGoster('Veritabanı başarıyla sıfırlandı', 'success');
                resetDbBtn.disabled = false;
                resetDbBtn.innerHTML = oncekiIcerik;
            } catch (error) {
                console.error('Veritabanı sıfırlama hatası:', error);
                this.toastGoster('Veritabanı sıfırlanamadı', 'error');
                resetDbBtn.disabled = false;
                resetDbBtn.innerHTML = oncekiIcerik;
            }
        });

        // Modal kapatma (overlay tıklama)
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                const modal = e.target;
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });

        // Modal close butonları
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-close') || e.target.closest('.modal-close')) {
                const closeBtn = e.target.classList.contains('modal-close') ? e.target : e.target.closest('.modal-close');
                const modalId = closeBtn.getAttribute('data-modal');
                if (modalId) {
                    const modal = document.getElementById(modalId);
                    if (modal) {
                        modal.classList.remove('active');
                        document.body.style.overflow = '';
                    }
                }
            }
        });

        // ESC tuşu ile modal kapatma
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const activeModal = document.querySelector('.modal.active');
                if (activeModal) {
                    activeModal.classList.remove('active');
                    document.body.style.overflow = '';
                }
            }
        });

        // Responsive sidebar
        this.responsiveSidebarKontrol();
        window.addEventListener('resize', () => {
            this.responsiveSidebarKontrol();
        });
    }

    sidebarToggle() {
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.getElementById('mainContent');
        
        if (window.innerWidth > 1024) {
            // Desktop: Collapse/expand
            this.sidebarCollapsed = !this.sidebarCollapsed;
            sidebar.classList.toggle('collapsed', this.sidebarCollapsed);
            mainContent.classList.toggle('sidebar-collapsed', this.sidebarCollapsed);
        } else {
            // Mobile: Open/close
            sidebar.classList.toggle('open');
            this.sidebarOverlayToggle();
        }
    }

    sidebarOverlayToggle() {
        let overlay = document.querySelector('.sidebar-overlay');
        const sidebar = document.getElementById('sidebar');
        
        if (sidebar.classList.contains('open')) {
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'sidebar-overlay';
                overlay.addEventListener('click', () => {
                    sidebar.classList.remove('open');
                    overlay.classList.remove('active');
                    setTimeout(() => overlay.remove(), 300);
                });
                document.body.appendChild(overlay);
            }
            overlay.classList.add('active');
        } else if (overlay) {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
        }
    }

    responsiveSidebarKontrol() {
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.getElementById('mainContent');
        
        if (window.innerWidth <= 1024) {
            // Mobile mod
            sidebar.classList.remove('collapsed');
            mainContent.classList.remove('sidebar-collapsed');
            this.sidebarCollapsed = false;
        }
    }

    moduleDegistir(module) {
        if (module === 'siparis') {
            // Aktif modül zaten sipariş yönetimi
            this.navMenuGuncelle(module);
            this.sectionGoster('siparisListesi');
        } else {
            // Diğer modüller henüz aktif değil
            this.moduleDisabledMesajiGoster(module);
        }
    }

    moduleDisabledMesajiGoster(module) {
        const moduleNames = {
            'finans': 'Finans Yönetimi',
            'tedarik': 'Tedarik Yönetimi',
            'uretim': 'Üretim Yönetimi',
            'depo': 'Depo Yönetimi',
            'musteri': 'Müşteri İlişkileri Yönetimi',
            'ik': 'İnsan Kaynakları Yönetimi',
            'pazarlama': 'Pazarlama',
            'eticaret': 'E-Ticaret'
        };

        const moduleName = moduleNames[module] || 'Bu modül';
        
        this.toastGoster(`${moduleName} henüz aktif değil. Şu anda sadece Sipariş Yönetimi modülü kullanılabilir.`, 'info');
    }

    navMenuGuncelle(activeModule) {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            if (link.dataset.module === activeModule) {
                link.classList.add('active');
            }
        });
    }

    sectionGoster(sectionId) {
        // Tüm section'ları gizle
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });

        // Seçilen section'ı göster
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('active');
            this.activeSection = sectionId;
        }

        // Action button'ları güncelle
        this.actionButtonlariGuncelle(sectionId);

        // Mobile'da sidebar'ı kapat
        if (window.innerWidth <= 1024) {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.remove('open');
            const overlay = document.querySelector('.sidebar-overlay');
            if (overlay) {
                overlay.classList.remove('active');
                setTimeout(() => overlay.remove(), 300);
            }
        }
    }

    actionButtonlariGuncelle(activeSection) {
        const buttons = [
            'siparisListesiBtn',
            'stokDurumuBtn', 
            'sevkiyatPlanBtn',
            'faturalamaBtnMain',
            'raporlarBtn'
        ];

        buttons.forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.classList.remove('btn-primary');
                button.classList.add('btn-secondary');
            }
        });

        // Aktif button'ı vurgula
        const buttonMap = {
            'siparisListesi': 'siparisListesiBtn',
            'stokDurumu': 'stokDurumuBtn',
            'sevkiyatPlan': 'sevkiyatPlanBtn',
            'faturalama': 'faturalamaBtnMain',
            'raporlar': 'raporlarBtn'
        };

        const activeButton = document.getElementById(buttonMap[activeSection]);
        if (activeButton) {
            activeButton.classList.remove('btn-secondary');
            activeButton.classList.add('btn-primary');
        }
    }

    async istatistikleriGuncelle() {
        try {
            const istatistikler = await db.getIstatistikler();
            
            document.getElementById('toplamSiparis').textContent = istatistikler.toplamSiparis;
            document.getElementById('bekleyenSiparis').textContent = istatistikler.bekleyenSiparis;
            document.getElementById('sevkEdilen').textContent = istatistikler.sevkEdilen;
            document.getElementById('toplamCiro').textContent = this.formatTutar(istatistikler.toplamCiro);
        } catch (error) {
            console.error('İstatistikler güncellenirken hata:', error);
        }
    }

    async tumEkranlariYenile() {
        if (window.siparisManager) {
            await window.siparisManager.siparisleriYukle();
            window.siparisManager.tabloGuncelle();
        }

        if (window.stokManager) {
            await window.stokManager.urunleriYukle();
            window.stokManager.stokTabloGuncelle();
        }

        if (window.sevkiyatManager) {
            await window.sevkiyatManager.sevkiyatPlanlariYukle();
            window.sevkiyatManager.sevkiyatCardsGuncelle();
        }

        if (window.faturaManager) {
            await window.faturaManager.faturalariYukle();
            window.faturaManager.tabloGuncelle();
        }

        if (window.raporManager) {
            await window.raporManager.raporlariYukle();
        }

        await this.istatistikleriGuncelle();
    }

    sayfaYuklendi() {
        // Sayfa yüklenme animasyonu
        document.body.classList.add('loaded');
        
        // İlk section'ı göster
        this.sectionGoster('siparisListesi');
        
        // Nav menüyü güncelle
        this.navMenuGuncelle('siparis');

        // Hoş geldiniz mesajı
        setTimeout(() => {
            this.toastGoster('ERP Sipariş Yönetimi sistemine hoş geldiniz!', 'success');
        }, 1000);
    }

    // Genel utility fonksiyonlar
    formatTutar(tutar) {
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: 'TRY'
        }).format(tutar || 0);
    }

    formatTarih(tarih) {
        return new Date(tarih).toLocaleDateString('tr-TR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    toastGoster(mesaj, tip = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${tip}`;
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas ${this.getToastIcon(tip)}"></i>
                <span>${mesaj}</span>
            </div>
        `;
        
        const toastColors = {
            'success': '#059669',
            'error': '#dc2626',
            'warning': '#d97706',
            'info': '#2563eb'
        };

        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            z-index: 9999;
            font-weight: 500;
            background-color: ${toastColors[tip] || toastColors.info};
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-width: 400px;
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;
        
        toast.querySelector('.toast-content').style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        
        document.body.appendChild(toast);
        
        // Animasyon
        setTimeout(() => {
            toast.style.transform = 'translateX(0)';
        }, 100);
        
        // Toast'ı kaldır
        setTimeout(() => {
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }, 4000);

        // Tıklama ile kapat
        toast.addEventListener('click', () => {
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        });
    }

    getToastIcon(tip) {
        const icons = {
            'success': 'fa-check-circle',
            'error': 'fa-exclamation-triangle',
            'warning': 'fa-exclamation-circle',
            'info': 'fa-info-circle'
        };
        return icons[tip] || icons.info;
    }

    // Loading state yönetimi
    loadingGoster(element) {
        if (typeof element === 'string') {
            element = document.getElementById(element);
        }
        
        if (element) {
            element.innerHTML = `
                <div class="loading">
                    <div class="loading-spinner"></div>
                    <p>Yükleniyor...</p>
                </div>
            `;
        }
    }

    // Hata durumu gösterimi
    hataGoster(element, mesaj) {
        if (typeof element === 'string') {
            element = document.getElementById(element);
        }
        
        if (element) {
            element.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle" style="color: #dc2626;"></i>
                    <h3>Bir hata oluştu</h3>
                    <p>${mesaj}</p>
                </div>
            `;
        }
    }

    // Onaylama dialog'u
    onayIste(mesaj, onayCallback, iptalCallback) {
        const modalHtml = `
            <div class="modal active confirmation-modal" id="onayModal">
                <div class="modal-content">
                    <div class="modal-body">
                        <div class="confirmation-icon warning">
                            <i class="fas fa-question-circle"></i>
                        </div>
                        <h4>Onay Gerekli</h4>
                        <p>${mesaj}</p>
                        <div class="form-actions">
                            <button class="btn btn-secondary" id="onayIptal">İptal</button>
                            <button class="btn btn-primary" id="onayTamam">Tamam</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('onayTamam').addEventListener('click', () => {
            document.getElementById('onayModal').remove();
            if (onayCallback) onayCallback();
        });

        document.getElementById('onayIptal').addEventListener('click', () => {
            document.getElementById('onayModal').remove();
            if (iptalCallback) iptalCallback();
        });
    }
}

// Uygulama başlatma
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Veritabanının hazır olmasını bekle
        await db.initPromise;
        
        // Uygulamayı başlat
        window.app = new ERPApp();
        
        // Manager'ları başlat
        console.log('Manager\'lar başlatılıyor...');
        
        // Global olarak erişilebilir yap (zaten `window.app` atandı yukarıda)
        window.siparisManager = siparisManager;
        window.stokManager = stokManager;
        window.sevkiyatManager = sevkiyatManager;
        window.raporManager = raporManager;
        
        // FaturaManager'ı başlat
        window.faturaManager = new FaturaManager();
        console.log('FaturaManager başlatıldı');
        
    } catch (error) {
        console.error('Uygulama başlatılırken hata:', error);
        document.body.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; text-align: center;">
                <i class="fas fa-exclamation-triangle" style="font-size: 4rem; color: #dc2626; margin-bottom: 1rem;"></i>
                <h2>Uygulama Başlatılamadı</h2>
                <p>Veritabanı bağlantısında bir sorun oluştu. Lütfen sayfayı yenileyin.</p>
                <button onclick="window.location.reload()" class="btn btn-primary" style="margin-top: 1rem;">
                    <i class="fas fa-refresh"></i> Sayfayı Yenile
                </button>
            </div>
        `;
    }
});

// Global error handler
window.addEventListener('error', (e) => {
    console.error('Global hata:', e.error);
    if (window.app) {
        window.app.toastGoster('Beklenmeyen bir hata oluştu', 'error');
    }
});

// Service Worker kaydı (isteğe bağlı)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Service worker dosyası varsa kaydet
        // navigator.serviceWorker.register('/sw.js');
    });
}
