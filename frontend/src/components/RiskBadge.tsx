'use client'

interface RiskBadgeProps {
  level?: string
}

export function RiskBadge({ level }: RiskBadgeProps) {
  if (!level) return null

  const map: Record<
    string,
    { cls: string; label: string; icon: string }
  > = {
    LOW: {
      cls: 'bg-green-100 text-green-700',
      label: 'Low Risk',
      icon: '✅',
    },
    MEDIUM: {
      cls: 'bg-yellow-100 text-yellow-800',
      label: 'Medium Risk',
      icon: '⚠️',
    },
    HIGH: {
      cls: 'bg-orange-100 text-orange-800',
      label: 'High Risk',
      icon: '🚨',
    },
    CRITICAL: {
      cls: 'bg-red-100 text-red-700',
      label: 'Critical Risk',
      icon: '🔴',
    },
  }

  const cfg = map[level.toUpperCase()] || map.MEDIUM

  return (
    <span
      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${cfg.cls}`}
    >
      <span>{cfg.icon}</span>
      <span>{cfg.label}</span>
    </span>
  )
}