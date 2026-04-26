import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/useAuthStore'
import type { Note } from '../types'

export function useSearch() {
  const [results, setResults] = useState<Note[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const { user } = useAuthStore()

  const search = useCallback(
    async (query: string) => {
      if (!user || query.trim().length < 2) {
        setResults([])
        return
      }
      setIsSearching(true)
      try {
        const { data, error } = await supabase
          .from('notes')
          .select('*, notebook:notebooks(id, name, color)')
          .eq('user_id', user.id)
          .ilike('title', `%${query}%`)
          .order('updated_at', { ascending: false })
          .limit(20)

        if (error) throw error
        setResults((data as Note[]) ?? [])
      } catch {
        setResults([])
      } finally {
        setIsSearching(false)
      }
    },
    [user]
  )

  const clearResults = () => setResults([])

  return { results, isSearching, search, clearResults }
}
