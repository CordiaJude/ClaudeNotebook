"use client";
import * as S from "@radix-ui/react-select";

export function Select({ value, onValueChange, options, label }: {
  value: string; onValueChange: (v: string) => void; options: { value: string; label: string }[]; label: string;
}) {
  return (
    <S.Root value={value} onValueChange={onValueChange}>
      <S.Trigger className="cn-field cn-select-trigger" aria-label={label}>
        <S.Value />
        <S.Icon aria-hidden>▾</S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content className="cn-pop" position="popper" sideOffset={4}>
          <S.Viewport>
            {options.map((o) => (
              <S.Item key={o.value} value={o.value} className="cn-item">
                <S.ItemText>{o.label}</S.ItemText>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
