/**
 * AI Chat Panel - Collapsible side panel for chatting with AI about IFC methodology
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  TrashIcon,
  Cog6ToothIcon,
  SparklesIcon,
  ChevronDoubleRightIcon,
  ChevronDoubleLeftIcon,
  UserIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { useAI, IFCContext } from '@/contexts/AIContext'
import { AISettings } from './AISettings'

// =============================================================================
// Markdown Renderer
// =============================================================================

function renderMarkdown(text: string): React.ReactNode {
  // Split by code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g)

  return parts.map((part, partIndex) => {
    // Handle code blocks
    if (part.startsWith('```')) {
      const match = part.match(/```(\w+)?\n?([\s\S]*?)```/)
      if (match) {
        const [, , code] = match
        return (
          <pre
            key={partIndex}
            className="bg-slate-800 dark:bg-slate-900 rounded-lg p-3 my-2 overflow-x-auto"
          >
            <code className="text-sm text-slate-200 font-mono whitespace-pre">{code.trim()}</code>
          </pre>
        )
      }
    }

    // Process inline content
    const lines = part.split('\n')
    return lines.map((line, lineIndex) => {
      const key = `${partIndex}-${lineIndex}`

      // Headers
      if (line.startsWith('### ')) {
        return (
          <h3 key={key} className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-3 mb-1">
            {line.slice(4)}
          </h3>
        )
      }
      if (line.startsWith('## ')) {
        return (
          <h2 key={key} className="text-base font-bold text-slate-800 dark:text-slate-200 mt-3 mb-1">
            {line.slice(3)}
          </h2>
        )
      }
      if (line.startsWith('# ')) {
        return (
          <h1 key={key} className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-3 mb-1">
            {line.slice(2)}
          </h1>
        )
      }

      // Bullet points
      if (line.match(/^[\s]*[-*]\s/)) {
        const indent = line.match(/^[\s]*/)?.[0].length || 0
        const content = line.replace(/^[\s]*[-*]\s/, '')
        return (
          <div key={key} className="flex gap-2" style={{ paddingLeft: `${indent * 8}px` }}>
            <span className="text-slate-400">•</span>
            <span>{processInlineStyles(content)}</span>
          </div>
        )
      }

      // Numbered lists
      if (line.match(/^[\s]*\d+\.\s/)) {
        const indent = line.match(/^[\s]*/)?.[0].length || 0
        const match = line.match(/^[\s]*(\d+)\.\s(.*)/)
        if (match) {
          return (
            <div key={key} className="flex gap-2" style={{ paddingLeft: `${indent * 8}px` }}>
              <span className="text-slate-500 font-medium">{match[1]}.</span>
              <span>{processInlineStyles(match[2])}</span>
            </div>
          )
        }
      }

      // Empty line
      if (line.trim() === '') {
        return <div key={key} className="h-2" />
      }

      // Regular paragraph
      return (
        <p key={key} className="leading-relaxed">
          {processInlineStyles(line)}
        </p>
      )
    })
  })
}

