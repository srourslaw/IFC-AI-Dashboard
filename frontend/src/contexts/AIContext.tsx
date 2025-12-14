/**
 * AI Context - Multi-provider AI chat support for IFC methodology review
 * Supports: Groq (free), OpenAI, Anthropic, Google Gemini
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'

// =============================================================================
// Types
// =============================================================================

export type AIProvider = 'Groq' | 'OpenAI' | 'Anthropic' | 'Google Gemini'

export interface AIConfig {
  provider: AIProvider
  apiKey: string
  model: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface IFCContext {
  fileName: string
  totalElements: number
  totalZones: number
  totalStages: number
  levels: string[]
  elementTypes: Record<string, number>
  zones: Array<{
    name: string
    storeyName: string
    stageCount: number
    elementCount: number
  }>
  stages: Array<{
    name: string
    zoneName: string
    elementType: string
    elementCount: number
    sequenceOrder: number
  }>
}

interface AIContextType {
  config: AIConfig
  setConfig: (config: AIConfig) => void
  isConfigured: boolean
  messages: ChatMessage[]
  addMessage: (role: 'user' | 'assistant', content: string) => void
  clearMessages: () => void
  isLoading: boolean
  callAI: (prompt: string, ifcContext?: IFCContext) => Promise<string>
  testConnection: () => Promise<boolean>
  ifcContext: IFCContext | null
  setIFCContext: (context: IFCContext | null) => void
}

// =============================================================================
// Provider Configuration
// =============================================================================

export const AI_PROVIDERS: Array<{
  name: AIProvider
  models: string[]
  defaultModel: string
  description: string
  freeInfo?: string
}> = [
  {
    name: 'Groq',
    models: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    defaultModel: 'llama-3.1-70b-versatile',
    description: 'Ultra-fast inference, free tier available',
    freeInfo: 'Free: 6000 requests/day at console.groq.com',
  },
  {
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4o-mini',
    description: 'Most capable models, paid API',
  },
  {
    name: 'Anthropic',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
    defaultModel: 'claude-sonnet-4-20250514',
    description: 'Excellent reasoning, paid API',
  },
  {
    name: 'Google Gemini',
    models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'],
    defaultModel: 'gemini-1.5-flash',
    description: 'Google AI, free tier available',
    freeInfo: 'Free: 60 requests/min at aistudio.google.com',
  },
]

const DEFAULT_CONFIG: AIConfig = {
  provider: 'Groq',
  apiKey: '',
  model: 'llama-3.1-70b-versatile',
}

const STORAGE_KEY = 'ifc_ai_config'
const MESSAGES_KEY = 'ifc_ai_messages'

// =============================================================================
// System Context for IFC
// =============================================================================

const getSystemContext = (ifcContext: IFCContext | null) => {
  let contextStr = `You are an expert IFC (Industry Foundation Classes) methodology consultant and construction sequencing specialist.
Your role is to help users understand, review, and optimize their steel structure erection methodology.

You have deep knowledge of:
- IFC file structure and element types (IfcBeam, IfcColumn, IfcSlab, IfcWall, IfcMember, etc.)
- Construction sequencing best practices
- Steel structure erection methodology
- Safety considerations in construction
- Zone-based construction planning
- Stage sequencing and dependencies

When users ask questions:
- Reference specific elements, zones, and stages from their model
- Provide actionable recommendations
- Explain reasoning behind construction sequence decisions
- Flag potential safety or sequencing issues
- Be concise but thorough`

  if (ifcContext) {
    contextStr += `

CURRENT IFC MODEL CONTEXT:
========================
File: ${ifcContext.fileName}
Total Elements: ${ifcContext.totalElements}
Total Zones: ${ifcContext.totalZones}
Total Stages: ${ifcContext.totalStages}
Levels/Storeys: ${ifcContext.levels.join(', ')}

Element Type Distribution:
${Object.entries(ifcContext.elementTypes)
  .map(([type, count]) => `- ${type}: ${count} elements`)
  .join('\n')}

Zones Summary:
${ifcContext.zones
  .map((z) => `- ${z.name} (${z.storeyName}): ${z.stageCount} stages, ${z.elementCount} elements`)
  .join('\n')}

Stages Summary:
${ifcContext.stages
  .map((s) => `- ${s.name} [Order ${s.sequenceOrder}]: ${s.elementType} in ${s.zoneName} (${s.elementCount} elements)`)
  .join('\n')}
========================

Use this context to provide specific, relevant answers about their model.`
  }

  return contextStr
}

// =============================================================================
// API Endpoint Configuration
// =============================================================================

interface EndpointConfig {
  url: string
  headers: Record<string, string>
  formatBody: (prompt: string, systemContext: string) => object
  extractResponse: (data: unknown) => string
}

const getEndpointConfig = (config: AIConfig): EndpointConfig => {
  const { provider, apiKey, model } = config

  switch (provider) {
    case 'Groq':
      return {
        url: 'https://api.groq.com/openai/v1/chat/completions',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        formatBody: (prompt, systemContext) => ({
          model,
          messages: [
            { role: 'system', content: systemContext },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 2048,
        }),
        extractResponse: (data: any) => data.choices?.[0]?.message?.content || '',
      }

    case 'OpenAI':
      return {
        url: 'https://api.openai.com/v1/chat/completions',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        formatBody: (prompt, systemContext) => ({
          model,
          messages: [
            { role: 'system', content: systemContext },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 2048,
        }),
        extractResponse: (data: any) => data.choices?.[0]?.message?.content || '',
      }

    case 'Anthropic':
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        formatBody: (prompt, systemContext) => ({
          model,
          max_tokens: 2048,
          system: systemContext,
          messages: [{ role: 'user', content: prompt }],
        }),
        extractResponse: (data: any) => data.content?.[0]?.text || '',
      }

    case 'Google Gemini':
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        headers: {
          'Content-Type': 'application/json',
        },
        formatBody: (prompt, systemContext) => ({
          contents: [
            {
              parts: [{ text: `${systemContext}\n\nUser: ${prompt}` }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        }),
        extractResponse: (data: any) => data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      }

    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}

// =============================================================================
// Context
// =============================================================================

const AIContext = createContext<AIContextType | null>(null)

export function AIProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfigState] = useState<AIConfig>(DEFAULT_CONFIG)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [ifcContext, setIFCContext] = useState<IFCContext | null>(null)

  // Load config from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        setConfigState(parsed)
      }
    } catch (e) {
      console.error('Failed to load AI config:', e)
    }

    // Load messages
    try {
      const storedMessages = localStorage.getItem(MESSAGES_KEY)
      if (storedMessages) {
        setMessages(JSON.parse(storedMessages))
      }
    } catch (e) {
      console.error('Failed to load chat messages:', e)
    }
  }, [])

  // Save config to localStorage when it changes
  const setConfig = useCallback((newConfig: AIConfig) => {
    setConfigState(newConfig)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig))
  }, [])

  // Save messages to localStorage when they change
  useEffect(() => {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages))
  }, [messages])

  const isConfigured = Boolean(config.apiKey)

  const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    const message: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, message])
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
    localStorage.removeItem(MESSAGES_KEY)
  }, [])

  const callAI = useCallback(
    async (prompt: string, context?: IFCContext): Promise<string> => {
      if (!config.apiKey) {
        return 'Please configure your AI provider API key in the settings.'
      }

      setIsLoading(true)
      try {
        const endpoint = getEndpointConfig(config)
        const systemContext = getSystemContext(context || ifcContext)

        const response = await fetch(endpoint.url, {
          method: 'POST',
          headers: endpoint.headers,
          body: JSON.stringify(endpoint.formatBody(prompt, systemContext)),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMessage = errorData.error?.message || response.statusText
          throw new Error(`API Error: ${errorMessage}`)
        }

        const data = await response.json()
        const responseText = endpoint.extractResponse(data)

        if (!responseText) {
          throw new Error('Empty response from AI')
        }

        return responseText
      } catch (error) {
        console.error('AI call failed:', error)
        return `Error: ${error instanceof Error ? error.message : 'Failed to connect to AI service'}`
      } finally {
        setIsLoading(false)
      }
    },
    [config, ifcContext]
  )

  const testConnection = useCallback(async (): Promise<boolean> => {
    if (!config.apiKey) return false

    try {
      const response = await callAI('Say "Connection successful" in exactly those words.')
      return response.toLowerCase().includes('connection successful')
    } catch {
      return false
    }
  }, [config.apiKey, callAI])

  return (
    <AIContext.Provider
      value={{
        config,
        setConfig,
        isConfigured,
        messages,
        addMessage,
        clearMessages,
        isLoading,
        callAI,
        testConnection,
        ifcContext,
        setIFCContext,
      }}
    >
      {children}
    </AIContext.Provider>
  )
}

export function useAI() {
  const context = useContext(AIContext)
  if (!context) {
    throw new Error('useAI must be used within an AIProvider')
  }
  return context
}
