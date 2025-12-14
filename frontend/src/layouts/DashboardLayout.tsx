/**
 * Dashboard Layout - Clean, minimal header navigation
 */
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  FolderIcon,
  CubeIcon,
  DocumentCheckIcon,
  ArrowDownTrayIcon,
  SunIcon,
  MoonIcon,
} from '@heroicons/react/24/outline'
import { useAppStore } from '@/store/appStore'
import { useEffect } from 'react'

const navigation = [
  { name: 'Files', href: '/', icon: FolderIcon },
  { name: 'Viewer', href: '/viewer', icon: CubeIcon },
  { name: 'Review', href: '/review', icon: DocumentCheckIcon },
  { name: 'Export', href: '/export', icon: ArrowDownTrayIcon },
]

export function DashboardLayout() {
  const location = useLocation()
  const { theme, setTheme, currentModel } = useAppStore()

  // Apply dark mode class to html element
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-50">
        <div className="w-full px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                <CubeIcon className="h-5 w-5 text-white" />
              </div>
              <span className="font-semibold text-slate-900 dark:text-white">IFC Dashboard</span>
            </div>

            {/* Navigation */}
            <nav className="flex items-center gap-1">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href
                return (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    className={
                      isActive
                        ? 'flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium text-sm'
                        : 'flex items-center gap-2 px-4 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 text-sm transition-colors'
                    }
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </NavLink>
                )
              })}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {/* Current model indicator */}
              {currentModel && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 max-w-[150px] truncate">
                    {currentModel.file_name}
                  </span>
                </div>
              )}

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? (
                  <SunIcon className="h-5 w-5" />
                ) : (
                  <MoonIcon className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  )
}
