export type Terminology = {
  lane_singular: string
  lane_plural: string
  operator_singular: string
  service_singular: string
  customer_singular: string
}

export type Salon = {
  id: string
  name: string
  slug: string
  timezone: string
  terminology: Terminology
  branding: { logo_url?: string; primary_color?: string }
  n8n_webhook_url: string | null
}

export type LaneRow = {
  id: string
  salon_id: string
  name: string
  is_active: boolean
  sort_order: number
}

export type ServiceRow = {
  id: string
  salon_id: string
  name: string
  default_duration_min: number
  is_active: boolean
}

export type VisitStatus = 'waiting' | 'in_service' | 'done' | 'walked_out' | 'no_show'

export type VisitRow = {
  id: string
  salon_id: string
  tracking_token: string
  service_date: string
  token_number: number
  customer_name: string
  phone: string | null
  service_id: string | null
  duration_min: number
  requested_lane_id: string | null
  assigned_lane_id: string | null
  status: VisitStatus
  created_at: string
  started_at: string | null
  ended_at: string | null
  notified_created_at: string | null
  notified_almost_at: string | null
}
