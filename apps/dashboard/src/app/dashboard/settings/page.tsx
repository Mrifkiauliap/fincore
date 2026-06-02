"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import {
  Check,
  Clock,
  Globe,
  Laptop,
  LogOut,
  Moon,
  Pencil,
  Phone,
  RefreshCw,
  Smartphone,
  User,
  Wallet,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────
type UserProfile = {
  id: string;
  name: string | null;
  phone: string;
  timezone: string | null;
  preferredCurrency: string | null;
  reportSchedule: string | null;
  reportTime: string | null;
  onboardedAt: string | null;
  createdAt: string;
  isActive: boolean;
};

type SessionEntry = {
  id: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
  label: string;
};

// ─── Timezone options ────────────────────────────────────────────────
const TIMEZONE_OPTIONS = [
  { value: "Asia/Jakarta", label: "WIB — Jakarta (GMT+7)" },
  { value: "Asia/Makassar", label: "WITA — Makassar (GMT+8)" },
  { value: "Asia/Jayapura", label: "WIT — Jayapura (GMT+9)" },
  { value: "UTC", label: "UTC" },
];

const CURRENCY_OPTIONS = [
  "IDR",
  "USD",
  "SGD",
  "MYR",
  "EUR",
  "GBP",
  "JPY",
  "AUD",
];

const REPORT_SCHEDULE_OPTIONS = [
  { value: "daily", label: "Harian" },
  { value: "weekly", label: "Mingguan" },
  { value: "monthly", label: "Bulanan" },
  { value: "off", label: "Tidak Aktif" },
];

