"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { formatCurrency } from "@fincore/utils";
import {
  AlertTriangle,
  CheckCircle2,
  PiggyBank,
  Plus,
  Target,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  icon: string;
  type: string;
}

interface Budget {
  id: string;
  categoryId: string;
  category: Category | null;
  amount: string;
  month: number;
  year: number;
  spent: number;
  percentage: number;
  status: "safe" | "warning" | "over";
}

const monthLabels = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [filterMonth, setFilterMonth] = useState(
    () => new Date().getMonth() + 1,
  );
  const [filterYear, setFilterYear] = useState(() => new Date().getFullYear());

  const [form, setForm] = useState({
    categoryId: "",
    amount: "",
    notes: "",
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("month", String(filterMonth));
      params.set("year", String(filterYear));

      const res = await fetch(`/api/budgets?${params}`);
      const json = await res.json();
      setBudgets(json.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filterMonth, filterYear]);

  useEffect(() => {
    fetch("/api/categories?type=expense")
      .then((r) => r.json())
      .then((json) => setCategories(json.data || []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: form.categoryId,
          amount: form.amount,
          month: filterMonth,
          year: filterYear,
          notes: form.notes,
        }),
      });
      if (!res.ok) throw new Error("Gagal membuat budget");
      toast.success("Budget berhasil dibuat");
      setOpen(false);
      setForm({ categoryId: "", amount: "", notes: "" });
      fetchData();
    } catch (err) {
      toast.error("Gagal membuat budget");
    } finally {
      setSaving(false);
    }
  };

  const totalBudget = budgets.reduce((s, b) => s + parseFloat(b.amount), 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const overallPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Target className="h-6 w-6 text-orange-500" />
            Budget
          </h2>
          <p className="text-muted-foreground">
            Pantau anggaran bulanan per kategori
          </p>
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
              <DialogTitle>Tambah Budget Baru</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Kategori</Label>
                <Select
                  value={form.categoryId || undefined}
                  onValueChange={(v: string | null) =>
                    setForm({ ...form, categoryId: v || "" })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue
                      labels={Object.fromEntries(
                        categories.map((c) => [c.id, `${c.icon} ${c.name}`]),
                      )}
                      placeholder="Pilih kategori"
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Jumlah Budget (Rp)</Label>
                <Input
                  type="number"
                  placeholder="Contoh: 1000000"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                />
              </div>
              <Button type="submit" disabled={saving} className="w-full">
                {saving ? "Menyimpan..." : "Simpan"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Month/Year selector */}
      <div className="flex gap-3 items-center">
        <Select
          value={String(filterMonth)}
          onValueChange={(v: string | null) =>
            setFilterMonth(parseInt(v || "1"))
          }
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthLabels.map((label, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(filterYear)}
          onValueChange={(v: string | null) =>
            setFilterYear(parseInt(v || "2024"))
          }
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[2024, 2025, 2026, 2027].map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!loading && budgets.length > 0 && (
          <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              Total:{" "}
              <span className="font-semibold text-foreground">
                {formatCurrency(totalSpent, "IDR")}
              </span>{" "}
              / {formatCurrency(totalBudget, "IDR")}
            </span>
            <Badge
              variant={
                overallPct > 100
                  ? "destructive"
                  : overallPct > 80
                    ? "default"
                    : "outline"
              }
              className="text-xs"
            >
              {overallPct.toFixed(0)}%
            </Badge>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : budgets.length === 0 ? (
        <Card className="border">
          <CardContent className="py-16 text-center text-muted-foreground">
            <PiggyBank className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">
              Belum ada budget untuk bulan ini
            </p>
            <p className="text-sm max-w-sm mx-auto mt-1">
              Tambahkan budget untuk mulai memantau pengeluaran dan mengontrol
              keuangan dengan lebih baik
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {budgets.map((budget) => {
            const isOver = budget.status === "over";
            const isWarn = budget.status === "warning";
            const isSafe = budget.status === "safe";
            const amountNum = parseFloat(budget.amount);

            return (
              <Card
                key={budget.id}
                className={`border overflow-hidden transition-all hover:shadow-sm ${
                  isOver
                    ? "ring-1 ring-destructive/20"
                    : isWarn
                      ? "ring-1 ring-yellow-500/20"
                      : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`shrink-0 rounded-xl p-2.5 ${
                          isOver
                            ? "bg-destructive/10"
                            : isWarn
                              ? "bg-yellow-500/10"
                              : "bg-emerald-500/10"
                        }`}
                      >
                        <span className="text-xl">
                          {budget.category?.icon || "📦"}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold">
                          {budget.category?.name || "Kategori"}
                        </p>
                        <div className="flex items-center gap-2">
                          {isOver && (
                            <Badge
                              variant="destructive"
                              className="text-[10px] gap-1"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              Over Budget
                            </Badge>
                          )}
                          {isWarn && (
                            <Badge className="text-[10px] gap-1 bg-yellow-500 hover:bg-yellow-500">
                              <TrendingUp className="h-3 w-3" />
                              Hampir Penuh
                            </Badge>
                          )}
                          {isSafe && budget.spent > 0 && (
                            <Badge
                              variant="outline"
                              className="text-[10px] gap-1 text-emerald-500 border-emerald-500/50"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Aman
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatCurrency(budget.spent, "IDR")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        dari {formatCurrency(amountNum, "IDR")}
                      </p>
                    </div>
                  </div>

                  {/* Progress bar with markers */}
                  <div className="relative">
                    <div className="h-3 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isOver
                            ? "bg-gradient-to-r from-red-500 to-rose-500"
                            : isWarn
                              ? "bg-gradient-to-r from-yellow-400 to-amber-500"
                              : "bg-gradient-to-r from-emerald-400 to-teal-500"
                        }`}
                        style={{
                          width: `${Math.min(budget.percentage, 100)}%`,
                        }}
                      />
                    </div>
                    {/* 80% marker */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-background"
                      style={{ left: "80%" }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p
                      className={`text-xs font-medium ${
                        isOver
                          ? "text-destructive"
                          : isWarn
                            ? "text-yellow-500"
                            : "text-emerald-500"
                      }`}
                    >
                      {budget.percentage.toFixed(0)}% terpakai
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sisa{" "}
                      {formatCurrency(
                        Math.max(amountNum - budget.spent, 0),
                        "IDR",
                      )}
                    </p>
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
