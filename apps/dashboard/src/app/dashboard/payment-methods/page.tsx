"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Banknote,
  CreditCard,
  Pencil,
  Plus,
  Smartphone,
  Trash2,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const emojiOptions = [
  "💵",
  "💚",
  "💜",
  "🔵",
  "🟠",
  "🔴",
  "🏦",
  "💳",
  "💸",
  "📱",
  "🪙",
];

const typeOptions = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "e_wallet", label: "E-Wallet", icon: Smartphone },
  { value: "bank_transfer", label: "Bank Transfer", icon: Wallet },
  { value: "credit_card", label: "Kartu Kredit", icon: CreditCard },
  { value: "debit_card", label: "Kartu Debit", icon: CreditCard },
  { value: "qris", label: "QRIS", icon: Smartphone },
  { value: "other", label: "Lainnya", icon: Wallet },
];

interface PaymentMethod {
  id: string;
  name: string;
  icon: string | null;
  type: string;
  userId: string | null;
}

const typeLabels: Record<string, string> = {
  cash: "Cash",
  e_wallet: "E-Wallet",
  bank_transfer: "Bank",
  credit_card: "Kartu Kredit",
  debit_card: "Kartu Debit",
  qris: "QRIS",
  other: "Lainnya",
};

const typeGradients: Record<string, string> = {
  cash: "from-emerald-500/5 to-transparent",
  e_wallet: "from-violet-500/5 to-transparent",
  bank_transfer: "from-blue-500/5 to-transparent",
  credit_card: "from-orange-500/5 to-transparent",
  debit_card: "from-sky-500/5 to-transparent",
  qris: "from-rose-500/5 to-transparent",
  other: "from-slate-500/5 to-transparent",
};

export default function PaymentMethodsPage() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    id: "",
    name: "",
    type: "e_wallet",
    icon: "💵",
  });
  const [isEdit, setIsEdit] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<PaymentMethod | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Notification modal
  const notif = useModalNotif();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/payment-methods");
      const json = await res.json();
      setMethods(json.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = isEdit
        ? `/api/payment-methods/${form.id}`
        : "/api/payment-methods";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Gagal menyimpan metode pembayaran");
      toast.success(
        isEdit ? "Metode pembayaran diupdate" : "Metode pembayaran dibuat",
      );
      setOpen(false);
      setForm({ id: "", name: "", type: "e_wallet", icon: "💵" });
      setIsEdit(false);
      fetchData();
    } catch (err) {
      notif.show(
        "error",
        "Gagal menyimpan metode pembayaran",
        "Terjadi kesalahan saat menyimpan data metode pembayaran. Silakan coba lagi.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/payment-methods/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Gagal menghapus");
      toast.success("Metode pembayaran dihapus");
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      notif.show(
        "error",
        "Gagal menghapus metode pembayaran",
        "Terjadi kesalahan saat menghapus metode pembayaran. Silakan coba lagi.",
      );
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (method: PaymentMethod) => {
    setForm({
      id: method.id,
      name: method.name,
      type: method.type,
      icon: method.icon || "💵",
    });
    setIsEdit(true);
    setOpen(true);
  };

  const openNew = () => {
    setForm({ id: "", name: "", type: "e_wallet", icon: "💵" });
    setIsEdit(false);
    setOpen(true);
  };

  const grouped = methods.reduce(
    (acc, m) => {
      const key = m.type;
      if (!acc[key]) acc[key] = [];
      acc[key].push(m);
      return acc;
    },
    {} as Record<string, PaymentMethod[]>,
  );

  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Wallet className="h-6 w-6 text-blue-500" />
            Metode Pembayaran
          </h2>
          <p className="text-muted-foreground">Kelola metode pembayaran Anda</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button
                variant="default"
                size="sm"
                className="gap-1.5"
                onClick={openNew}
              />
            }
          >
            <Plus className="h-4 w-4" />
            <span>Tambah</span>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {isEdit ? "Edit Metode Pembayaran" : "Tambah Metode Baru"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nama</Label>
                <Input
                  placeholder="Contoh: GOPAY"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Tipe</Label>
                <Select
                  value={form.type}
                  onValueChange={(v: string | null) =>
                    setForm({ ...form, type: v || "e_wallet" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      labels={Object.fromEntries(
                        typeOptions.map((o) => [o.value, o.label]),
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ikon</Label>
                <div className="flex flex-wrap gap-2">
                  {emojiOptions.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setForm({ ...form, icon: emoji })}
                      className={`text-xl p-1.5 rounded-lg transition-all ${
                        form.icon === emoji
                          ? "bg-primary/10 ring-1 ring-primary scale-110"
                          : "hover:bg-accent hover:scale-105"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <Button type="submit" disabled={saving} className="w-full">
                {saving ? "Menyimpan..." : "Simpan"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Delete Confirmation Modal */}
      <ModalConfirm
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
        variant="danger"
        title="Hapus Metode Pembayaran?"
        description={`Metode "${deleteTarget?.name}" akan dihapus permanen.`}
        confirmLabel="Hapus"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Notification Modal */}
      {notif.modal}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(typeLabels).map(([type, label]) => {
            const items = grouped[type] || [];
            if (items.length === 0) return null;
            return (
              <Card
                key={type}
                className={`border overflow-hidden bg-gradient-to-br ${typeGradients[type] || "from-slate-500/5 to-transparent"}`}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                    {label}
                    <Badge variant="secondary" className="text-[10px] ml-2">
                      {items.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((method) => (
                      <div
                        key={method.id}
                        className="group flex items-center gap-3 rounded-xl border bg-background/60 p-3 hover:bg-background transition-colors"
                      >
                        <div className="shrink-0 rounded-lg bg-muted/50 p-2 text-xl">
                          {method.icon || "💵"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium truncate">
                            {method.name}
                          </span>
                          {!method.userId && (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-4 mt-0.5 ml-2 block w-fit"
                            >
                              Sistem
                            </Badge>
                          )}
                          {method.userId && (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-4 mt-0.5 ml-2 block w-fit border-emerald-500/30 text-emerald-600 bg-emerald-500/10"
                            >
                              Custom
                            </Badge>
                          )}
                        </div>
                        {method.userId && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                              onClick={() => openEdit(method)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteTarget(method)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
