/**
 * AI Settings Component - Configure AI provider and API key
 */
import { useState } from 'react'
import {
  Cog6ToothIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/outline'
import { useAI, AI_PROVIDERS, AIProvider, AIConfig } from '@/contexts/AIContext'

interface AISettingsProps {
  isOpen: boolean
  onClose: () => void
}

export function AISettings({ isOpen, onClose }: AISettingsProps) {
  const { config, setConfig, testConnection } = useAI()
  const [localConfig, setLocalConfig] = useState<AIConfig>(config)
  const [showApiKey, setShowApiKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)

  if (!isOpen) return null

  const selectedProvider = AI_PROVIDERS.find((p) => p.name === localConfig.provider)

  const handleProviderChange = (provider: AIProvider) => {
    const providerConfig = AI_PROVIDERS.find((p) => p.name === provider)
    setLocalConfig({
      ...localConfig,
      provider,
      model: providerConfig?.defaultModel || '',
    })
    setTestResult(null)
  }

  const handleSave = () => {
    setConfig(localConfig)
    onClose()
  }

  const handleTest = async () => {
    setConfig(localConfig) // Save first
    setTesting(true)
    setTestResult(null)
    try {
      const success = await testConnection()
      setTestResult(success ? 'success' : 'error')
    } catch {
      setTestResult('error')
    }
    setTesting(false)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Cog6ToothIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">AI Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              AI Provider
            </label>
            <div className="grid grid-cols-2 gap-2">
              {AI_PROVIDERS.map((provider) => (
                <button
                  key={provider.name}
                  onClick={() => handleProviderChange(provider.name)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    localConfig.provider === provider.name
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                      : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                  }`}
                >
                  <div className="font-medium text-sm text-slate-900 dark:text-white">
                    {provider.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {provider.description}
                  </div>
                  {provider.freeInfo && (
                    <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                      {provider.freeInfo}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Model
            </label>
            <select
              value={localConfig.model}
              onChange={(e) => setLocalConfig({ ...localConfig, model: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {selectedProvider?.models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={localConfig.apiKey}
                onChange={(e) => {
                  setLocalConfig({ ...localConfig, apiKey: e.target.value })
                  setTestResult(null)
                }}
                placeholder="Enter your API key..."
                className="w-full px-4 py-2.5 pr-20 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                {showApiKey ? (
                  <EyeSlashIcon className="h-5 w-5" />
                ) : (
                  <EyeIcon className="h-5 w-5" />
                )}
              </button>
            </div>

            {/* Help text for getting API key */}
            {selectedProvider && (
              <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {localConfig.provider === 'Groq' && (
                    <>
                      Get free API key at{' '}
                      <button
                        onClick={() => copyToClipboard('https://console.groq.com')}
                        className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                      >
                        console.groq.com
                        <ClipboardDocumentIcon className="h-3 w-3" />
                      </button>
                    </>
                  )}
                  {localConfig.provider === 'OpenAI' && (
                    <>
                      Get API key at{' '}
                      <button
                        onClick={() => copyToClipboard('https://platform.openai.com/api-keys')}
                        className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                      >
                        platform.openai.com
                        <ClipboardDocumentIcon className="h-3 w-3" />
                      </button>
                    </>
                  )}
                  {localConfig.provider === 'Anthropic' && (
                    <>
                      Get API key at{' '}
                      <button
                        onClick={() => copyToClipboard('https://console.anthropic.com')}
                        className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                      >
                        console.anthropic.com
                        <ClipboardDocumentIcon className="h-3 w-3" />
                      </button>
                    </>
                  )}
                  {localConfig.provider === 'Google Gemini' && (
                    <>
                      Get free API key at{' '}
                      <button
                        onClick={() => copyToClipboard('https://aistudio.google.com/app/apikey')}
                        className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                      >
                        aistudio.google.com
                        <ClipboardDocumentIcon className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Test Connection Result */}
          {testResult && (
            <div
              className={`flex items-center gap-2 p-3 rounded-lg ${
                testResult === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
              }`}
            >
              {testResult === 'success' ? (
                <>
                  <CheckCircleIcon className="h-5 w-5" />
                  <span className="text-sm font-medium">Connection successful!</span>
                </>
              ) : (
                <>
                  <ExclamationCircleIcon className="h-5 w-5" />
                  <span className="text-sm font-medium">
                    Connection failed. Please check your API key.
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <button
            onClick={handleTest}
            disabled={!localConfig.apiKey || testing}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
