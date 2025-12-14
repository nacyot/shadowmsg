export interface Message {
  rowid: number
  guid: string
  handle_id: number
  date: number
  is_from_me: number
  text: string | null
  text_extracted: string | null
  text_syllables: string | null
  cache_has_attachments: number
  deleted_at: string | null
}

export interface Handle {
  rowid: number
  id: string
  service: string
}

export interface Contact {
  phone_normalized: string
  name: string
  organization: string | null
  phone_original: string
}

export interface SenderAlias {
  phone_normalized: string
  alias: string
  created_at: string
}

export interface SyncState {
  table_name: string
  last_rowid: number
  last_sync_at: string | null
}
