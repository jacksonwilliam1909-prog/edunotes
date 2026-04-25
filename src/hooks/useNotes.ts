import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useNotesStore } from '../store/useNotesStore'
import { useAuthStore } from '../store/useAuthStore'
import type { Note, NoteFormData } from '../types'

export function useNotes() {
  const [isLoading, setIsLoading] = useState(false)
  const { user } = useAuthStore()
  const { setNotes, upsertNote, removeNote } = useNotesStore()

  const fetchNotes = useCallback(
    async (notebookId?: string | null) => {
      if (!user) return
      setIsLoading(true)
      try {
        let query = supabase
          .from('notes')
          .select('*, notebook:notebooks(id, name, color)')
          .eq('user_id', user.id)
          .order('is_pinned', { ascending: false })
          .order('updated_at', { ascending: false })

        if (notebookId !== undefined) {
          query = notebookId
            ? query.eq('notebook_id', notebookId)
            : query.is('notebook_id', null)
        }

        const { data, error } = await query
        if (error) throw error
        setNotes((data as Note[]) ?? [])
      } catch (err) {
        toast.error('Erro ao carregar notas')
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    },
    [user, setNotes]
  )

  const fetchRecentNotes = useCallback(async () => {
    if (!user) return
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*, notebook:notebooks(id, name, color)')
        .eq('user_id', user.id)
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(10)

      if (error) throw error
      setNotes((data as Note[]) ?? [])
    } catch (err) {
      toast.error('Erro ao carregar notas recentes')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [user, setNotes])

  const createNote = useCallback(
    async (formData: Partial<NoteFormData>): Promise<Note | null> => {
      if (!user) return null
      try {
        const { data, error } = await supabase
          .from('notes')
          .insert({
            user_id: user.id,
            title: formData.title ?? 'Nota sem título',
            content: formData.content ?? {},
            notebook_id: formData.notebook_id ?? null,
            is_favorite: false,
            is_pinned: false,
          })
          .select('*, notebook:notebooks(id, name, color)')
          .single()

        if (error) throw error
        const note = data as Note
        upsertNote(note)
        return note
      } catch (err) {
        toast.error('Erro ao criar nota')
        console.error(err)
        return null
      }
    },
    [user, upsertNote]
  )

  const updateNote = useCallback(
    async (id: string, updates: Partial<NoteFormData>): Promise<boolean> => {
      try {
        const { data, error } = await supabase
          .from('notes')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select('*, notebook:notebooks(id, name, color)')
          .single()

        if (error) throw error
        upsertNote(data as Note)
        return true
      } catch (err) {
        toast.error('Erro ao atualizar nota')
        console.error(err)
        return false
      }
    },
    [upsertNote]
  )

  const deleteNote = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const { error } = await supabase.from('notes').delete().eq('id', id)
        if (error) throw error
        removeNote(id)
        toast.success('Nota excluída')
        return true
      } catch (err) {
        toast.error('Erro ao excluir nota')
        console.error(err)
        return false
      }
    },
    [removeNote]
  )

  const toggleFavorite = useCallback(
    async (note: Note) => {
      await updateNote(note.id, { is_favorite: !note.is_favorite })
    },
    [updateNote]
  )

  const togglePin = useCallback(
    async (note: Note) => {
      await updateNote(note.id, { is_pinned: !note.is_pinned })
    },
    [updateNote]
  )

  return {
    isLoading,
    fetchNotes,
    fetchRecentNotes,
    createNote,
    updateNote,
    deleteNote,
    toggleFavorite,
    togglePin,
  }
}
