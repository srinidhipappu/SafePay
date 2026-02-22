'use client'

import { Alert } from '@/lib/api'
import { RiskBadge } from './RiskBadge'
import { formatDistanceToNow } from 'date-fns'

interface AlertCardProps {
  alert: Alert
  onDecide?: (id: string, decision: 'APPROVED' | 'DENIED') => void
  showSeniorName?: boolean
  deciding?: boolean
}

export function AlertCard({
  alert,
  onDecide,
  showSeniorName,
  deciding,
}: AlertCardProps) {
  const txn = alert.transaction
  const isPending = alert.status === 'PENDING'

  const statusStyle = {
    PENDING: 'bg-yellow-50 border-yellow-200',
    APPROVED: 'bg-green-50 border-green-200',
    DENIED: 'bg-red-50 border-red-200',
    EXPIRED: 'bg-gray-50 border-gray-200',
  }[alert.status]

  return (
    <div className={`rounded-2xl border-2 p-5 ${statusStyle} transition-all`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          {showSeniorName && (
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              {alert.senior?.name}
            </p>
          )}
          <h3 className="font-bold text-gray-900 text-lg">
            {txn.merchant}
          </h3>
          <p className="text-gray-500 text-sm">
            {txn.city} ·{' '}
            {formatDistanceToNow(new Date(alert.createdAt))} ago
          </p>
        </div>

        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">
            ${txn.amount.toFixed(2)}
          </p>
          <RiskBadge level={txn.riskLevel} />
        </div>
      </div>

      {/* AI Explanation */}
      {alert.aiSummary && (
        <div className="bg-white/70 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-bold text-blue-700">
              🤖 AI Analysis
            </span>
          </div>

          <p className="text-gray-800 text-sm leading-relaxed mb-2">
            {alert.aiSummary}
          </p>

          {alert.aiReasons && alert.aiReasons.length > 0 && (
            <ul className="space-y-1">
              {alert.aiReasons.map((r, i) => (
                <li
                  key={i}
                  className="text-sm text-gray-600 flex items-start gap-2"
                >
                  <span className="text-red-500 mt-0.5 flex-shrink-0">
                    •
                  </span>
                  {r}
                </li>
              ))}
            </ul>
          )}

          {alert.aiAction && (
            <p className="text-sm font-semibold text-blue-800 mt-3 bg-blue-50 px-3 py-2 rounded-lg">
              💡 {alert.aiAction}
            </p>
          )}
        </div>
      )}

      {/* Risk Flags */}
      {txn.riskFlags && txn.riskFlags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {txn.riskFlags.map((f: any, i: number) => (
            <span
              key={i}
              className={`text-xs font-semibold px-2 py-1 rounded-full ${
                f.severity === 'high'
                  ? 'bg-red-100 text-red-700'
                  : f.severity === 'medium'
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-yellow-100 text-yellow-700'
              }`}
            >
              {f.flag.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      {/* Decision buttons */}
      {isPending && onDecide && (
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => onDecide(alert.id, 'APPROVED')}
            disabled={deciding}
            className="btn-success flex-1 py-3 text-base"
          >
            ✅ This is Me — Approve
          </button>

          <button
            onClick={() => onDecide(alert.id, 'DENIED')}
            disabled={deciding}
            className="btn-danger flex-1 py-3 text-base"
          >
            🚫 Not Me — Block
          </button>
        </div>
      )}

      {/* Status indicator */}
      {!isPending && (
        <div
          className={`text-sm font-semibold text-center py-2 rounded-xl mt-2 ${
            alert.status === 'APPROVED'
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {alert.status === 'APPROVED'
            ? '✅ Transaction Approved'
            : '🚫 Transaction Blocked'}
          {alert.approvals[0] &&
            ` by ${alert.approvals[0].user.name}`}
        </div>
      )}
    </div>
  )
}