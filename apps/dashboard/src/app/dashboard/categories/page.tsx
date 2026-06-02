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
import {
  ArrowRightLeft,
  Pencil,
  Plus,
  Tags,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const emojiOptions = [
  "🍔",
  "🚗",
  "🛍️",
  "💊",
  "🎮",
  "📄",
  "📚",
  "📈",
  "💆",
  "🏠",
  "📦",
  "💰",
  "💻",
  "🏪",
  "📊",
  "🎁",
  "🎀",
  "🏷️",
  "🔄",
  "📲",
  "🤝",
  "🤲",
  "💸",
];

interface Category {
  id: string;
  name: string;
  icon: string | null;
  type: "expense" | "income" | "transfer";
  isDefault: boolean;
  userId: string | null;
}

const typeConfig: Record<
  string,
  {
    label: string;
    icon: typeof TrendingDown;
    gradient: string;
    iconColor: string;
  }
> = {
  expense: {
    label: "Pengeluaran",
    icon: TrendingDown,
    gradient: "from-rose-500/5 to-transparent",
    iconColor: "text-rose-500",
  },
  income: {
    label: "Pemasukan",
    icon: TrendingUp,
    gradient: "from-emerald-500/5 to-transparent",
    iconColor: "text-emerald-500",
  },
  transfer: {
    label: "Transfer",
    icon: ArrowRightLeft,
    gradient: "from-blue-500/5 to-transparent",
    iconColor: "text-blue-500",
  },
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    id: "",
    name: "",
    type: "expense",
    icon: "📦",
  });
  const [isEdit, setIsEdit] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/categories");
      const json = await res.json();
      setCategories(json.data || []);
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
      const url = isEdit ? `/api/categories/${form.id}` : "/api/categories";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Gagal menyimpan kategori");
      toast.success(isEdit ? "Kategori diupdate" : "Kategori dibuat");
      setOpen(false);
      setForm({ id: "", name: "", type: "expense", icon: "📦" });
      setIsEdit(false);
      fetchData();
    } catch (err) {
      toast.error("Gagal menyimpan kategori");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Yakin hapus kategori custom ini?")) return;
    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Gagal menghapus");
      toast.success("Kategori dihapus");
      fetchData();
    } catch (err) {
      toast.error("Gagal menghapus kategori");
    }
  };

  const openEdit = (cat: Category) => {
    setForm({
      id: cat.id,
      name: cat.name,
      type: cat.type,
      icon: cat.icon || "📦",
    });
    setIsEdit(true);
    setOpen(true);
  };

  const openNew = () => {
    setForm({ id: "", name: "", type: "expense", icon: "📦" });
    setIsEdit(false);
    setOpen(true);
  };

  const grouped = categories.reduce(
    (acc, cat) => {
      const key = cat.type;
      if (!acc[key]) acc[key] = [];
      acc[key].push(cat);
      return acc;
    },
    {} as Record<string, Category[]>,
  );

  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Tags className="h-6 w-6 text-orange-500" />
            Kategori
          </h2>
          <p className="text-muted-foreground">Kelola kategori transaksi</p>
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
                {isEdit ? "Edit Kategori" : "Tambah Kategori Baru"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nama Kategori</Label>
                <Input
                  placeholder="Contoh: Jalan-jalan"
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
                    setForm({ ...form, type: (v || "expense") as string })
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      labels={{
                        expense: "💸 Pengeluaran",
                        income: "💰 Pemasukan",
                        transfer: "🔄 Transfer",
                      }}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">💸 Pengeluaran</SelectItem>
                    <SelectItem value="income">💰 Pemasukan</SelectItem>
                    <SelectItem value="transfer">🔄 Transfer</SelectItem>
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
        <div className="space-y-5">
          {(["expense", "income", "transfer"] as const).map((type) => {
            const cfg = typeConfig[type];
            const Icon = cfg.icon;
            const items = grouped[type] || [];

            return (
              <Card
                key={type}
                className={`border overflow-hidden bg-gradient-to-br ${cfg.gradient}`}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${cfg.iconColor}`} />
                    {cfg.label}
                    <Badge variant="secondary" className="text-[10px] ml-2">
                      {items.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      Belum ada kategori
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((cat) => (
                        <div
                          key={cat.id}
                          className="group flex items-center gap-3 rounded-xl border bg-background/60 p-3 hover:bg-background transition-colors"
                        >
                          <div className="shrink-0 rounded-lg bg-muted/50 p-2 text-xl">
                            {cat.icon || "📦"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {cat.name}
                            </p>
                            {cat.isDefault && (
                              <Badge
                                variant="outline"
                                className="text-[10px] h-4 mt-0.5"
                              >
                                Default
                              </Badge>
                            )}
                            {!cat.isDefault && !cat.userId && (
                              <Badge
                                variant="outline"
                                className="text-[10px] h-4 mt-0.5"
                              >
                                Sistem
                              </Badge>
                            )}
                            {cat.userId && (
                              <Badge
                                variant="outline"
                                className="text-[10px] h-4 mt-0.5 border-emerald-500/30 text-emerald-600 bg-emerald-500/10"
                              >
                                Custom
                              </Badge>
                            )}
                          </div>
                          {cat.userId && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                onClick={() => openEdit(cat)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                onClick={() => handleDelete(cat.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
