"use client";
import { createContext, useContext } from "react";

export type EnumOption = { name: string; removed?: boolean };
export type EnumRow = { id: string; name: string; options: EnumOption[] };
export type NotebookCtx = {
  notebookId: string;
  canEdit: boolean;
  author: { id: string; name: string };
  members: { id: string; name: string }[];
  tabs: { id: string; name: string }[];
  notebooks: { id: string; title: string }[];
  enums: EnumRow[];
  setEnums: (e: EnumRow[]) => void;
  openTab: (tabId: string) => void;
};

const Ctx = createContext<NotebookCtx | null>(null);
export const NotebookProvider = Ctx.Provider;
export function useNotebook(): NotebookCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("NotebookProvider missing");
  return c;
}
