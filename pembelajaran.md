# Pembelajaran & Eksperimen FinCore

## 2026-05-26: Penanganan Eror Migrasi Enum PostgreSQL di Drizzle ORM

### Masalah

Saat menjalankan `pnpm run db:migrate`, proses gagal dengan eror berikut:

```
@fincore/db:db:migrate: error: type "message_type" already exists
```

Hal ini terjadi karena Drizzle secara default men-generate perintah `CREATE TYPE` langsung tanpa pengaman di file SQL migrasi (`0000_clammy_daimon_hellstrom.sql`). Jika tipe enum tersebut sudah terdaftar di database PostgreSQL (misalnya akibat sync skema sebelumnya atau manipulasi manual), PostgreSQL akan membatalkan seluruh transaksi migrasi.

### Analisis & Solusi

Untuk mengatasi kegagalan ini, setiap pendefinisian enum (`CREATE TYPE`) dibungkus menggunakan blok PL/pgSQL `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$;` di file migrasi SQL:

```sql
DO $$ BEGIN
 CREATE TYPE "public"."message_type" AS ENUM('text', 'voice', 'image', 'document', 'video');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
```

Cara ini secara aman menangkap eksepsi `duplicate_object` jika tipe tersebut telah didefinisikan sebelumnya, sehingga migrasi dapat dilanjutkan ke pembuatan tabel, indeks, dan relasi kunci asing tanpa kegagalan.

### Hasil

Setelah pembaruan file migrasi, perintah `pnpm run db:migrate` berhasil dijalankan dan seluruh perubahan skema sukses diterapkan ke database.

## 2026-05-27: Implementasi AI Query Parser untuk Sistem Laporan Keuangan

### Masalah

Bagaimana menyediakan query laporan yang fleksibel (cek pengeluaran bulanan, pemasukan terbesar, per kategori, per metode pembayaran, dll.) menggunakan pesan natural language WhatsApp tanpa mengharuskan user mengetik command sintaks kaku.

### Analisis & Solusi

1. **AI-driven Query Parser**: Menggunakan model `gemini-2.0-flash-lite` dengan format output JSON (`response_format: { type: "json_object" }`) dan system prompt (`QUERY_PARSER_PROMPT`). AI bertugas mendeteksi:
   - Periode waktu (`today`, `this_week`, `this_month`, dll).
   - Tipe transaksi (`expense`, `income`, `transfer`).
   - Jenis laporan (`summary`, `balance`, `top_expenses`, `top_income`, `by_category`, `by_payment_method`, `by_merchant`).
   - Filter spesifik (nama payment method, merchant, atau kategori) jika disebutkan.
2. **Dynamic SQL Builder**: Hasil parsing AI dimasukkan ke query builder Drizzle ORM dengan filter dinamis dan grouping yang sesuai dengan jenis laporan yang diminta.
3. **Format Reply Bersih**: Menghasilkan respon WhatsApp dengan format teks yang rapi dan meminimalkan penggunaan emoji berlebihan sesuai preferensi user.

### Hasil

Sistem laporan kini sangat responsif dan adaptif. User bisa mengirim pesan seperti:

- "pemasukan terbesar bulan ini" -> AI memetakan `report_type = "top_income"` dan menghasilkan daftar 5 pemasukan teratas lengkap dengan sumber dan tanggal.
- "rekap pengeluaran minggu lalu" -> AI memetakan `report_type = "summary"`, memfilter pengeluaran saja, dan menampilkan total serta riwayat singkat.
