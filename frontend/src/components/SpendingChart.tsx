'use client'

export function SpendingChart({ stats }: { stats: any }) {
  const daily = buildDailyData(stats.recentActivity || [])
  const maxAmt = Math.max(...daily.map((d: any) => d.amount), 1)
  const categories = (stats.byCategory || []).slice(0, 6)
  const totalCat = categories.reduce((s: number, c: any) => s + c.amount, 0)
  const catColors = ['#1e40af','#15803d','#d97706','#7c3aed','#db2777','#0891b2']

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Bar chart */}
      <div className="card">
        <h3 className="font-bold text-gray-900 mb-4">Spending Last 14 Days</h3>
        <div className="flex items-end gap-1 h-40">
          {daily.map((d: any, i: number) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-blue-500 rounded-t-sm hover:bg-blue-600 transition-colors"
                style={{ height: `${Math.max((d.amount / maxAmt) * 130, 4)}px` }}
                title={`${d.date}: $${d.amount.toFixed(2)}`}
              />
              {i % 3 === 0 && (
                <span className="text-xs text-gray-400 rotate-45 origin-left whitespace-nowrap" style={{ fontSize: '9px' }}>
                  {d.date}
                </span>
              )}
            </div>
          ))}
        </div>
        {daily.length === 0 && (
          <div className="flex items-center justify-center h-40 text-gray-400">No data yet</div>
        )}
      </div>

      {/* Category breakdown */}
      <div className="card">
        <h3 className="font-bold text-gray-900 mb-4">Spending by Category</h3>
        {categories.length > 0 ? (
          <div className="space-y-3">
            {categories.map((cat: any, i: number) => {
              const pct = totalCat > 0 ? (cat.amount / totalCat) * 100 : 0
              return (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 font-medium truncate">{cat.name}</span>
                    <span className="text-gray-500 ml-2">${cat.amount.toFixed(0)}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: catColors[i % catColors.length] }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center h-40 text-gray-400">No data yet</div>
        )}
      </div>
    </div>
  )
}

function buildDailyData(activity: any[]) {
  const map: Record<string, number> = {}
  activity.forEach(item => {
    const d = new Date(item.timestamp)
    const key = `${d.getMonth() + 1}/${d.getDate()}`
    map[key] = (map[key] || 0) + item.amount
  })
  return Object.entries(map).map(([date, amount]) => ({
    date,
    amount: Math.round(amount * 100) / 100,
  }))
}
