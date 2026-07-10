import { NavLink } from 'react-router-dom'
import { useUserStore } from '../../store/userStore'
import { getShowCountdown } from '../../utils/dates'
import { useSidebarCollapsed, toggleSidebar } from './useSidebar'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: '⊞' },
  { to: '/training', label: 'Training', icon: '🏋' },
  { to: '/diet', label: 'Nutrition', icon: '🥗' },
  { to: '/checkin', label: 'Check-In', icon: '✓' },
  { to: '/progress', label: 'Progress', icon: '📈' },
  { to: '/education', label: 'Education', icon: '📖' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

const GOAL_LABELS: Record<string, string> = {
  bulk: 'Off-Season Build',
  cut: 'Contest Prep — Cut',
  maintain: 'Maintenance',
  recomp: 'Recomposition',
}

export default function NavSidebar() {
  const { user, shows } = useUserStore()
  const collapsed = useSidebarCollapsed()

  // Nearest upcoming show — source of truth is the shows array, never fall back to user.show_date
  // (user.show_date may lag if a show was just deleted)
  const today = new Date().toLocaleDateString('en-CA')
  const upcomingShows = shows
    .filter((s) => s.show_date >= today)
    .sort((a, b) => a.show_date.localeCompare(b.show_date))
  const nextShow = upcomingShows[0] ?? null

  const countdown = nextShow ? getShowCountdown(nextShow.show_date) : null

  const countdownLabel = countdown && countdown.totalDays > 0
    ? countdown.weeks > 0
      ? `${countdown.weeks}w ${countdown.days}d out`
      : `${countdown.totalDays} day${countdown.totalDays !== 1 ? 's' : ''} out`
    : countdown?.totalDays === 0
      ? 'Show Day!'
      : null

  const subLabel = user
    ? (user.division ? user.division : (GOAL_LABELS[user.goal] ?? user.goal))
    : null

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-56'} bg-gray-900 border-r border-gray-800 flex flex-col h-screen sticky top-0 transition-all duration-300`}
    >
      {/* Logo + collapse toggle */}
      <div className={`flex items-center border-b border-gray-800 ${collapsed ? 'justify-center px-2 py-4' : 'justify-between px-4 py-5'}`}>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-lg font-black text-brand-500 tracking-tight">PrepCoach</h1>
            <p className="text-xs text-gray-500 mt-0.5">Competition Prep</p>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors text-lg leading-none"
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* User info */}
      {user && !collapsed && (
        <div className="px-4 py-3 border-b border-gray-800 space-y-1">
          <p className="text-sm font-semibold text-gray-200 truncate">{user.name}</p>
          {subLabel && <p className="text-xs text-gray-500 truncate">{subLabel}</p>}
          {countdownLabel && (
            <div className="bg-brand-900/40 rounded px-2 py-1 mt-1.5">
              {nextShow?.name && nextShow.name !== 'Competition' && (
                <p className="text-xs text-gray-400 truncate mb-0.5">{nextShow.name}</p>
              )}
              <p className="text-xs text-brand-400 font-medium">{countdownLabel}</p>
            </div>
          )}
          {shows.length > 1 && (
            <p className="text-xs text-gray-600">{shows.length} shows scheduled</p>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-600/20 text-brand-400 border border-brand-600/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`
            }
          >
            <span className="text-base leading-none w-5 text-center">{icon}</span>
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom info */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-gray-800">
          <p className="text-xs text-gray-600">PrepCoach v1.0</p>
          <p className="text-xs text-gray-700 mt-0.5">Educational use only</p>
        </div>
      )}
    </aside>
  )
}
