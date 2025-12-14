import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// Admin credentials - in production, these should be environment variables
const ADMIN_EMAIL = 'admin@bluewaveintelligence.com'
const ADMIN_PASSWORD = 'BlueWave2024!'

interface AuthContextType {
  isAuthenticated: boolean
  userEmail: string | null
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Check for existing session on mount
  useEffect(() => {
    const storedAuth = localStorage.getItem('ifc_dashboard_auth')
    if (storedAuth) {
      try {
        const { email, expiry } = JSON.parse(storedAuth)
        if (expiry && new Date(expiry) > new Date()) {
          setIsAuthenticated(true)
          setUserEmail(email)
        } else {
          localStorage.removeItem('ifc_dashboard_auth')
        }
      } catch {
        localStorage.removeItem('ifc_dashboard_auth')
      }
    }
    setIsLoading(false)
  }, [])

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    // Simple credential check
    if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD) {
      // Set session to expire in 7 days
      const expiry = new Date()
      expiry.setDate(expiry.getDate() + 7)

      localStorage.setItem('ifc_dashboard_auth', JSON.stringify({
        email,
        expiry: expiry.toISOString()
      }))

      setIsAuthenticated(true)
      setUserEmail(email)
      return { success: true }
    }

    return { success: false, error: 'Invalid email or password' }
  }

  const logout = () => {
    localStorage.removeItem('ifc_dashboard_auth')
    setIsAuthenticated(false)
    setUserEmail(null)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, userEmail, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
