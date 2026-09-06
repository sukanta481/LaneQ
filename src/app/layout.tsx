import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'LaneQ',
  description: 'Live queue and wait times.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