// ─── Inline editable field ───────────────────────────────────────────
function EditableField({
  label,
  value,
  displayValue,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  saving,
  children,
  icon: Icon,
}: {
  label: string;
  value: string;
  displayValue?: string;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  children: React.ReactNode;
  icon?: React.ElementType;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 group">
      <div className="flex items-center gap-2 min-w-0">
        {Icon && (
          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <p className="text-sm text-muted-foreground shrink-0">{label}</p>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        {isEditing ? (
          <>
            <div className="flex items-center gap-1.5">{children}</div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-emerald-500 hover:text-emerald-600"
              onClick={onSave}
              disabled={saving}
            >
              {saving ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={onCancel}
              disabled={saving}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <>
            <span className="font-medium text-sm truncate max-w-[200px]">
              {displayValue ?? value}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={onEdit}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────
export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Editing state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form values
  const [editName, setEditName] = useState("");
  const [editTimezone, setEditTimezone] = useState("");
  const [editCurrency, setEditCurrency] = useState("");
  const [editSchedule, setEditSchedule] = useState("");
  const [editTime, setEditTime] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch profile
      const profileRes = await fetch("/api/settings", { method: "GET" });
      if (profileRes.ok) {
        const json = await profileRes.json();
        setProfile(json.data);
      }

      // Fetch sessions
      const sessionRes = await fetch("/api/sessions");
      if (sessionRes.ok) {
        const json = await sessionRes.json();
        setSessions(json.data);
      }
    } catch (err) {
      console.error("Failed to load settings", err);
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (field: string) => {
    if (!profile) return;
    setEditingField(field);
    switch (field) {
      case "name":
        setEditName(profile.name ?? "");
        break;
      case "timezone":
        setEditTimezone(profile.timezone ?? "Asia/Jakarta");
        break;
      case "preferredCurrency":
        setEditCurrency(profile.preferredCurrency ?? "IDR");
        break;
      case "reportSchedule":
        setEditSchedule(profile.reportSchedule ?? "monthly");
        break;
      case "reportTime":
        setEditTime(profile.reportTime ?? "07:00");
        break;
    }
  };

  const cancelEditing = () => {
    setEditingField(null);
  };

  const saveField = async (field: string) => {
    if (!profile) return;
    setSaving(true);
    try {
      let body: Record<string, string> = {};
      switch (field) {
        case "name":
          body = { name: editName };
          break;
        case "timezone":
          body = { timezone: editTimezone };
          break;
        case "preferredCurrency":
          body = { preferredCurrency: editCurrency };
          break;
        case "reportSchedule":
          body = { reportSchedule: editSchedule };
          break;
        case "reportTime":
          body = { reportTime: editTime };
          break;
      }

      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Gagal menyimpan");
      }

      const json = await res.json();
      setProfile((prev) => (prev ? { ...prev, ...json.data } : prev));
      setEditingField(null);
      toast.success("Pengaturan disimpan");
    } catch (err: any) {
      toast.error(err.message ?? "Gagal menyimpan pengaturan");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOutSession = async (sessionId: string) => {
    try {
      const res = await fetch("/api/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Gagal menghapus sesi");
      }

      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      toast.success("Sesi berhasil dikeluarkan");
    } catch (err: any) {
      toast.error(err.message ?? "Gagal menghapus sesi");
    }
  };

  const formatSessionDate = (dateStr: string) => {
    const d = dayjs(dateStr);
    const now = dayjs();
    const diffHours = now.diff(d, "hour");

    if (diffHours < 1) return "Baru saja";
    if (diffHours < 24) return `${diffHours} jam lalu`;
    if (diffHours < 48) return "Kemarin";
    return d.format("DD MMM YYYY HH:mm");
  };

  const scheduleLabel =
    REPORT_SCHEDULE_OPTIONS.find(
      (o) => o.value === (profile?.reportSchedule ?? "monthly"),
    )?.label ?? "Bulanan";

  const tzLabel =
    TIMEZONE_OPTIONS.find(
      (o) => o.value === (profile?.timezone ?? "Asia/Jakarta"),
    )?.label ??
    profile?.timezone ??
    "Asia/Jakarta";

  if (loading) {
    return (
      <div className="flex-1 space-y-6 p-6 lg:p-8 max-w-2xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex-1 p-6 lg:p-8 max-w-2xl text-center text-muted-foreground">
        <p>Gagal memuat data pengaturan.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Pengaturan</h2>
        <p className="text-muted-foreground">
          Kelola profil, preferensi, dan sesi aktif
        </p>
      </div>

      {/* Profile */}
      <Card className="border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Profil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {/* Name — editable */}
          <EditableField
            label="Nama"
            value={profile.name ?? "—"}
            isEditing={editingField === "name"}
            onEdit={() => startEditing("name")}
            onCancel={cancelEditing}
            onSave={() => saveField("name")}
            saving={saving}
            icon={User}
          >
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-8 w-[180px] text-sm"
              placeholder="Nama Anda"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && saveField("name")}
            />
          </EditableField>

          {/* Phone — read only */}
          <div className="flex items-center justify-between gap-3 py-1.5">
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nomor WA</p>
            </div>
            <span className="font-medium text-sm tabular-nums">
              {profile.phone}
            </span>
          </div>

          {/* Timezone — editable */}
          <EditableField
            label="Zona Waktu"
            value={profile.timezone ?? "Asia/Jakarta"}
            displayValue={tzLabel}
            isEditing={editingField === "timezone"}
            onEdit={() => startEditing("timezone")}
            onCancel={cancelEditing}
            onSave={() => saveField("timezone")}
            saving={saving}
            icon={Globe}
          >
            <Select
              value={editTimezone}
              onValueChange={(val) => val && setEditTimezone(val)}
            >
              <SelectTrigger className="h-8 w-[240px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONE_OPTIONS.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </EditableField>

          {/* Currency — editable */}
          <EditableField
            label="Mata Uang"
            value={profile.preferredCurrency ?? "IDR"}
            isEditing={editingField === "preferredCurrency"}
            onEdit={() => startEditing("preferredCurrency")}
            onCancel={cancelEditing}
            onSave={() => saveField("preferredCurrency")}
            saving={saving}
            icon={Wallet}
          >
            <Select
              value={editCurrency}
              onValueChange={(val) => val && setEditCurrency(val)}
            >
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_OPTIONS.map((cur) => (
                  <SelectItem key={cur} value={cur}>
                    {cur}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </EditableField>
        </CardContent>
      </Card>

      {/* Report Preferences */}
      <Card className="border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Preferensi Laporan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {/* Schedule — editable */}
          <EditableField
            label="Jadwal Laporan"
            value={profile.reportSchedule ?? "monthly"}
            displayValue={scheduleLabel}
            isEditing={editingField === "reportSchedule"}
            onEdit={() => startEditing("reportSchedule")}
            onCancel={cancelEditing}
            onSave={() => saveField("reportSchedule")}
            saving={saving}
            icon={Clock}
          >
            <Select
              value={editSchedule}
              onValueChange={(val) => val && setEditSchedule(val)}
            >
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue
                  labels={{
                    daily: "Harian",
                    weekly: "Mingguan",
                    monthly: "Bulanan",
                    off: "Tidak Aktif",
                  }}
                />
              </SelectTrigger>
              <SelectContent>
                {REPORT_SCHEDULE_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </EditableField>

          {/* Time — editable */}
          <EditableField
            label="Waktu Kirim"
            value={profile.reportTime ?? "07:00"}
            isEditing={editingField === "reportTime"}
            onEdit={() => startEditing("reportTime")}
            onCancel={cancelEditing}
            onSave={() => saveField("reportTime")}
            saving={saving}
            icon={Moon}
          >
            <Input
              type="time"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
              className="h-8 w-[130px] text-sm"
              onKeyDown={(e) => e.key === "Enter" && saveField("reportTime")}
            />
          </EditableField>
        </CardContent>
      </Card>

      {/* Active Sessions */}
      <Card className="border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Laptop className="h-4 w-4 text-primary" />
            Sesi Aktif
            <Badge variant="secondary" className="ml-1 text-[10px] h-5">
              {sessions.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Tidak ada sesi aktif
            </p>
          ) : (
            <div className="space-y-1">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors",
                    session.isCurrent
                      ? "bg-primary/5 border border-primary/20"
                      : "hover:bg-muted/50",
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        "size-8 rounded-full flex items-center justify-center shrink-0",
                        session.isCurrent
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Smartphone className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {session.label}
                        </span>
                        {session.isCurrent && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-4 px-1 text-emerald-500 border-emerald-500/30 bg-emerald-500/5 shrink-0"
                          >
                            Aktif
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Login {formatSessionDate(session.createdAt)}
                        {session.expiresAt &&
                          ` · Kadaluarsa ${dayjs(session.expiresAt).format("DD MMM YYYY")}`}
                      </p>
                    </div>
                  </div>

                  {!session.isCurrent && (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => handleSignOutSession(session.id)}
                          />
                        }
                      >
                        <LogOut className="h-3.5 w-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>Keluarkan sesi ini</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              ))}
            </div>
          )}

          <Separator className="my-3" />

          <Button
            variant="outline"
            size="sm"
            className="w-full text-destructive hover:bg-destructive/5 hover:text-destructive gap-2"
            onClick={() => router.push("/logout")}
          >
            <LogOut className="h-4 w-4" />
            Keluar dari Semua Sesi
          </Button>
        </CardContent>
      </Card>

      {/* Account Activity */}
      <Card className="border">
        <CardHeader>
          <CardTitle className="text-base">Aktivitas Akun</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Bergabung Sejak</p>
              <p className="font-medium">
                {profile.onboardedAt
                  ? dayjs(profile.onboardedAt).format("DD MMMM YYYY")
                  : dayjs(profile.createdAt).format("DD MMMM YYYY")}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant={profile.isActive ? "default" : "destructive"}>
                {profile.isActive ? "Aktif" : "Nonaktif"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        FinCore Dashboard v0.1.0 · Pengaturan juga dapat diubah melalui Bot
        WhatsApp
      </p>
    </div>
  );
}
