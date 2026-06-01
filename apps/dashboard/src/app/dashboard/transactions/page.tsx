"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@fincore/utils";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import dayjs from "dayjs";
import {
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Filter,
  Hash,
  Plus,
  Receipt,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const typeLabels: Record<string, string> = {
  all: "Semua Tipe",
  income: "💰 Pemasukan",
  expense: "💸 Pengeluaran",
  transfer: "🔄 Transfer",
};

interface Transaction {
  id: string;
  name: string;
  type: "income" | "expense" | "transfer";
  amount: string;
  fee: string;
  totalAmount: string;
  currency: string;
  merchant: string | null;
  transactionDate: string;
  isConfirmed: boolean;
  category: { name: string; icon: string } | null;
  paymentMethod: { name: string; icon: string } | null;
  toPaymentMethod: { name: string; icon: string } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

const typeBadge: Record<
  string,
  {
    label: string;
    variant: "default" | "outline" | "destructive";
    color: string;
  }
> = {
  income: {
    label: "Pemasukan",
    variant: "default",
    color: "bg-emerald-500 hover:bg-emerald-500",
  },
  expense: { label: "Pengeluaran", variant: "destructive", color: "" },
  transfer: { label: "Transfer", variant: "outline", color: "" },
};

const columns: ColumnDef<Transaction>[] = [
  {
    accessorKey: "name",
    header: "Deskripsi",
    cell: ({ row }) => {
      const tx = row.original;
      const badge = typeBadge[tx.type];
      return (
        <div className="flex flex-col gap-0.5 min-w-[180px]">
          <span className="font-medium text-sm">{tx.name}</span>
          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
            <Badge
              variant={badge.variant}
              className={`text-[10px] px-1.5 py-0 h-4 ${badge.color}`}
            >
              {badge.label}
            </Badge>
            {!tx.isConfirmed && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 border-amber-500/50 text-amber-500 bg-amber-500/5"
              >
                Draft
              </Badge>
            )}
            {(tx as any).tags?.map((t: any) => (
              <Badge
                key={t.tag.id}
                variant="outline"
                className="text-[9px] px-1.5 py-0 h-4"
                style={{
                  borderColor: t.tag.color || "#64748b",
                  color: t.tag.color || undefined,
                }}
              >
                {t.tag.name}
              </Badge>
            ))}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "amount",
    header: () => <div className="text-right">Jumlah</div>,
    cell: ({ row }) => {
      const tx = row.original;
      const sign =
        tx.type === "income" ? "+" : tx.type === "expense" ? "−" : "↔";
      const color =
        tx.type === "income"
          ? "text-emerald-600 dark:text-emerald-400"
          : tx.type === "expense"
            ? "text-red-500"
            : "text-blue-500";
      const Icon =
        tx.type === "income"
          ? ArrowUpRight
          : tx.type === "expense"
            ? ArrowDownRight
            : ArrowRightLeft;
      return (
        <div className="flex items-center justify-end gap-1">
          <Icon className={`h-3.5 w-3.5 ${color}`} />
          <span className={`font-semibold tabular-nums ${color}`}>
            {sign} {formatCurrency(tx.amount, tx.currency)}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "category",
    header: "Kategori",
    cell: ({ row }) => {
      const cat = row.original.category;
      if (!cat)
        return (
          <span className="text-muted-foreground text-sm flex items-center gap-1">
            <Hash className="h-3 w-3" />—
          </span>
        );
      return (
        <span className="text-sm flex items-center gap-1">
          <span>{cat.icon}</span> {cat.name}
        </span>
      );
    },
  },
  {
    accessorKey: "paymentMethod",
    header: "Metode",
    cell: ({ row }) => {
      const pm = row.original.paymentMethod;
      const toPm = row.original.toPaymentMethod;
      if (!pm) return <span className="text-muted-foreground text-sm">—</span>;
      if (toPm) {
        return (
          <span className="text-sm">
            {pm.icon} {pm.name} <span className="text-muted-foreground">→</span>{" "}
            {toPm.icon} {toPm.name}
          </span>
        );
      }
      return (
        <span className="text-sm">
          {pm.icon} {pm.name}
        </span>
      );
    },
  },
  {
    accessorKey: "transactionDate",
    header: "Tanggal",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground whitespace-nowrap">
        {dayjs(row.original.transactionDate).format("DD/MM/YYYY")}
      </span>
    ),
  },
];

export default function TransactionsPage() {
  const [data, setData] = useState<Transaction[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");

  const fetchData = useCallback(
    async (page: number, type: string, searchQ: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", "20");
        if (type) params.set("type", type);
        if (searchQ) params.set("search", searchQ);

        const res = await fetch(`/api/transactions?${params}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        setData(json.data);
        setPagination(json.pagination);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchData(pagination.page, typeFilter, search);
  }, [pagination.page, typeFilter, search, fetchData]);

  const handleSearch = () => {
    setPagination((p) => ({ ...p, page: 1 }));
    setSearch(searchInput);
  };

  const handleTypeChange = (value: string | null) => {
    setTypeFilter(value === "all" || !value ? "" : (value ?? ""));
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Transaksi</h2>
          <p className="text-muted-foreground">
            Kelola semua transaksi keuangan Anda
          </p>
        </div>
        <Link
          href="/dashboard/transactions/new/edit"
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium h-9 px-4 transition-all shadow-sm hover:shadow-md"
        >
          <Plus className="size-4" />
          <span>Tambah</span>
        </Link>
      </div>

      <Card className="border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari transaksi..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-8"
              />
            </div>
            <Select
              value={typeFilter || "all"}
              onValueChange={handleTypeChange}
            >
              <SelectTrigger className="w-full sm:w-[170px]">
                <SelectValue labels={typeLabels} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Tipe</SelectItem>
                <SelectItem value="income">💰 Pemasukan</SelectItem>
                <SelectItem value="expense">💸 Pengeluaran</SelectItem>
                <SelectItem value="transfer">🔄 Transfer</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="default"
              onClick={handleSearch}
              className="gap-1.5"
            >
              <Filter className="h-4 w-4" />
              Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow
                  key={headerGroup.id}
                  className="bg-muted/30 hover:bg-muted/30"
                >
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="font-medium text-xs uppercase tracking-wider text-muted-foreground"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={columns.length}>
                      <Skeleton className="h-10 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() =>
                      (window.location.href = `/dashboard/transactions/${row.original.id}/edit`)
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-3">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-32 text-center"
                  >
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Receipt className="h-10 w-10 opacity-20" />
                      <p className="font-medium">
                        Tidak ada transaksi ditemukan
                      </p>
                      {search || typeFilter ? (
                        <p className="text-sm">Coba ubah filter pencarian</p>
                      ) : (
                        <Link
                          href="/dashboard/transactions/new/edit"
                          className="text-sm text-primary hover:underline"
                        >
                          Catat transaksi pertama →
                        </Link>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t bg-muted/10">
            <p className="text-sm text-muted-foreground">
              {pagination.total} transaksi · Halaman {pagination.page} dari{" "}
              {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasPrev}
                onClick={() =>
                  setPagination((p) => ({ ...p, page: p.page - 1 }))
                }
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" /> Sebelumnya
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasNext}
                onClick={() =>
                  setPagination((p) => ({ ...p, page: p.page + 1 }))
                }
                className="gap-1"
              >
                Berikutnya <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
