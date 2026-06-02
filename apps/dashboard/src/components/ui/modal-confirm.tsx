"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { AlertTriangle, Trash2 } from "lucide-react";
import * as React from "react";

type ConfirmVariant = "warning" | "danger";

const variantConfig: Record<
  ConfirmVariant,
  {
    icon: typeof AlertTriangle;
    iconColor: string;
    bgColor: string;
    ringColor: string;
    actionVariant: "default" | "destructive";
  }
> = {
  warning: {
    icon: AlertTriangle,
    iconColor: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    ringColor: "ring-yellow-500/30",
    actionVariant: "default",
  },
  danger: {
    icon: Trash2,
    iconColor: "text-destructive",
    bgColor: "bg-destructive/10",
    ringColor: "ring-destructive/30",
    actionVariant: "destructive",
  },
};

interface ModalConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: ConfirmVariant;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

export function ModalConfirm({
  open,
  onOpenChange,
  variant,
  title,
  description,
  confirmLabel,
  cancelLabel = "Batal",
  loading = false,
  onConfirm,
  onCancel,
}: ModalConfirmProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;

  const defaultConfirmLabel = variant === "danger" ? "Hapus" : "Konfirmasi";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia
            className={cn(
              "rounded-full",
              config.bgColor,
              config.ringColor,
              "ring-2",
            )}
          >
            <Icon className={cn("size-5", config.iconColor)} />
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              onCancel?.();
              if (!onCancel) onOpenChange(false);
            }}
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={config.actionVariant}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? "Memproses..." : confirmLabel || defaultConfirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Hook-style convenience: returns an object to control ModalConfirm state
 * plus a promise-based confirm helper.
 */
export function useModalConfirm() {
  const [open, setOpen] = React.useState(false);
  const [variant, setVariant] = React.useState<ConfirmVariant>("warning");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [confirmLabel, setConfirmLabel] = React.useState<string | undefined>(
    undefined,
  );
  const [cancelLabel, setCancelLabel] = React.useState("Batal");
  const [loading, setLoading] = React.useState(false);
  const onConfirmRef = React.useRef<(() => void) | undefined>(undefined);
  const onCancelRef = React.useRef<(() => void) | undefined>(undefined);

  const show = React.useCallback(
    (
      v: ConfirmVariant,
      t: string,
      desc?: string,
      cLabel?: string,
      cancLabel?: string,
    ) => {
      setVariant(v);
      setTitle(t);
      setDescription(desc || "");
      setConfirmLabel(cLabel);
      setCancelLabel(cancLabel || "Batal");
      setLoading(false);
      setOpen(true);
    },
    [],
  );

  const confirm = React.useCallback(
    (
      v: ConfirmVariant,
      t: string,
      desc?: string,
      cLabel?: string,
      cancLabel?: string,
    ): Promise<boolean> => {
      return new Promise((resolve) => {
        show(v, t, desc, cLabel, cancLabel);
        onConfirmRef.current = () => {
          setLoading(true);
          // caller should close the modal themselves after async work
          resolve(true);
        };
        onCancelRef.current = () => {
          resolve(false);
        };
      });
    },
    [show],
  );

  const handleConfirm = () => {
    onConfirmRef.current?.();
  };

  const handleCancel = () => {
    onCancelRef.current?.();
    setOpen(false);
  };

  const dismiss = () => {
    setOpen(false);
    setLoading(false);
  };

  const modal = (
    <ModalConfirm
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          onCancelRef.current?.();
          setLoading(false);
        }
        setOpen(v);
      }}
      variant={variant}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      loading={loading}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { show, confirm, dismiss, modal, setLoading, loading };
}
