import { z } from 'zod'

export const aiModel = 'openai/gpt-4.1-mini'
export const builtinModel = '@cf/meta/llama-3.1-8b-instruct-fp8-fast'
export const aiFieldLabels = {
  fullName: 'Full name',
  email: 'Work email',
  employeeNumber: 'Employee ID',
  department: 'Department',
  jobTitle: 'Job title',
  employmentType: 'Employment type',
  startDate: 'Start date',
} as const
export type AiField = keyof typeof aiFieldLabels
export const aiFields = z.enum([
  'fullName',
  'email',
  'employeeNumber',
  'department',
  'jobTitle',
  'employmentType',
  'startDate',
])
export const aiChanges = z
  .array(z.object({ field: aiFields, value: z.string().trim().max(254) }).strict())
  .max(7)
export const aiPlan = z
  .object({
    action: z.enum(['search', 'count', 'create', 'update', 'unsupported', 'clarify']),
    query: z.string().trim().max(100),
    department: z.string().trim().max(100),
    changes: aiChanges,
  })
  .strict()
export type AiPlan = z.infer<typeof aiPlan>
export const aiSettingsInput = z
  .object({
    workspaceId: z.string().min(1).max(100),
    version: z.number().int().nonnegative(),
    enabled: z.boolean(),
    funding: z.enum(['workspace', 'rekann']).default('workspace'),
    allowedRoles: z
      .array(z.enum(['admin', 'manager', 'employee']))
      .min(1)
      .max(3),
    allowWrites: z.boolean(),
    monthlyTokens: z.number().int().min(16384).max(10000000),
    dailyRequests: z.number().int().min(1).max(100),
    apiKey: z.string().trim().min(20).max(512).optional(),
  })
  .strict()
export const aiMessageInput = z
  .object({
    workspaceId: z.string().min(1).max(100),
    requestId: z.uuid(),
    message: z.string().trim().min(1).max(2000),
  })
  .strict()
export const aiActionInput = z
  .object({
    workspaceId: z.string().min(1).max(100),
    id: z.uuid(),
    version: z.number().int().nonnegative(),
    action: z.enum(['revise', 'confirm', 'cancel']),
    changes: aiChanges.optional(),
  })
  .strict()
export type AiPerson = {
  id: string
  name: string
  email: string
  department: string
  jobTitle: string
}
export type AiResult = {
  message: string
  people?: AiPerson[]
  total?: number
  draft?: {
    kind: 'create' | 'update'
    fields: Partial<Record<AiField, string>>
    before: Partial<Record<AiField, string>>
    missing: string[]
  }
  savedId?: string
}
export type AiTurn = {
  id: string
  prompt: string
  result: AiResult | null
  status: string
  version: number
  createdAt: string
}
export type AiSettings = {
  requestAllowance: { limit: number; remaining: number; resetsAt: string }
  funding: 'workspace' | 'rekann'
  builtinAvailable: boolean
  workspaceKeyConnected: boolean
  unavailableReason: 'paused' | 'restricted' | 'service' | 'connection' | null
  workspaceUsedToday: number
  workspaceKeyLimits: { monthlyTokens: number; dailyRequests: number }
  enabled: boolean
  connected: boolean
  admin: boolean
  available: boolean
  allowWrites: boolean
  allowedRoles: string[]
  monthlyTokens: number | null
  dailyRequests: number | null
  usedTokens: number
  usedToday: number
  version: number
  model: string
}

// Notes are private to one user in one workspace; they never grant permissions.
export const aiMemoryInput = z
  .object({
    workspaceId: z.string().min(1).max(100),
    version: z.number().int().nonnegative(),
    enabled: z.boolean(),
    notes: z.string().trim().max(1000),
  })
  .strict()
export const aiForgetInput = z
  .object({
    workspaceId: z.string().min(1).max(100),
    version: z.number().int().nonnegative(),
    all: z.boolean(),
  })
  .strict()
export type AiMemory = { enabled: boolean; notes: string; version: number }
export type AiContext = { notes: string; recentMessages: string[] }
