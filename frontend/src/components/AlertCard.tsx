'use client'
import { formatDistanceToNow } from 'date-fns'
import { RiskBadge } from '@/components/RiskBadge'

export function AlertCard({ alert, onDecide, deciding }: { alert: any; onDecide?: (id: string, d: 'APPROVED' | 'DENIED') => void; deciding?: boolean }) {
  const txn = alert.transaction
  const isPending = alert.status === 'PENDING'
  const statusStyle = {
    PENDING:  'bg-yellow-50 border-yellow-200',
    APPROVED: 'bg-green-50 border-green-200',
    DENIED:   'bg-red-50 border-red-200',
    EXPIRED:  'bg-gray-50 border-gray-200',
  }[alert.status as string] || ''

  return (
    <div className={`rounded-2xl border-2 p-5 ${statusStyle}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-gray-900 text-lg">{txn.merchant}</h3>
          <p className="text-gray-500 text-sm">{txn.city} · {formatDistanceToNow(new Date(alert.createdAt))} ago</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">${txn.amount.toFixed(2)}</p>
          <RiskBadge level={txn.riskLevel} />
        </div>
      </div>

      {alert.aiSummary && (
        <div className="bg-white/70 rounded-xl p-4 mb-4">
          <p className="text-sm font-bold text-blue-700 mb-2">🤖 AI Analysis</p>
          <p className="text-gray-800 text-sm leading-relaxed mb-2">{alert.aiSummary}</p>
          {alert.aiReasons?.length > 0 && (
            <ul className="space-y-1">
              {alert.aiReasons.map((r: string, i: number) => (
                <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                  <span className="text-red-500 mt-0.5 flex-shrink-0">•</span>{r}
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

      {txn.riskFlags?.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {txn.riskFlags.map((f: any, i: number) => (
            <span key={i} className={`text-xs font-semibold px-2 py-1 rounded-full ${
              f.severity === 'high' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
            }`}>
              {f.flag.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      {isPending && onDecide && (
        <div className="flex gap-3 mt-2">
          <button onClick={() => onDecide(alert.id, 'APPROVED')} disabled={deciding}
            className="flex-1 bg-green-600 text-white font-semibold py-3 rounded-xl hover:bg-green-700 disabled:opacity-50 text-base">
            ✅ This is Me — Approve
          </button>
          <button onClick={() => onDecide(alert.id, 'DENIED')} disabled={deciding}
            className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-xl hover:bg-red-700 disabled:opacity-50 text-base">
            🚫 Not Me — Block
          </button>
        </div>
      )}

      {!isPending && (
        <div className={`text-sm font-semibold text-center py-2 rounded-xl mt-2 ${
          alert.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {alert.status === 'APPROVED' ? '✅ Transaction Approved' : '🚫 Transaction Blocked'}
          {alert.approvals?.[0] && ` by ${alert.approvals[0].user.name}`}
        </div>
      )}
    </div>
  )
}