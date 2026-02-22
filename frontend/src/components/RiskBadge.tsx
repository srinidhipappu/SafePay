'use client'

export function RiskBadge({ level }: { level?: string }) {
  if (!level) return null
  const map: Record<string, { cls: string; label: string; icon: string }> = {
    LOW:      { cls: 'bg-green-100 text-green-800 border border-green-200',    label: 'Low Risk',      icon: '✅' },
    MEDIUM:   { cls: 'bg-yellow-100 text-yellow-800 border border-yellow-200', label: 'Medium Risk',   icon: '⚠️' },
    HIGH:     { cls: 'bg-orange-100 text-orange-800 border border-orange-200', label: 'High Risk',     icon: '🚨' },
    CRITICAL: { cls: 'bg-red-100 text-red-800 border border-red-200',          label: 'Critical Risk', icon: '🔴' },
  }
  const cfg = map[level] || map['MEDIUM']
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold ${cfg.cls}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}