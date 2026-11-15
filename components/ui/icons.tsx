/* Icons: Lucide (ISC licence). One size and stroke everywhere; decorative by default, so label the button, not the icon. */
import {
  ArrowUp, Bold, ChartColumn, Check, ChevronDown, CircleAlert, Copy, Download, Eye, FileText, Globe, GripVertical, Image as ImageGlyph, Italic,
  Link, List, ListOrdered, Lock, MessageSquare, MessageSquareDashed, Moon, Palette, Pencil, Play, Plus, Presentation, RotateCcw, Search,
  Share2, Sparkles, Square, Sun, Table, Type, Underline, Undo2, Users, X, type LucideIcon, type LucideProps,
} from "lucide-react";

const mk = (C: LucideIcon) => function Icon(p: LucideProps) { return <C size={16} strokeWidth={1.75} aria-hidden {...p} />; };

export const IconGrip = mk(GripVertical);
export const IconPlus = mk(Plus);
export const IconSun = mk(Sun);
export const IconMoon = mk(Moon);
export const IconComment = mk(MessageSquare);
export const IconBold = mk(Bold);
export const IconItalic = mk(Italic);
export const IconUnderline = mk(Underline);
export const IconLink = mk(Link);
export const IconSparkle = mk(Sparkles);
export const IconDetached = mk(MessageSquareDashed);
export const IconStop = mk(Square);
export const IconDoc = mk(FileText);
export const IconDeck = mk(Presentation);
export const IconShare = mk(Share2);
export const IconDownload = mk(Download);
export const IconSend = mk(ArrowUp);
export const IconCheck = mk(Check);
export const IconClose = mk(X);
export const IconChevronDown = mk(ChevronDown);
export const IconSearch = mk(Search);
export const IconLock = mk(Lock);
export const IconPeople = mk(Users);
export const IconGlobe = mk(Globe);
export const IconCopy = mk(Copy);
export const IconPlay = mk(Play);
export const IconUndo = mk(Undo2);
export const IconRetry = mk(RotateCcw);
export const IconEye = mk(Eye);
export const IconPencil = mk(Pencil);
export const IconImage = mk(ImageGlyph);
export const IconText = mk(Type);
export const IconChart = mk(ChartColumn);
export const IconAlert = mk(CircleAlert);
export const IconList = mk(List);
export const IconListOrdered = mk(ListOrdered);
export const IconTable = mk(Table);
export const IconPalette = mk(Palette);
