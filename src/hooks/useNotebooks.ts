import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useNotesStore } from '../store/useNotesStore'
import { useAuthStore } from '../store/useAuthStore'
import type { Notebook, NotebookFormData } from '../types'

export function useNotebooks() {
  const [isLoading, setIsLoading] = useState(false)
  const { user } = useAuthStore()
  const { setNotebooks, upsertNotebook, removeNotebook } = useNotesStore()

  const fetchNotebooks = useCallback(async () => {
    if (!user) return
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('notebooks')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })

      if (error) throw error
      setNotebooks((data as Notebook[]) ?? [])
    } catch (err) {
      toast.error('Erro ao carregar cadernos')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [user, setNotebooks])

  const createNotebook = useCallback(
    async (formData: NotebookFormData): Promise<Notebook | null> => {
      if (!user) return null
      try {
        const { data, error } = await supabase
          .from('notebooks')
          .insert({ ...formData, user_id: user.id })
          .select()
          .single()

        if (error) throw error
        const notebook = data as Notebook
        upsertNotebook(notebook)
        toast.success('Caderno criado!')
        return notebook
      } catch (err) {
        toast.error('Erro ao criar caderno')
        console.error(err)
        return null
      }
    },
    [user, upsertNotebook]
  )

  const updateNotebook = useCallback(
    async (id: string, updates: Partial<NotebookFormData>): Promise<boolean> => {
      try {
        const { data, error } = await supabase
          .from('notebooks')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single()

        if (error) throw error
        upsertNotebook(data as Notebook)
        toast.success('Caderno atualizado!')
        return true
      } catch (err) {
        toast.error('Erro ao atualizar caderno')
        console.error(err)
        return false
      }
    },
    [upsertNotebook]
  )

  const deleteNotebook = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const { error } = await supabase.from('notebooks').delete().eq('id', id)
        if (error) throw error
        removeNotebook(id)
        toast.success('Caderno excluído')
        return true
      } catch (err) {
        toast.error('Erro ao excluir caderno')
        console.error(err)
        return false
      }
    },
    [removeNotebook]
  )

  return { isLoading, fetchNotebooks, createNotebook, updateNotebook, deleteNotebook }
}
