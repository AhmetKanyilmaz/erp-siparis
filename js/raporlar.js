// Raporlar ve Analizler
class RaporManager {
    constructor() {
        this.satisGrafik = null;
        this.stokGrafik = null;
        this.init();
    }

    async init() {
        this.eventListenerEkle();
        await this.raporlariYukle();
    }

    eventListenerEkle() {
        // Bu bölümde rapor filtreleri ve event listener'lar eklenebilir
    }

    async raporlariYukle() {
        try {
            await this.satisGrafigiOlustur();
            await this.stokGrafigiOlustur();
        } catch (error) {
            console.error('Raporlar yüklenirken hata:', error);
            this.hataGoster('Raporlar yüklenirken bir hata oluştu');
        }
    }

    async satisGrafigiOlustur() {
        try {
            // Son 30 günün satış verilerini al
            const satisVerileri = await db.query(`
                SELECT 
                    DATE(tarih) as tarih,
                    COUNT(*) as siparis_sayisi,
                    SUM(toplam_tutar) as toplam_satis
                FROM siparisler 
                WHERE tarih >= DATE('now', '-30 days')
                AND durum != 'iptal'
                GROUP BY DATE(tarih)
                ORDER BY tarih
            `);

            // Grafik verilerini hazırla
            const labels = [];
            const siparisData = [];
            const satisData = [];

            // Son 30 gün için boş veri seti oluştur
            for (let i = 29; i >= 0; i--) {
                const tarih = new Date();
                tarih.setDate(tarih.getDate() - i);
                const tarihStr = tarih.toISOString().split('T')[0];
                
                labels.push(tarih.toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' }));
                
                const gunVerisi = satisVerileri.find(v => v.tarih === tarihStr);
                siparisData.push(gunVerisi ? gunVerisi.siparis_sayisi : 0);
                satisData.push(gunVerisi ? gunVerisi.toplam_satis : 0);
            }

            const ctx = document.getElementById('satisGrafik').getContext('2d');
            
            if (this.satisGrafik) {
                this.satisGrafik.destroy();
            }

            this.satisGrafik = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Sipariş Sayısı',
                            data: siparisData,
                            borderColor: '#2563eb',
                            backgroundColor: 'rgba(37, 99, 235, 0.1)',
                            tension: 0.4,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Satış Tutarı (₺)',
                            data: satisData,
                            borderColor: '#059669',
                            backgroundColor: 'rgba(5, 150, 105, 0.1)',
                            tension: 0.4,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: {
                                display: true,
                                text: 'Sipariş Sayısı'
                            }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: {
                                display: true,
                                text: 'Satış Tutarı (₺)'
                            },
                            grid: {
                                drawOnChartArea: false,
                            },
                        }
                    },
                    plugins: {
                        title: {
                            display: true,
                            text: 'Son 30 Gün Satış Performansı'
                        },
                        legend: {
                            display: true,
                            position: 'top'
                        }
                    }
                }
            });

        } catch (error) {
            console.error('Satış grafiği oluşturma hatası:', error);
        }
    }

    async stokGrafigiOlustur() {
        try {
            // Kategori bazında stok verilerini al
            const stokVerileri = await db.query(`
                SELECT 
                    kategori,
                    COUNT(*) as urun_sayisi,
                    SUM(stok_miktari) as toplam_stok,
                    SUM(CASE WHEN stok_miktari <= minimum_stok THEN 1 ELSE 0 END) as dusuk_stok_sayisi
                FROM urunler 
                WHERE kategori IS NOT NULL AND kategori != ''
                GROUP BY kategori
                ORDER BY toplam_stok DESC
            `);

            if (stokVerileri.length === 0) {
                // Veri yoksa boş grafik göster
                const ctx = document.getElementById('stokGrafik').getContext('2d');
                if (this.stokGrafik) {
                    this.stokGrafik.destroy();
                }
                
                ctx.font = '16px Inter';
                ctx.fillStyle = '#6b7280';
                ctx.textAlign = 'center';
                ctx.fillText('Henüz stok verisi bulunmuyor', ctx.canvas.width / 2, ctx.canvas.height / 2);
                return;
            }

            const kategoriler = stokVerileri.map(v => v.kategori);
            const stokMiktarlari = stokVerileri.map(v => v.toplam_stok);
            const dusukStokSayilari = stokVerileri.map(v => v.dusuk_stok_sayisi);

            const ctx = document.getElementById('stokGrafik').getContext('2d');
            
            if (this.stokGrafik) {
                this.stokGrafik.destroy();
            }

            this.stokGrafik = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: kategoriler,
                    datasets: [
                        {
                            label: 'Toplam Stok',
                            data: stokMiktarlari,
                            backgroundColor: [
                                'rgba(37, 99, 235, 0.8)',
                                'rgba(5, 150, 105, 0.8)',
                                'rgba(217, 119, 6, 0.8)',
                                'rgba(220, 38, 38, 0.8)',
                                'rgba(139, 69, 19, 0.8)',
                                'rgba(147, 51, 234, 0.8)'
                            ],
                            borderColor: [
                                '#2563eb',
                                '#059669',
                                '#d97706',
                                '#dc2626',
                                '#8b4513',
                                '#9333ea'
                            ],
                            borderWidth: 1
                        },
                        {
                            label: 'Düşük Stok Ürün Sayısı',
                            data: dusukStokSayilari,
                            backgroundColor: 'rgba(220, 38, 38, 0.6)',
                            borderColor: '#dc2626',
                            borderWidth: 1,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            position: 'left',
                            title: {
                                display: true,
                                text: 'Stok Miktarı'
                            }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Düşük Stok Ürün Sayısı'
                            },
                            grid: {
                                drawOnChartArea: false,
                            },
                        }
                    },
                    plugins: {
                        title: {
                            display: true,
                            text: 'Kategori Bazında Stok Analizi'
                        },
                        legend: {
                            display: true,
                            position: 'top'
                        }
                    }
                }
            });

        } catch (error) {
            console.error('Stok grafiği oluşturma hatası:', error);
        }
    }

    async detayliRaporOlustur() {
        try {
            const raporVerileri = await this.detayliRaporVerileriniAl();
            this.detayliRaporModalGoster(raporVerileri);
        } catch (error) {
            console.error('Detaylı rapor oluşturma hatası:', error);
            this.hataGoster('Detaylı rapor oluşturulurken bir hata oluştu');
        }
    }

    async detayliRaporVerileriniAl() {
        const [
            toplamSatislar,
            kategoriSatislar,
            aylikTrend,
            enCokSatanUrunler,
            musteriAnalizi
        ] = await Promise.all([
            // Toplam satışlar
            db.query(`
                SELECT 
                    COUNT(*) as toplam_siparis,
                    SUM(toplam_tutar) as toplam_ciro,
                    AVG(toplam_tutar) as ortalama_siparis_tutari
                FROM siparisler 
                WHERE durum != 'iptal'
            `),
            
            // Kategori bazında satışlar
            db.query(`
                SELECT 
                    u.kategori,
                    COUNT(sd.id) as siparis_sayisi,
                    SUM(sd.toplam) as toplam_satis
                FROM siparis_detaylari sd
                LEFT JOIN urunler u ON sd.urun_id = u.id
                LEFT JOIN siparisler s ON sd.siparis_id = s.id
                WHERE s.durum != 'iptal' AND u.kategori IS NOT NULL
                GROUP BY u.kategori
                ORDER BY toplam_satis DESC
            `),
            
            // Son 6 ayın trendi
            db.query(`
                SELECT 
                    strftime('%Y-%m', tarih) as ay,
                    COUNT(*) as siparis_sayisi,
                    SUM(toplam_tutar) as toplam_satis
                FROM siparisler
                WHERE tarih >= DATE('now', '-6 months')
                AND durum != 'iptal'
                GROUP BY strftime('%Y-%m', tarih)
                ORDER BY ay
            `),
            
            // En çok satan ürünler
            db.query(`
                SELECT 
                    u.ad as urun_adi,
                    u.kategori,
                    SUM(sd.miktar) as toplam_satis_miktari,
                    SUM(sd.toplam) as toplam_satis_tutari
                FROM siparis_detaylari sd
                LEFT JOIN urunler u ON sd.urun_id = u.id
                LEFT JOIN siparisler s ON sd.siparis_id = s.id
                WHERE s.durum != 'iptal'
                GROUP BY u.id
                ORDER BY toplam_satis_miktari DESC
                LIMIT 10
            `),
            
            // Müşteri analizi
            db.query(`
                SELECT 
                    m.ad as musteri_adi,
                    COUNT(s.id) as siparis_sayisi,
                    SUM(s.toplam_tutar) as toplam_harcama,
                    AVG(s.toplam_tutar) as ortalama_siparis
                FROM siparisler s
                LEFT JOIN musteriler m ON s.musteri_id = m.id
                WHERE s.durum != 'iptal'
                GROUP BY m.id
                ORDER BY toplam_harcama DESC
                LIMIT 10
            `)
        ]);

        return {
            toplamSatislar: toplamSatislar[0] || {},
            kategoriSatislar,
            aylikTrend,
            enCokSatanUrunler,
            musteriAnalizi
        };
    }

    detayliRaporModalGoster(veriler) {
        const modalHtml = `
            <div class="modal active" id="detayliRaporModal">
                <div class="modal-content" style="max-width: 1200px; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <h3>Detaylı Satış Raporu</h3>
                        <button class="modal-close" data-modal="detayliRaporModal">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        ${this.detayliRaporHTMLOlustur(veriler)}
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="raporManager.raporuIndir()">
                            <i class="fas fa-download"></i> Raporu İndir
                        </button>
                        <button class="btn btn-secondary" data-modal="detayliRaporModal">Kapat</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.querySelector('[data-modal="detayliRaporModal"]').addEventListener('click', () => {
            this.modalKapat('detayliRaporModal');
            document.getElementById('detayliRaporModal').remove();
        });
    }

    detayliRaporHTMLOlustur(veriler) {
        return `
            <div class="rapor-container">
                <!-- Özet Kartları -->
                <div class="stats-grid mb-6">
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-shopping-cart"></i>
                        </div>
                        <div class="stat-content">
                            <h3>${veriler.toplamSatislar.toplam_siparis || 0}</h3>
                            <p>Toplam Sipariş</p>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon revenue">
                            <i class="fas fa-lira-sign"></i>
                        </div>
                        <div class="stat-content">
                            <h3>${this.formatTutar(veriler.toplamSatislar.toplam_ciro || 0)}</h3>
                            <p>Toplam Ciro</p>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon info">
                            <i class="fas fa-chart-line"></i>
                        </div>
                        <div class="stat-content">
                            <h3>${this.formatTutar(veriler.toplamSatislar.ortalama_siparis_tutari || 0)}</h3>
                            <p>Ortalama Sipariş</p>
                        </div>
                    </div>
                </div>

                <!-- Kategori Satışları -->
                <div class="rapor-section mb-6">
                    <h4>Kategori Bazında Satışlar</h4>
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Kategori</th>
                                    <th>Sipariş Sayısı</th>
                                    <th>Toplam Satış</th>
                                    <th>Yüzde</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${veriler.kategoriSatislar.map(kategori => {
                                    const toplamSatis = veriler.kategoriSatislar.reduce((sum, k) => sum + (k.toplam_satis || 0), 0);
                                    const yuzde = toplamSatis > 0 ? ((kategori.toplam_satis || 0) / toplamSatis * 100).toFixed(1) : 0;
                                    return `
                                        <tr>
                                            <td class="font-semibold">${kategori.kategori}</td>
                                            <td class="text-center">${kategori.siparis_sayisi}</td>
                                            <td class="font-semibold">${this.formatTutar(kategori.toplam_satis || 0)}</td>
                                            <td class="text-center">${yuzde}%</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- En Çok Satan Ürünler -->
                <div class="rapor-section mb-6">
                    <h4>En Çok Satan Ürünler</h4>
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Ürün Adı</th>
                                    <th>Kategori</th>
                                    <th>Satış Miktarı</th>
                                    <th>Satış Tutarı</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${veriler.enCokSatanUrunler.map(urun => `
                                    <tr>
                                        <td class="font-semibold">${urun.urun_adi}</td>
                                        <td>${urun.kategori}</td>
                                        <td class="text-center">${urun.toplam_satis_miktari}</td>
                                        <td class="font-semibold">${this.formatTutar(urun.toplam_satis_tutari || 0)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- En İyi Müşteriler -->
                <div class="rapor-section">
                    <h4>En İyi Müşteriler</h4>
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Müşteri Adı</th>
                                    <th>Sipariş Sayısı</th>
                                    <th>Toplam Harcama</th>
                                    <th>Ortalama Sipariş</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${veriler.musteriAnalizi.map(musteri => `
                                    <tr>
                                        <td class="font-semibold">${musteri.musteri_adi}</td>
                                        <td class="text-center">${musteri.siparis_sayisi}</td>
                                        <td class="font-semibold">${this.formatTutar(musteri.toplam_harcama || 0)}</td>
                                        <td class="font-semibold">${this.formatTutar(musteri.ortalama_siparis || 0)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    raporuIndir() {
        // CSV formatında rapor indirme
        const csvContent = this.csvRaporOlustur();
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `satıs_raporu_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.basariGoster('Rapor başarıyla indirildi');
    }

    async csvRaporOlustur() {
        try {
            const veriler = await this.detayliRaporVerileriniAl();
            
            let csv = 'ERP Satış Raporu\n';
            csv += `Tarih: ${new Date().toLocaleDateString('tr-TR')}\n\n`;
            
            // Özet bilgiler
            csv += 'ÖZET BİLGİLER\n';
            csv += `Toplam Sipariş,${veriler.toplamSatislar.toplam_siparis || 0}\n`;
            csv += `Toplam Ciro,${veriler.toplamSatislar.toplam_ciro || 0}\n`;
            csv += `Ortalama Sipariş,${veriler.toplamSatislar.ortalama_siparis_tutari || 0}\n\n`;
            
            // Kategori satışları
            csv += 'KATEGORİ SATIŞLARI\n';
            csv += 'Kategori,Sipariş Sayısı,Toplam Satış\n';
            veriler.kategoriSatislar.forEach(kategori => {
                csv += `${kategori.kategori},${kategori.siparis_sayisi},${kategori.toplam_satis || 0}\n`;
            });
            
            csv += '\n';
            
            // En çok satan ürünler
            csv += 'EN ÇOK SATAN ÜRÜNLER\n';
            csv += 'Ürün Adı,Kategori,Satış Miktarı,Satış Tutarı\n';
            veriler.enCokSatanUrunler.forEach(urun => {
                csv += `${urun.urun_adi},${urun.kategori},${urun.toplam_satis_miktari},${urun.toplam_satis_tutari || 0}\n`;
            });
            
            return csv;
        } catch (error) {
            console.error('CSV oluşturma hatası:', error);
            return 'Rapor oluşturulurken hata oluştu';
        }
    }

    // Yardımcı fonksiyonlar
    formatTutar(tutar) {
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: 'TRY'
        }).format(tutar || 0);
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

// Global rapor yöneticisi
const raporManager = new RaporManager();
