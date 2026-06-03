import { FormEvent, useState } from "react";

interface QuickAddProps {
  disabled?: boolean;
  onAdd(text: string): Promise<void> | void;
}

export function QuickAdd({ disabled, onAdd }: QuickAddProps) {
  const [title, setTitle] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    await onAdd(trimmed);
    setTitle("");
  }

  return (
    <form className="quickAdd" onSubmit={submit}>
      <span aria-hidden="true">+</span>
      <input
        value={title}
        onChange={(event) => setTitle(event.currentTarget.value)}
        placeholder="快速输入：明天15:00 截止 单位 重要 巡检"
        aria-label="Quick add title"
        disabled={disabled}
      />
      <button type="submit" disabled={disabled}>
        添加
      </button>
    </form>
  );
}
