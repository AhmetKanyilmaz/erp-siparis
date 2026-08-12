# ERP Sipariş Yönetimi

Türkçe, açık kaynak ve tarayıcı tabanlı sipariş yönetimi uygulaması. Sipariş, stok, sevkiyat, faturalama, iade ve raporlama süreçlerini tek ekranda yönetir.

> Canlı demo GitHub Pages üzerinden yayımlanır. Demo bağlantısı depo oluşturulduktan sonra buraya eklenecektir.

## Özellikler

- Ayrı ürün satırlarıyla çok ürünlü sipariş oluşturma
- Bekleyen siparişleri düzenleme ve gerçek stok rezervasyonu
- Durum, tarih, şehir ve tutara göre gelişmiş filtreleme
- Sipariş zaman çizelgesi ve işlem geçmişi
- Manuel ve otomatik sevkiyat planlama
- Tam teslimat adresi ve sevkiyat durum senkronizasyonu
- Kısmi veya tam iade ve otomatik stok girişi
- Faturalama, ödeme durumu ve yazdırma
- Satış ve stok raporları
- Yerel demo verisi, veritabanı sıfırlama ve demo verisi yükleme

## Canlı demo hakkında

Web demosu `sql.js` ile SQLite'ı tarayıcı içinde çalıştırır ve verileri tarayıcının `localStorage` alanında saklar. Bu nedenle:

- Her ziyaretçinin verisi yalnızca kendi tarayıcısında tutulur.
- Kullanıcılar birbirlerinin kayıtlarını göremez.
- Tarayıcı verileri temizlenirse demo kayıtları silinebilir.
- Sunucu tarafına müşteri veya sipariş verisi gönderilmez.

Gerçek yerel `.sqlite` dosyası kullanan çevrimdışı masaüstü sürümü ilerleyen aşamada GitHub Releases bölümünde yayımlanacaktır.

## Yerelde çalıştırma

Python 3 kuruluysa proje klasöründe:

```powershell
python -m http.server 8000
```

Ardından `http://127.0.0.1:8000/` adresini açın.

## Teknolojiler

- HTML5
- CSS3
- Vanilla JavaScript
- sql.js / SQLite WebAssembly
- Chart.js
- Font Awesome
- GitHub Pages

## Yol haritası

- Electron masaüstü uygulaması
- Kalıcı yerel SQLite veritabanı
- Veritabanı yedekleme ve geri yükleme
- Windows kurulum dosyası
- GitHub Releases üzerinden sürüm dağıtımı
- Otomatik güncelleme

## Lisans

Bu proje [MIT Lisansı](LICENSE) ile sunulur.

