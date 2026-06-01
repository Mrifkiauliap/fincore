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
import dayjs from "dayjs";
import {
  AlertCircle,
  Banknote,
  CalendarClock,
  Clock,
  Plus,
  Repeat,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface RecurringBill {
  id: string;
  name: string;
  amount: string | null;
  frequency: string;
  dayOfMonth: number | null;
  nextReminderAt: string;
  isActive: boolean;
  category: { name: string; icon: string } | null;
  paymentMethod: { name: string; icon: string } | null;
  notes: string | null;
}

const frequencyLabels: Record<string, string> = {
  DAILY: "Harian",
  WEEKLY: "Mingguan",
  MONTHLY: "Bulanan",
  YEARLY: "Tahunan",
};

const frequencyBadge: Record<
  string,
  { variant: "default" | "outline" | "secondary"; color: string }
> = {
  DAILY: { variant: "default", color: "bg-blue-500 hover:bg-blue-500" },
  WEEKLY: { variant: "secondary", color: "" },
  MONTHLY: { variant: "outline", color: "" },
  YEARLY: { variant: "outline", color: "" },
};

export default function RecurringBillsPage() {
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    amount: "",
    frequency: "MONTHLY",
    dayOfMonth: "1",
    nextReminderAt: dayjs().add(1, "month").date(1).format("YYYY-MM-DD"),
    notes: "",
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/recurring-bills");
      const json = await res.json();
      setBills(json.data || []);
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
      const res = await fetch("/api/recurring-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          amount: form.amount || null,
          frequency: form.frequency,
          dayOfMonth: parseInt(form.dayOfMonth),
          nextReminderAt: form.nextReminderAt,
          notes: form.notes || null,
        }),
      });
      if (!res.ok) throw new Error("Gagal membuat tagihan");
      toast.success("Tagihan berkala berhasil dibuat");
      setOpen(false);
      setForm({
        name: "",
        amount: "",
        frequency: "MONTHLY",
        dayOfMonth: "1",
        nextReminderAt: dayjs().add(1, "month").date(1).format("YYYY-MM-DD"),
        notes: "",
      });
      fetchData();
    } catch (err) {
      toast.error("Gagal membuat tagihan berkala");
    } finally {
      setSaving(false);
    }
  };

  const isOverdue = (date: string) => {
    return dayjs(date).isBefore(dayjs(), "day");
  };

  const getDaysUntil = (date: string) => {
    const now = dayjs();
    const target = dayjs(date);
    const diff = target.diff(now, "day");
    if (diff < 0) return "Terlambat";
    if (diff === 0) return "Hari ini";
    if (diff === 1) return "Besok";
    return `${diff} hari lagi`;
  };

  const upcomingBills = bills.filter(
    (b) => !isOverdue(b.nextReminderAt),
  ).length;
  const overdueBills = bills.filter((b) => isOverdue(b.nextReminderAt)).length;
  const totalAmount = bills.reduce(
    (sum, b) => sum + parseFloat(b.amount || "0"),
    0,
  );

  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Repeat className="h-6 w-6 text-blue-500" />
            Tagihan Berkala
          </h2>
          <p className="text-muted-foreground">
            Pantau tagihan rutin dan pengingat jatuh tempo
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
              <DialogTitle>Tambah Tagihan Berkala</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Nama Tagihan</Label>
                <Input
                  placeholder="Contoh: Tagihan Listrik"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Jumlah (Rp)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={form.amount}
                    onChange={(e) =>
                      setForm({ ...form, amount: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Frekuensi</Label>
                  <Select
                    value={form.frequency}
                    onValueChange={(v: string | null) =>
                      setForm({ ...form, frequency: v || "MONTHLY" })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue
                        labels={{
                          MONTHLY: "Bulanan",
                          WEEKLY: "Mingguan",
                          YEARLY: "Tahunan",
                          DAILY: "Harian",
                        }}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MONTHLY">Bulanan</SelectItem>
                      <SelectItem value="WEEKLY">Mingguan</SelectItem>
                      <SelectItem value="YEARLY">Tahunan</SelectItem>
                      <SelectItem value="DAILY">Harian</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tanggal (1-31)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={form.dayOfMonth}
                    onChange={(e) =>
                      setForm({ ...form, dayOfMonth: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pengingat Berikutnya</Label>
                  <Input
                    type="date"
                    value={form.nextReminderAt}
                    onChange={(e) =>
                      setForm({ ...form, nextReminderAt: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
              <Button type="submit" disabled={saving} className="w-full">
                {saving ? "Menyimpan..." : "Simpan"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Quick Stats */}
      {!loading && bills.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="border bg-gradient-to-br from-blue-500/5 to-transparent">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-xl p-2 bg-blue-500/10">
                <Repeat className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{upcomingBills}</p>
                <p className="text-xs text-muted-foreground">Tagihan aktif</p>
              </div>
            </CardContent>
          </Card>
          <Card
            className={`border ${overdueBills > 0 ? "bg-gradient-to-br from-red-500/5 to-transparent" : "bg-gradient-to-br from-emerald-500/5 to-transparent"}`}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div
                className={`rounded-xl p-2 ${overdueBills > 0 ? "bg-red-500/10" : "bg-emerald-500/10"}`}
              >
                <AlertCircle
                  className={`h-4 w-4 ${overdueBills > 0 ? "text-red-500" : "text-emerald-500"}`}
                />
              </div>
              <div>
                <p
                  className={`text-2xl font-bold ${overdueBills > 0 ? "text-red-500" : "text-emerald-500"}`}
                >
                  {overdueBills}
                </p>
                <p className="text-xs text-muted-foreground">Terlambat</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border bg-gradient-to-br from-violet-500/5 to-transparent">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-xl p-2 bg-violet-500/10">
                <Banknote className="h-4 w-4 text-violet-500" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  {formatCurrency(totalAmount, "IDR")}
                </p>
                <p className="text-xs text-muted-foreground">Total tagihan</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : bills.length === 0 ? (
        <Card className="border">
          <CardContent className="py-16 text-center text-muted-foreground">
            <Repeat className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">Belum ada tagihan berkala</p>
            <p className="text-sm max-w-sm mx-auto mt-1">
              Tambahkan tagihan rutin untuk mendapatkan pengingat otomatis
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {bills.map((bill) => {
            const overdue = isOverdue(bill.nextReminderAt);
            const daysUntil = getDaysUntil(bill.nextReminderAt);
            const fb = frequencyBadge[bill.frequency] || {
              variant: "outline" as const,
              color: "",
            };

            return (
              <Card
                key={bill.id}
                className={`border overflow-hidden transition-all hover:shadow-sm ${
                  overdue
                    ? "ring-1 ring-destructive/20 bg-destructive/[0.02]"
                    : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-semibold truncate text-base">
                          {bill.name}
                        </span>
                        <Badge
                          variant={fb.variant}
                          className={`text-[10px] ${fb.color}`}
                        >
                          {frequencyLabels[bill.frequency] || bill.frequency}
                        </Badge>
                        {overdue && (
                          <Badge
                            variant="destructive"
                            className="text-[10px] gap-1"
                          >
                            <AlertCircle className="h-3 w-3" />
                            Terlambat
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        {bill.amount && (
                          <span className="font-semibold text-foreground">
                            {formatCurrency(bill.amount, "IDR")}
                          </span>
                        )}
                        {bill.category && (
                          <span className="flex items-center gap-1">
                            {bill.category.icon} {bill.category.name}
                          </span>
                        )}
                        {bill.paymentMethod && (
                          <span className="flex items-center gap-1">
                            {bill.paymentMethod.icon} {bill.paymentMethod.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className={`flex items-center gap-1.5 text-sm font-medium ${
                          overdue ? "text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        {overdue ? (
                          <AlertCircle className="h-4 w-4" />
                        ) : (
                          <CalendarClock className="h-4 w-4" />
                        )}
                        <span>
                          {dayjs(bill.nextReminderAt).format("DD/MM/YYYY")}
                        </span>
                      </div>
                      <p
                        className={`text-xs mt-1 flex items-center gap-1 justify-end ${
                          overdue
                            ? "text-destructive font-medium"
                            : "text-muted-foreground"
                        }`}
                      >
                        <Clock className="h-3 w-3" />
                        {daysUntil}
                      </p>
                      {bill.dayOfMonth && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Jatuh tempo tgl {bill.dayOfMonth}
                        </p>
                      )}
                    </div>
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
