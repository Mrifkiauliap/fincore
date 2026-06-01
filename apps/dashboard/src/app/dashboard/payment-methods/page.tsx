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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Banknote, CreditCard, Plus, Smartphone, Wallet } from "lucide-react";
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
  const [form, setForm] = useState({ name: "", type: "e_wallet", icon: "💵" });

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/payment-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Gagal membuat metode");
      toast.success("Metode pembayaran berhasil dibuat");
      setOpen(false);
      setForm({ name: "", type: "e_wallet", icon: "💵" });
      fetchData();
    } catch (err) {
      toast.error("Gagal membuat metode pembayaran");
    } finally {
      setSaving(false);
    }
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
            render={<Button variant="default" size="sm" className="gap-1.5" />}
          >
            <Plus className="h-4 w-4" />
            <span>Tambah</span>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tambah Metode Baru</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
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
                        className="flex items-center gap-3 rounded-xl border bg-background/60 p-3 hover:bg-background transition-colors"
                      >
                        <div className="shrink-0 rounded-lg bg-muted/50 p-2 text-xl">
                          {method.icon || "💵"}
                        </div>
                        <span className="text-sm font-medium truncate">
                          {method.name}
                        </span>
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
