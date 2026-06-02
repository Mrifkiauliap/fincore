"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModalConfirm } from "@/components/ui/modal-confirm";
import { useModalNotif } from "@/components/ui/modal-notif";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagsInput } from "@/components/ui/tags-input";
import { Textarea } from "@/components/ui/textarea";
import dayjs from "dayjs";
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  icon: string;
  type: string;
}

interface PaymentMethod {
  id: string;
  name: string;
  icon: string;
  type: string;
}

const typeOptions = [
  { value: "expense", label: "💸 Pengeluaran" },
  { value: "income", label: "💰 Pemasukan" },
  { value: "transfer", label: "🔄 Transfer" },
];

export default function TransactionFormPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const isEdit = params?.id && params.id !== "new";

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  // Delete confirmation state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Notification modal
  const notif = useModalNotif();

  const [form, setForm] = useState({
    name: "",
    type: "expense" as string,
    amount: "",
    fee: "0",
    currency: "IDR",
    categoryId: "",
    paymentMethodId: "",
    toPaymentMethodId: "",
    merchant: "",
    location: "",
    notes: "",
    transactionDate: dayjs().format("YYYY-MM-DD"),
    isConfirmed: true,
    tags: [] as string[],
  });

  // Build label maps so SelectValue shows display names, not raw IDs
  const categoryLabels = useMemo(() => {
    const map: Record<string, string> = { none: "Tanpa Kategori" };
    categories.forEach((c) => {
      map[c.id] = `${c.icon} ${c.name}`;
    });
    return map;
  }, [categories]);

  const paymentLabels = useMemo(() => {
    const map: Record<string, string> = { none: "Tanpa Metode" };
    paymentMethods.forEach((p) => {
      map[p.id] = `${p.icon} ${p.name}`;
    });
    return map;
  }, [paymentMethods]);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((json) => setCategories(json.data || []))
      .catch(console.error);

    fetch("/api/payment-methods")
      .then((r) => r.json())
      .then((json) => setPaymentMethods(json.data || []))
      .catch(console.error);

    if (isEdit) {
      fetch(`/api/transactions/${params.id}`)
        .then((r) => r.json())
        .then((json) => {
          const tx = json.data;
          setForm({
            name: tx.name,
            type: tx.type,
            amount: tx.amount,
            fee: tx.fee || "0",
            currency: tx.currency || "IDR",
            categoryId: tx.categoryId || "",
            paymentMethodId: tx.paymentMethodId || "",
            toPaymentMethodId: tx.toPaymentMethodId || "",
            merchant: tx.merchant || "",
            location: tx.location || "",
            notes: tx.notes || "",
            transactionDate: dayjs(tx.transactionDate).format("YYYY-MM-DD"),
            isConfirmed: tx.isConfirmed,
            tags: tx.tags ? tx.tags.map((t: any) => t.tag.name) : [],
          });
        })
        .catch(console.error);
    }
  }, [isEdit, params?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const url = isEdit
        ? `/api/transactions/${params.id}`
        : "/api/transactions";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          fee: parseFloat(form.fee) || 0,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menyimpan");
      }

      toast.success(
        isEdit ? "Transaksi berhasil diupdate" : "Transaksi berhasil dibuat",
      );
      router.push("/dashboard/transactions");
      router.refresh();
    } catch (err) {
      notif.show(
        "error",
        "Gagal menyimpan transaksi",
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan. Silakan coba lagi.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/transactions/${params.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Gagal menghapus");
      toast.success("Transaksi dihapus");
      router.push("/dashboard/transactions");
      router.refresh();
    } catch (err) {
      notif.show(
        "error",
        "Gagal menghapus transaksi",
        "Terjadi kesalahan saat menghapus transaksi. Silakan coba lagi.",
      );
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const filteredCategories = categories.filter((c) => c.type === form.type);

  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/transactions"
          className="inline-flex shrink-0 items-center justify-center rounded-lg border bg-background hover:bg-muted size-8"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {isEdit ? "Edit Transaksi" : "Tambah Transaksi"}
          </h2>
          <p className="text-muted-foreground">
            {isEdit ? "Ubah detail transaksi" : "Catat transaksi keuangan baru"}
          </p>
        </div>
        <div className="flex-1" />
        {isEdit && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">Hapus</span>
          </Button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border">
          <CardHeader>
            <CardTitle className="text-base">Informasi Transaksi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Tipe Transaksi</Label>
              <div className="flex gap-2">
                {typeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm({ ...form, type: opt.value })}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      form.type === opt.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nama Transaksi *</Label>
              <Input
                id="name"
                placeholder="Contoh: Belanja Bulanan"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Jumlah *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fee">Biaya Admin</Label>
                <Input
                  id="fee"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={form.fee}
                  onChange={(e) => setForm({ ...form, fee: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Tanggal Transaksi</Label>
              <Input
                id="date"
                type="date"
                value={form.transactionDate}
                onChange={(e) =>
                  setForm({ ...form, transactionDate: e.target.value })
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border">
          <CardHeader>
            <CardTitle className="text-base">Kategori & Metode</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Kategori</Label>
              <Select
                value={form.categoryId || "none"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    categoryId: v === "none" ? "" : (v ?? ""),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue labels={categoryLabels} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa Kategori</SelectItem>
                  {filteredCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.icon} {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Metode Pembayaran</Label>
              <Select
                value={form.paymentMethodId || "none"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    paymentMethodId: v === "none" ? "" : (v ?? ""),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue labels={paymentLabels} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa Metode</SelectItem>
                  {paymentMethods.map((pm) => (
                    <SelectItem key={pm.id} value={pm.id}>
                      {pm.icon} {pm.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.type === "transfer" && (
              <div className="space-y-2">
                <Label>Tujuan Transfer</Label>
                <Select
                  value={form.toPaymentMethodId || "none"}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      toPaymentMethodId: v === "none" ? "" : (v ?? ""),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue labels={paymentLabels} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tanpa Tujuan</SelectItem>
                    {paymentMethods.map((pm) => (
                      <SelectItem key={pm.id} value={pm.id}>
                        {pm.icon} {pm.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border">
          <CardHeader>
            <CardTitle className="text-base">Detail Tambahan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Tags</Label>
              <TagsInput
                value={form.tags}
                onChange={(tags) => setForm({ ...form, tags })}
                placeholder="Contoh: Belanja, Makanan"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="merchant">Merchant / Toko</Label>
              <Input
                id="merchant"
                placeholder="Contoh: Alfamart"
                value={form.merchant}
                onChange={(e) => setForm({ ...form, merchant: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Lokasi</Label>
              <Input
                id="location"
                placeholder="Contoh: Jakarta"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Catatan</Label>
              <Textarea
                id="notes"
                placeholder="Catatan tambahan..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Link
            href="/dashboard/transactions"
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-background hover:bg-muted text-sm font-medium whitespace-nowrap transition-all h-8 px-2.5"
          >
            Batal
          </Link>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isEdit ? "Update" : "Simpan"}
          </Button>
        </div>
      </form>

      {/* Delete Confirmation Modal */}
      <ModalConfirm
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        variant="danger"
        title="Hapus Transaksi?"
        description="Transaksi yang dihapus tidak dapat dikembalikan. Tindakan ini permanen."
        confirmLabel="Hapus"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />

      {/* Notification Modal */}
      {notif.modal}
    </div>
  );
}
