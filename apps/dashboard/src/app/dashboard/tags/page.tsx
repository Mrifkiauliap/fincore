"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Hash, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const colorOptions = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
];

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(colorOptions[0]);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editTag, setEditTag] = useState<Tag | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tags");
      const json = await res.json();
      setTags(json.data || []);
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
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      });
      if (!res.ok) throw new Error("Gagal membuat tag");
      toast.success("Tag berhasil dibuat");
      setNewName("");
      setNewColor(colorOptions[0]);
      fetchData();
    } catch {
      toast.error("Gagal membuat tag");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (tag: Tag) => {
    setEditTag(tag);
    setEditName(tag.name);
    setEditColor(tag.color || colorOptions[0]);
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTag || !editName.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/tags/${editTag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      });
      if (!res.ok) throw new Error("Gagal mengupdate tag");
      toast.success("Tag berhasil diupdate");
      setEditOpen(false);
      setEditTag(null);
      fetchData();
    } catch {
      toast.error("Gagal mengupdate tag");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/tags/${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Gagal menghapus");
      toast.success("Tag berhasil dihapus");
      setDeleteId(null);
      fetchData();
    } catch {
      toast.error("Gagal menghapus tag");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Hash className="h-6 w-6 text-violet-500" />
          Tag
        </h2>
        <p className="text-muted-foreground">
          Kelola tag untuk mengelompokkan transaksi
        </p>
      </div>

      {/* Create form */}
      <Card className="border bg-gradient-to-br from-violet-500/5 to-transparent">
        <CardContent className="p-4">
          <form
            onSubmit={handleCreate}
            className="flex flex-col sm:flex-row gap-3 items-end"
          >
            <div className="flex-1 space-y-1.5">
              <label className="text-sm font-medium">Nama Tag</label>
              <Input
                placeholder="Contoh: Liburan, Proyek A..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Warna</label>
              <div className="flex gap-1.5">
                {colorOptions.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewColor(color)}
                    className={`size-7 rounded-full border-2 transition-all ${
                      newColor === color
                        ? "border-foreground scale-110 shadow-md"
                        : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
            <Button
              type="submit"
              disabled={saving || !newName.trim()}
              className="gap-1.5 shrink-0"
            >
              <Plus className="h-4 w-4" />
              Tambah
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Tag list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <Card className="border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              {tags.length} Tag
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tags.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground">
                <Hash className="h-10 w-10 mb-3 opacity-20" />
                <p className="font-medium">Belum ada tag</p>
                <p className="text-sm">Buat tag pertama Anda di atas</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="outline"
                    className="gap-1.5 px-3 py-2 text-sm hover:bg-muted/30 transition-colors group cursor-pointer"
                    style={{
                      borderColor: tag.color || "#64748b",
                      color: tag.color || undefined,
                    }}
                    onClick={() => openEdit(tag)}
                    title="Klik untuk edit"
                  >
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: tag.color || "#64748b" }}
                    />
                    {tag.name}
                    <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 ml-0.5 transition-opacity" />
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tag</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nama Tag</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Warna</label>
              <div className="flex gap-1.5 flex-wrap">
                {colorOptions.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setEditColor(color)}
                    className={cn(
                      "size-8 rounded-full border-2 transition-all",
                      editColor === color
                        ? "border-foreground scale-110 shadow-md"
                        : "border-transparent hover:scale-105",
                    )}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setEditOpen(false);
                  setDeleteId(editTag?.id ?? null);
                }}
              >
                <Trash2 className="h-4 w-4" />
                Hapus
              </Button>
              <div className="flex-1" />
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={editSaving || !editName.trim()}>
                {editSaving ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteId}
        onOpenChange={(v) => {
          if (!v) setDeleteId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Tag?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tag yang dihapus akan terlepas dari semua transaksi terkait.
            Tindakan ini tidak dapat dikembalikan.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Menghapus..." : "Hapus"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
