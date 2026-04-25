import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Star, Pin, Trash2, Check, Loader2, FileUp, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { NoteEditor as Editor } from '../../components/notes/NoteEditor'
import { PdfViewer } from '../../components/pdf/PdfViewer'
import { ConfirmModal } from '../../components/ui/Modal'
import { useNotes } from '../../hooks/useNotes'
import { useNotesStore } from '../../store/useNotesStore'
import { useUIStore } from '../../store/useUIStore'
import { useAuthStore } from '../../store/useAuthStore'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'
import type { Note, PdfAnnotation } from '../../types'

type SaveStatus = 'idle' | 'saving' | 'saved'
type ActiveTab = 'note' | 'pdf'

export function NoteEditorPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isNew = id === 'new'

  const { createNote, updateNote, deleteNote, toggleFavorite, togglePin } = useNotes()
  const notes = useNotesStore((s) => s.notes)
  const { isDarkMode } = useUIStore()
  const user = useAuthStore((s) => s.user)

  const [note, setNote] = useState<Note | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState<Record<string, unknown>>({})
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [activeTab, setActiveTab] = useState<ActiveTab>('note')
  const [localPdfUrl, setLocalPdfUrl] = useState<string | null>(null)
  const [isUploadingPdf, setIsUploadingPdf] = useState(false)

  const noteIdRef = useRef<string | null>(isNew ? null : (id ?? null))
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const annotationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  // Track blob URL so we can revoke it when replaced or on unmount
  const localBlobUrlRef = useRef<string | null>(null)

  // Keep latest title/content in refs so the cleanup useEffect
  // doesn't capture stale closures from the empty dependency array
  const latestTitleRef = useRef(title)
  const latestContentRef = useRef(content)

  // Prevent the notes-store effect from resetting editor state after the initial load.
  // Every updateNote call (autosave, annotation save, PDF URL update) triggers the
  // effect; without this guard the editor content reverts to the last saved version.
  const contentInitializedRef = useRef(false)

  // Reset content guard when navigating to a different note
  useEffect(() => {
    contentInitializedRef.current = false
  }, [id])

  // Load existing note
  useEffect(() => {
    if (isNew) {
      setIsInitialized(true)
      return
    }
    const existing = notes.find((n) => n.id === id)
    if (existing) {
      setNote(existing)
      // Only set editor content on the first load — subsequent runs are triggered
      // by store updates (autosave, annotation save, PDF URL change) and must NOT
      // overwrite content the user is actively editing.
      if (!contentInitializedRef.current) {
        setTitle(existing.title)
        setContent(existing.content)
        latestTitleRef.current = existing.title
        latestContentRef.current = existing.content
        if (existing.pdf_url) setLocalPdfUrl(existing.pdf_url)
        contentInitializedRef.current = true
      }
      setIsInitialized(true)
    } else if (id) {
      supabase
        .from('notes')
        .select('*, notebook:notebooks(id, name, color)')
        .eq('id', id)
        .single()
        .then(({ data, error }) => {
          if (error || !data) { navigate('/'); return }
          const fetched = data as Note
          setNote(fetched)
          setTitle(fetched.title)
          setContent(fetched.content)
          latestTitleRef.current = fetched.title
          latestContentRef.current = fetched.content
          if (fetched.pdf_url) setLocalPdfUrl(fetched.pdf_url)
          contentInitializedRef.current = true
          setIsInitialized(true)
        })
    }
  }, [id, isNew, notes, navigate])

  const save = useCallback(
    async (newTitle: string, newContent: Record<string, unknown>) => {
      setSaveStatus('saving')
      try {
        if (!noteIdRef.current) {
          const notebookId = searchParams.get('notebook') ?? null
          const created = await createNote({
            title: newTitle,
            content: newContent,
            notebook_id: notebookId,
          })
          if (created) {
            noteIdRef.current = created.id
            setNote(created)
            window.history.replaceState({}, '', `/notes/${created.id}`)
          }
        } else {
          await updateNote(noteIdRef.current, { title: newTitle, content: newContent })
        }
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } catch {
        setSaveStatus('idle')
      }
    },
    [createNote, updateNote, searchParams],
  )

  const scheduleAutosave = useCallback(
    (newTitle: string, newContent: Record<string, unknown>) => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = setTimeout(() => save(newTitle, newContent), 2000)
    },
    [save],
  )

  const handleTitleChange = (value: string) => {
    setTitle(value)
    latestTitleRef.current = value
    scheduleAutosave(value, latestContentRef.current)
  }

  const handleContentChange = (value: Record<string, unknown>) => {
    setContent(value)
    latestContentRef.current = value
    scheduleAutosave(latestTitleRef.current, value)
  }

  const handleAnnotationsChange = useCallback(
    (annotations: PdfAnnotation[]) => {
      if (annotationTimerRef.current) clearTimeout(annotationTimerRef.current)
      annotationTimerRef.current = setTimeout(async () => {
        if (noteIdRef.current) {
          await updateNote(noteIdRef.current, { pdf_annotations: annotations })
        }
      }, 1500)
    },
    [updateNote],
  )

  const handleSaveMergedPdf = useCallback(
    async (bytes: Uint8Array) => {
      if (!noteIdRef.current || !user) return
      try {
        const file = new File([bytes as BlobPart], 'merged.pdf', { type: 'application/pdf' })
        const path = `${user.id}/${noteIdRef.current}.pdf`
        const { error: uploadError } = await supabase.storage
          .from('pdfs')
          .upload(path, file, { contentType: 'application/pdf', upsert: true })
        if (uploadError) throw uploadError
        const { data: { publicUrl } } = supabase.storage.from('pdfs').getPublicUrl(path)
        // Append cache-buster so the browser fetches fresh content after upsert
        const freshUrl = `${publicUrl}?v=${Date.now()}`
        await updateNote(noteIdRef.current, { pdf_url: freshUrl })
        setNote((prev) => (prev ? { ...prev, pdf_url: freshUrl } : null))
        setLocalPdfUrl(freshUrl)
        toast.success('PDF mesclado salvo')
      } catch (err) {
        console.error(err)
        toast.error('Erro ao salvar PDF mesclado')
      }
    },
    [user, updateNote],
  )

  // ── PDF import ───────────────────────────────────────────────────────────
  const handleImportPdf = () => pdfInputRef.current?.click()

  const handlePdfFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') {
      toast.error('Por favor, selecione um arquivo PDF')
      return
    }

    // Bug 1 fix: revoke the previous blob URL before creating a new one
    if (localBlobUrlRef.current) {
      URL.revokeObjectURL(localBlobUrlRef.current)
    }

    const blobUrl = URL.createObjectURL(file)
    localBlobUrlRef.current = blobUrl
    setLocalPdfUrl(blobUrl)
    setActiveTab('pdf')

    // Ensure note is created before uploading
    if (!noteIdRef.current) {
      const created = await createNote({
        title: title || 'Nota sem título',
        content,
        notebook_id: searchParams.get('notebook') ?? null,
      })
      if (!created) {
        toast.error('Erro ao criar nota para o PDF')
        return
      }
      noteIdRef.current = created.id
      setNote(created)
      window.history.replaceState({}, '', `/notes/${created.id}`)
    }

    setIsUploadingPdf(true)
    try {
      const path = `${user?.id ?? 'anon'}/${noteIdRef.current}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('pdfs')
        .upload(path, file, { contentType: 'application/pdf', upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('pdfs').getPublicUrl(path)

      await updateNote(noteIdRef.current, { pdf_url: publicUrl })
      setNote((prev) => (prev ? { ...prev, pdf_url: publicUrl } : null))

      // Bug 1 fix: revoke blob URL now that we have the permanent URL
      if (localBlobUrlRef.current) {
        URL.revokeObjectURL(localBlobUrlRef.current)
        localBlobUrlRef.current = null
      }
      setLocalPdfUrl(publicUrl)
      toast.success('PDF importado com sucesso')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao fazer upload do PDF')
    } finally {
      setIsUploadingPdf(false)
      if (pdfInputRef.current) pdfInputRef.current.value = ''
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    const targetId = noteIdRef.current
    if (targetId) await deleteNote(targetId)
    setIsDeleting(false)
    navigate(-1)
  }

  const handleToggleFavorite = async () => {
    if (!note) return
    await toggleFavorite(note)
    setNote((prev) => (prev ? { ...prev, is_favorite: !prev.is_favorite } : null))
  }

  const handleTogglePin = async () => {
    if (!note) return
    await togglePin(note)
    setNote((prev) => (prev ? { ...prev, is_pinned: !prev.is_pinned } : null))
  }

  // Bug 2 fix: use refs (always current) instead of stale closure values
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
        save(latestTitleRef.current, latestContentRef.current)
      }
      if (annotationTimerRef.current) clearTimeout(annotationTimerRef.current)
      // Bug 1 fix: revoke any lingering blob URL on unmount
      if (localBlobUrlRef.current) URL.revokeObjectURL(localBlobUrlRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activePdfUrl = localPdfUrl ?? note?.pdf_url ?? null

  if (!isInitialized) {
    return (
      <div className="h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className={cn('h-screen flex flex-col', isDarkMode ? 'dark' : '')}>
      <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">

        {/* Header */}
        <header className="h-14 flex-shrink-0 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 z-20">
          {/* Left: back + tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft size={18} />
            </button>

            {activePdfUrl && (
              <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
                <button
                  onClick={() => setActiveTab('note')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    activeTab === 'note'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                  )}
                >
                  <FileText size={14} />
                  Nota
                </button>
                <button
                  onClick={() => setActiveTab('pdf')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    activeTab === 'pdf'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                  )}
                >
                  <FileUp size={14} />
                  PDF
                </button>
              </div>
            )}
          </div>

          {/* Center: save status */}
          <div className="flex items-center gap-1 text-xs text-gray-400">
            {saveStatus === 'saving' && (
              <>
                <Loader2 size={12} className="animate-spin" />
                Salvando...
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <Check size={12} className="text-green-500" />
                <span className="text-green-500">Salvo</span>
              </>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleImportPdf}
              disabled={isUploadingPdf}
              title="Importar PDF"
              className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {isUploadingPdf ? <Loader2 size={18} className="animate-spin" /> : <FileUp size={18} />}
            </button>

            {note && (
              <>
                <button
                  onClick={handleToggleFavorite}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    note.is_favorite
                      ? 'text-amber-500'
                      : 'text-gray-400 hover:text-amber-500 hover:bg-gray-100 dark:hover:bg-gray-800',
                  )}
                >
                  <Star size={18} fill={note.is_favorite ? 'currentColor' : 'none'} />
                </button>
                <button
                  onClick={handleTogglePin}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    note.is_pinned
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-800',
                  )}
                >
                  <Pin size={18} />
                </button>
              </>
            )}

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </header>

        {/* Content area */}
        <div className="flex-1 min-h-0 flex flex-col">

          {/* Note tab */}
          <div className={cn('flex-1 overflow-auto', activeTab !== 'note' && 'hidden')}>
            <div className="max-w-3xl mx-auto px-4 pt-8 pb-12 md:px-10">
              {/* Title area */}
              <div className="mb-6">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Sem título"
                  className="w-full text-3xl font-bold text-gray-900 dark:text-white bg-transparent border-none outline-none placeholder:text-gray-200 dark:placeholder:text-gray-700 leading-tight"
                />
                <div className="mt-3 h-px bg-gradient-to-r from-indigo-300 via-purple-200 to-transparent dark:from-indigo-800 dark:via-purple-900 dark:to-transparent" />
              </div>

              {/* Editor */}
              <div className="bg-white dark:bg-gray-800/80 rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-sm">
                <Editor
                  content={content}
                  onChange={handleContentChange}
                  placeholder="Comece a escrever sua nota de estudo..."
                />
              </div>
            </div>
          </div>

          {/* PDF tab */}
          {activePdfUrl && (
            <div className={cn('flex-1 min-h-0', activeTab !== 'pdf' && 'hidden')}>
              <PdfViewer
                pdfUrl={activePdfUrl}
                initialAnnotations={note?.pdf_annotations ?? []}
                onAnnotationsChange={handleAnnotationsChange}
                onSaveMergedPdf={handleSaveMergedPdf}
              />
            </div>
          )}

          {/* Empty PDF state (no PDF imported yet, in pdf tab) */}
          {!activePdfUrl && activeTab === 'pdf' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-gray-400">
              <FileUp size={40} className="opacity-40" />
              <p className="text-sm">Nenhum PDF importado</p>
              <button
                onClick={handleImportPdf}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Importar PDF
              </button>
            </div>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handlePdfFileChange}
        />
      </div>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Excluir nota"
        description={`Tem certeza que deseja excluir "${title || 'esta nota'}"? Esta ação não pode ser desfeita.`}
        isLoading={isDeleting}
      />
    </div>
  )
}
