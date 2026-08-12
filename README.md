# ERP Sipariş Yönetimi

Türkçe ve açık kaynak sipariş yönetimi uygulaması. Sipariş, stok, sevkiyat, faturalama, iade ve raporlama süreçlerini tek ekranda yönetir. Web demosu ve kalıcı SQLite dosyası kullanan Windows masaüstü sürümü birlikte sunulur.

## Windows uygulaması

[En güncel Windows sürümünü GitHub Releases üzerinden indirin](https://github.com/AhmetKanyilmaz/erp-siparis/releases/latest)

- `ERP-Siparis-Setup-...exe`: Bilgisayara kurulan sürüm
- `ERP-Siparis-Portable-...exe`: Kurulum gerektirmeyen taşınabilir sürüm
- Windows x64 desteklenir.
- Paketler kod imzası içermediği için Windows ilk açılışta SmartScreen uyarısı gösterebilir.

## Canlı demo

[ERP Sipariş Yönetimi canlı demosunu açın](https://ahmetkanyilmaz.github.io/erp-siparis/)

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

## Masaüstü veritabanı

Masaüstü sürümü verileri standart bir `erp-siparis.sqlite` dosyasında saklar. Dosyanın tam konumuna uygulamadaki **Veritabanı > Veritabanı Konumunu Aç** menüsünden ulaşabilirsiniz.

- Veriler uygulama kapatılıp açıldığında korunur.
- Yazma işlemleri geçici dosya ve güvenlik yedeği kullanılarak tamamlanır.
- **Veritabanı > Yedek Al** ile `.sqlite` yedeği oluşturulabilir.
- **Veritabanı > Yedekten Geri Yükle** ile daha önce alınan yedek kullanılabilir.
- Veritabanı dosyası standart SQLite araçlarıyla açılabilir.

## Yerelde çalıştırma

Python 3 kuruluysa proje klasöründe:

```powershell
python -m http.server 8000
```

Ardından `http://127.0.0.1:8000/` adresini açın.

Masaüstü geliştirme sürümü için Node.js 22 veya üzeriyle:

```powershell
npm install
npm start
```

Windows paketlerini üretmek için:

```powershell
npm run dist:win
```

## Teknolojiler

- HTML5
- CSS3
- Vanilla JavaScript
- sql.js / SQLite WebAssembly
- Chart.js
- Font Awesome
- GitHub Pages
- Electron

## Yol haritası

- Otomatik güncelleme
- Kod imzalama

## Lisans

Bu proje [MIT Lisansı](LICENSE) ile sunulur.
