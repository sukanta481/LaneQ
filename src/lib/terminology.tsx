'use client'

import { createContext, useContext } from 'react'
import type { Terminology } from './types'

/**
 * Vertical config lives in data. Every UI string that would otherwise say
 * "chair" or "stylist" reads from here, so a car service centre becomes
 * Bay / Technician / Job with no code change.
 */
const TerminologyContext = createContext<Terminology | null>(null)

export function TerminologyProvider({
  value,
  children,
}: {
  value: Terminology
  children: React.ReactNode
}) {
  return <TerminologyContext.Provider value={value}>{children}</TerminologyContext.Provider>
}

export function useTerminology(): Terminology {
  const value = useContext(TerminologyContext)
  if (value === null) throw new Error('useTerminology must be used inside TerminologyProvider')
  return value
}
