// ==================================================
// LabelBadge: ラベルチップ表示（全ページ共通）
// ==================================================
// 現行では todo/note/snippet で個別実装されていた部分を共通化

interface LabelBadgeProps {
  name: string;
  color: string;
  className?: string;
}

export function LabelBadge({ name, color, className = '' }: LabelBadgeProps) {
  return (
    <span
      className={`label-badge ${className}`}
      style={{
        background: `${color}33`,
        color: color,
        borderColor: `${color}99`,
      }}
    >
      {name}
    </span>
  );
}
