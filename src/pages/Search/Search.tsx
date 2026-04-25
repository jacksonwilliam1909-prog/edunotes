import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Search as SearchIcon } from 'lucide-react'
import { Layout } from '../../components/layout/Layout'
import { NoteCard } from '../../components/notes/NoteCard'
import { SearchBar } from '../../components/search/SearchBar'
import { EmptyState } from '../../components/ui/Card'
import { useSearch } from '../../hooks/useSearch'

function SearchSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
        </div>
      ))}
    </div>
  )
}

export function Search() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const initialQuery = searchParams.get('q') ?? ''
  const [query, setQuery] = useState(initialQuery)
  const { results, isSearching, search } = useSearch()
  const [hasSearched, setHasSearched] = useState(false)

  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value)
      if (value.trim()) {
        navigate(`/search?q=${encodeURIComponent(value)}`, { replace: true })
        setHasSearched(true)
        search(value)
      } else {
        navigate('/search', { replace: true })
        setHasSearched(false)
      }
    },
    [search, navigate]
  )

  useEffect(() => {
    if (initialQuery) {
      setHasSearched(true)
      search(initialQuery)
    }
  }, [initialQuery, search])

  return (
    <Layout title="Buscar" showNewNote={false}>
      <div className="max-w-2xl mx-auto space-y-5">
        <SearchBar
          value={query}
          onChange={handleSearch}
          placeholder="Buscar por título ou conteúdo..."
          autoFocus
        />

        {isSearching && <SearchSkeleton />}

        {!isSearching && hasSearched && results.length === 0 && (
          <EmptyState
            icon={SearchIcon}
            title="Nenhum resultado encontrado"
            description={`Não encontramos notas para "${query}". Tente outros termos.`}
          />
        )}

        {!isSearching && !hasSearched && (
          <div className="flex flex-col items-center py-12 text-center">
            <SearchIcon size={32} className="text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Digite para buscar em suas notas
            </p>
          </div>
        )}

        {!isSearching && results.length > 0 && (
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              {results.length} {results.length === 1 ? 'resultado' : 'resultados'} para "{query}"
            </p>
            <div className="space-y-3">
              {results.map((note) => (
                <NoteCard key={note.id} note={note} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
