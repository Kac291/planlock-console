export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return "刚刚";
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}

export function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("zh-CN", { hour12: false });
}

export function usd(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(n < 1 ? 3 : 2)}`;
}

export function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function shortId(id: string): string {
  return id.length > 22 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}
