export interface PdfStroke {
  id: string
  tool: 'pen' | 'highlight' | 'eraser'
  color: string
  width: number
  page: number
  points: Array<[number, number]>
  opacity?: number
}

export interface Profile {
  id: string
  name: string
  avatar_url: string | null
  created_at: string
}

export interface Notebook {
  id: string
  user_id: string
  name: string
  color: string
  icon: string
  created_at: string
  updated_at: string
  notes_count?: number
}

export interface Note {
  id: string
  user_id: string
  notebook_id: string | null
  title: string
  content: Record<string, unknown>
  is_favorite: boolean
  is_pinned: boolean
  created_at: string
  updated_at: string
  notebook?: Pick<Notebook, 'id' | 'name' | 'color'>
  tags?: Tag[]
  pdf_url: string | null
  pdf_annotations: PdfStroke[] | null
}

export interface Tag {
  id: string
  user_id: string
  name: string
  color: string
}

export interface NoteTag {
  note_id: string
  tag_id: string
}

export type NoteFormData = {
  title: string
  content: Record<string, unknown>
  notebook_id: string | null
  is_favorite: boolean
  is_pinned: boolean
  pdf_url: string | null
  pdf_annotations: PdfStroke[] | null
}

export type NotebookFormData = {
  name: string
  color: string
  icon: string
}
