"use client";
import * as D from "@radix-ui/react-dialog";
import * as P from "@radix-ui/react-popover";
import * as T from "@radix-ui/react-tooltip";
import * as M from "@radix-ui/react-dropdown-menu";
import * as Toast from "@radix-ui/react-toast";
import { useState, type ReactNode } from "react";
import { IconClose } from "./icons";

export function Dialog({ trigger, title, description, children }: { trigger: ReactNode; title: string; description?: string; children: ReactNode }) {
  return (
    <D.Root>
      <D.Trigger asChild>{trigger}</D.Trigger>
      <D.Portal>
        <D.Overlay className="ui-overlay" />
        <D.Content className="ui-dialog">
          <D.Title className="ui-h2" style={{ margin: 0 }}>{title}</D.Title>
          {description ? <D.Description className="ui-caption">{description}</D.Description> : <D.Description className="sr-only" />}
          <div style={{ marginTop: 16 }}>{children}</div>
          <D.Close asChild>
            <button className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close" style={{ position: "absolute", right: 12, top: 12 }}><IconClose /></button>
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function Popover({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  return (
    <P.Root>
      <P.Trigger asChild>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content className="ui-pop" sideOffset={6} style={{ padding: 12 }}>{children}</P.Content>
      </P.Portal>
    </P.Root>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <T.Provider delayDuration={300}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content className="ui-tooltip" sideOffset={6}>{label}</T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}

export type MenuEntry = { label: string; onSelect?: () => void; shortcut?: string; disabled?: boolean } | "sep";
export function Menu({ trigger, items }: { trigger: ReactNode; items: MenuEntry[] }) {
  return (
    <M.Root>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content className="ui-pop" sideOffset={6} align="start" style={{ minWidth: 200 }}>
          {items.map((it, i) =>
            it === "sep" ? <M.Separator key={i} className="ui-sep" /> : (
              <M.Item key={it.label} className="ui-item" disabled={it.disabled} onSelect={it.onSelect}>
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.shortcut ? <kbd className="ui-kbd">{it.shortcut}</kbd> : null}
              </M.Item>
            ),
          )}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

export function ToastButton({ label, message }: { label: string; message: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Toast.Provider duration={4000}>
      <button className="ui-btn ui-btn--secondary" onClick={() => setOpen(true)}>{label}</button>
      <Toast.Root className="ui-toast" open={open} onOpenChange={setOpen}>
        <Toast.Description>{message}</Toast.Description>
      </Toast.Root>
      <Toast.Viewport className="ui-toast-viewport" />
    </Toast.Provider>
  );
}

export function ControlledDialog({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="ui-overlay" />
        <D.Content className="ui-dialog">
          <D.Title className="ui-h2" style={{ margin: 0 }}>{title}</D.Title>
          {description ? <D.Description className="ui-caption">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          <div style={{ marginTop: 16 }}>{children}</div>
          <D.Close asChild>
            <button className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close" style={{ position: "absolute", right: 12, top: 12 }}><IconClose /></button>
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
