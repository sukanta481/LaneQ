'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTerminology } from '@/lib/terminology'

export function SetupTabs() {
  const pathname = usePathname()
  const { lane_plural: lanePlural, service_singular: serviceSingular } = useTerminology()

  const tabs = [
    { href: '/setup/lanes', label: lanePlural },
    { href: '/setup/services', label: `${serviceSingular}s` },
  ]

  return (
    <nav className="flex gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`min-h-11 rounded-lg px-4 py-2.5 text-sm font-medium ${
            pathname === tab.href ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
