import type { InputHTMLAttributes, Ref, TextareaHTMLAttributes } from "react";

export function Input({ className = "", ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ui-field ${className}`} {...p} />;
}
export function Textarea({ className = "", ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea className={`ui-field ${className}`} {...p} />;
}
