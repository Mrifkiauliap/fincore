"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import * as React from "react";

type NotificationVariant = "error" | "warning" | "info" | "success";

const variantConfig: Record<
  NotificationVariant,
  {
    icon: typeof CheckCircle2;
    iconColor: string;
    bgColor: string;
    ringColor: string;
  }
> = {
  error: {
    icon: XCircle,
    iconColor: "text-destructive",
    bgColor: "bg-destructive/10",
    ringColor: "ring-destructive/30",
  },
  warning: {
    icon: AlertTriangle,
    iconColor: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    ringColor: "ring-yellow-500/30",
  },
  info: {
    icon: Info,
    iconColor: "text-blue-500",
    bgColor: "bg-blue-500/10",
    ringColor: "ring-blue-500/30",
  },
  success: {
    icon: CheckCircle2,
    iconColor: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    ringColor: "ring-emerald-500/30",
  },
};

interface ModalNotifProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: NotificationVariant;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function ModalNotif({
  open,
  onOpenChange,
  variant,
  title,
  description,
  actionLabel = "OK",
  onAction,
}: ModalNotifProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;

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
          <AlertDialogAction
            onClick={() => {
              onAction?.();
              onOpenChange(false);
            }}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Hook-style convenience: returns an object to control ModalNotif state
 * plus a trigger helper.
 */
export function useModalNotif() {
  const [open, setOpen] = React.useState(false);
  const [variant, setVariant] = React.useState<NotificationVariant>("info");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [actionLabel, setActionLabel] = React.useState("OK");
  const onActionRef = React.useRef<(() => void) | undefined>(undefined);

  const show = React.useCallback(
    (
      v: NotificationVariant,
      t: string,
      desc?: string,
      label?: string,
      onAct?: () => void,
    ) => {
      setVariant(v);
      setTitle(t);
      setDescription(desc || "");
      setActionLabel(label || "OK");
      onActionRef.current = onAct;
      setOpen(true);
    },
    [],
  );

  const modal = (
    <ModalNotif
      open={open}
      onOpenChange={setOpen}
      variant={variant}
      title={title}
      description={description}
      actionLabel={actionLabel}
      onAction={onActionRef.current}
    />
  );

  return { show, modal };
}
