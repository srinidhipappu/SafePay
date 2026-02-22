'use client'
import { Stats } from '@/lib/api'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import { format } from 'date-fns'

const CATEGORY_COLORS = [
  '#1e40af', '#15803d', '#d97706', '#7c3aed', '#db2777', '#0891b2'
]

export function SpendingChart({ stats }: { stats: Stats }) {
  // Build daily spending data from recentActivity
  const dailyData = buildDailyData(stats.recentActivity)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Area Chart - Daily spending */}
      <div className="card">
        <h3 className="font-bold text-gray-900 mb-4">Spending Last 14 Days</h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={dailyData}>
            <defs>
              <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#1e40af" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#1e40af" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
            <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'Spent']} />
            <Area type="monotone" dataKey="amount" stroke="#1e40af" strokeWidth={2}
              fill="url(#spendGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Pie Chart - Category breakdown */}
      <div className="card">
        <h3 className="font-bold text-gray-900 mb-4">Spending by Category</h3>
        {stats.byCategory.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={stats.byCategory}
                dataKey="amount"
                nameKey="name"
                cx="50%" cy="50%"
                outerRadius={70}
                label={({ name, percent }) => `${name.split(' ')[0]} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {stats.byCategory.map((_, i) => (
                  <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`]} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-48 text-gray-400">
            No spending data yet
          </div>
        )}
      </div>
    </div>
  )
}

function buildDailyData(activity: Stats['recentActivity']) {
  const map: Record<string, number> = {}
  activity.forEach(item => {
    const day = format(new Date(item.timestamp), 'MMM d')
    map[day] = (map[day] || 0) + item.amount
  })
  return Object.entries(map).map(([date, amount]) => ({
    date,
    amount: Math.round(amount * 100) / 100
  }))
}
