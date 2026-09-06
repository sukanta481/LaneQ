import { createServerSupabase } from '@/lib/supabase/server'
import { requireStaffContext } from '@/lib/salon'
import { salonToday } from '@/lib/day'
import type { LaneRow, ServiceRow, VisitRow } from '@/lib/types'
import { BoardClient } from './board-client'

export default async function BoardPage() {
  const { salon } = await requireStaffContext()
  const supabase = await createServerSupabase()

  const today = salonToday(salon.timezone)

  const [{ data: lanes }, { data: services }, { data: visits }] = await Promise.all([
    supabase.from('lanes').select('*').order('sort_order'),
    supabase.from('services').select('*').eq('is_active', true).order('name'),
    supabase
      .from('visits')
      .select('*')
      .eq('service_date', today)
      .in('status', ['waiting', 'in_service'])
      .order('created_at'),
  ])

  return (
    <BoardClient
      salonId={salon.id}
      timezone={salon.timezone}
      lanes={(lanes ?? []) as LaneRow[]}
      services={(services ?? []) as ServiceRow[]}
      visits={(visits ?? []) as VisitRow[]}
      serverNow={new Date().toISOString()}
    />
  )
}
