# Pembelajaran

## Masalah: Error Resolusi Path Alias `@/` pada Husky Pre-push Hook

Ketika melakukan `git push`, script pre-push Husky menjalankan perintah `pnpm exec tsc --noEmit -p tsconfig.json` di root direktori. Namun, root `tsconfig.json` sebelumnya tidak mendefinisikan path mappings untuk alias `@/*`.

Akibatnya, TypeScript compiler tidak dapat mengenali alias `@/` yang digunakan pada import statement di dalam sub-aplikasi (seperti `@fincore/worker`, `@fincore/api`, dan `@fincore/sender`), yang berujung pada 86 errors type-check (TS2307: Cannot find module).

## Solusi

Kita menambahkan konfigurasi `paths` ke dalam compilerOptions di root `tsconfig.json`:

```json
"baseUrl": ".",
"paths": {
  "@/*": [
    "apps/api/src/*",
    "apps/worker/src/*",
    "apps/sender/src/*"
  ]
}
```

Dengan konfigurasi ini:

1. Ketika type-check dijalankan dari root (`tsconfig.json`), TypeScript dapat secara berurutan mencari path yang diimpor menggunakan `@/` pada folder `src` masing-masing aplikasi.
2. Masing-masing sub-aplikasi (`apps/worker`, `apps/api`, `apps/sender`) tetap mempertahankan konfigurasi lokal mereka sendiri di `tsconfig.json` masing-masing untuk development dan build lokal yang terisolasi.