function processInlineStyles(text: string): React.ReactNode {
  // Process bold, italic, and inline code
  const parts: React.ReactNode[] = []
  let remaining = text
  let keyIndex = 0

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
    // Italic
    const italicMatch = remaining.match(/\*(.+?)\*/)
    // Inline code
    const codeMatch = remaining.match(/`([^`]+)`/)

    // Find earliest match
    const matches = [
      { type: 'bold', match: boldMatch, index: boldMatch?.index ?? Infinity },
      { type: 'italic', match: italicMatch, index: italicMatch?.index ?? Infinity },
      { type: 'code', match: codeMatch, index: codeMatch?.index ?? Infinity },
    ].sort((a, b) => a.index - b.index)

    const earliest = matches[0]

    if (earliest.match && earliest.index !== Infinity) {
      // Add text before match
      if (earliest.index > 0) {
        parts.push(remaining.slice(0, earliest.index))
      }

      // Add styled content
      if (earliest.type === 'bold' && boldMatch) {
        parts.push(
          <strong key={keyIndex++} className="font-semibold">
            {boldMatch[1]}
          </strong>
        )
        remaining = remaining.slice(earliest.index + boldMatch[0].length)
      } else if (earliest.type === 'code' && codeMatch) {
        parts.push(
          <code
            key={keyIndex++}
            className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-sm font-mono"
          >
            {codeMatch[1]}
          </code>
        )
        remaining = remaining.slice(earliest.index + codeMatch[0].length)
      } else if (earliest.type === 'italic' && italicMatch) {
        parts.push(
          <em key={keyIndex++} className="italic">
            {italicMatch[1]}
          </em>
        )
        remaining = remaining.slice(earliest.index + italicMatch[0].length)
      }
    } else {
      // No more matches, add remaining text
      parts.push(remaining)
      break
    }
  }

  return parts.length > 0 ? parts : text
}

// =============================================================================
// Quick Actions
// =============================================================================

const QUICK_ACTIONS = [
  { label: 'Analyze sequence', prompt: 'Analyze the current construction sequence and identify any potential issues or improvements.' },
  { label: 'Check safety', prompt: 'Review the methodology for safety considerations. Are there any safety dependencies that should be addressed?' },
  { label: 'Optimize zones', prompt: 'How can I optimize the zone configuration for better construction efficiency?' },
  { label: 'Explain stages', prompt: 'Explain the purpose and reasoning behind each erection stage in the current methodology.' },
]

// =============================================================================
// Component
// =============================================================================

interface AIChatPanelProps {
  isOpen: boolean
  onToggle: () => void
  ifcContext: IFCContext | null
}

export function AIChatPanel({ isOpen, onToggle, ifcContext }: AIChatPanelProps) {
  const { messages, addMessage, clearMessages, isLoading, callAI, isConfigured, config, setIFCContext } = useAI()
  const [input, setInput] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Update IFC context when it changes
  useEffect(() => {
    setIFCContext(ifcContext)
  }, [ifcContext, setIFCContext])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const handleSend = useCallback(async (prompt?: string) => {
    const message = prompt || input.trim()
    if (!message || isLoading) return

    setInput('')
    addMessage('user', message)

    const response = await callAI(message)
    addMessage('assistant', response)
  }, [input, isLoading, addMessage, callAI])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Collapsed state - just show toggle button
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex items-center gap-2 px-3 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-l-xl shadow-lg transition-all hover:pr-4"
      >
        <ChevronDoubleLeftIcon className="h-5 w-5" />
        <ChatBubbleLeftRightIcon className="h-5 w-5" />
      </button>
    )
  }

  return (
    <>
      {/* Chat Panel */}
      <div className="fixed right-0 top-16 bottom-0 w-96 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 shadow-2xl z-40 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-blue-600 to-indigo-600">
          <div className="flex items-center gap-2">
            <SparklesIcon className="h-5 w-5 text-white" />
            <span className="font-semibold text-white">AI Assistant</span>
            {ifcContext && (
              <span className="px-2 py-0.5 bg-white/20 rounded text-xs text-white">
                {ifcContext.fileName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="AI Settings"
            >
              <Cog6ToothIcon className="h-5 w-5" />
            </button>
            <button
              onClick={clearMessages}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Clear chat"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
            <button
              onClick={onToggle}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Close panel"
            >
              <ChevronDoubleRightIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Not Configured Warning */}
        {!isConfigured && (
          <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800">
            <div className="flex items-start gap-2">
              <ExclamationTriangleIcon className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  AI not configured
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-300 mt-0.5">
                  Click the settings icon to configure your AI provider and API key.
                </p>
                <button
                  onClick={() => setShowSettings(true)}
                  className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-200 hover:underline"
                >
                  Configure now →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Context Info */}
        {ifcContext && (
          <div className="px-4 py-2 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Model loaded: <span className="font-medium text-slate-700 dark:text-slate-300">{ifcContext.totalElements} elements</span>,{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">{ifcContext.totalZones} zones</span>,{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">{ifcContext.totalStages} stages</span>
            </p>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                <SparklesIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                IFC Methodology Assistant
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Ask me anything about your IFC model, construction sequence, or erection methodology.
              </p>

              {/* Quick Actions */}
              <div className="w-full space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Quick actions
                </p>
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => handleSend(action.prompt)}
                    disabled={!isConfigured || isLoading}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      message.role === 'user'
                        ? 'bg-blue-600'
                        : 'bg-gradient-to-br from-purple-500 to-indigo-600'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <UserIcon className="h-4 w-4 text-white" />
                    ) : (
                      <SparklesIcon className="h-4 w-4 text-white" />
                    )}
                  </div>
                  <div
                    className={`flex-1 px-4 py-3 rounded-2xl ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white rounded-tr-md'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-tl-md'
                    }`}
                  >
                    <div className="text-sm">
                      {message.role === 'assistant' ? (
                        renderMarkdown(message.content)
                      ) : (
                        message.content
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                    <SparklesIcon className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-700 rounded-2xl rounded-tl-md">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-sm text-slate-500 dark:text-slate-400">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isConfigured ? "Ask about your IFC model..." : "Configure AI to start chatting..."}
              disabled={!isConfigured || isLoading}
              rows={2}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || !isConfigured || isLoading}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white rounded-xl transition-colors disabled:cursor-not-allowed"
            >
              <PaperAirplaneIcon className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 text-center">
            {config.provider} • {config.model}
          </p>
        </div>
      </div>

      {/* Settings Modal */}
      <AISettings isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </>
  )
}
