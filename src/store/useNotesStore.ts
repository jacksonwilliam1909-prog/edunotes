import { create } from 'zustand'
import type { Note, Notebook } from '../types'

interface NotesState {
  notes: Note[]
  notebooks: Notebook[]
  activeNotebookId: string | null
  setNotes: (notes: Note[]) => void
  setNotebooks: (notebooks: Notebook[]) => void
  setActiveNotebook: (id: string | null) => void
  upsertNote: (note: Note) => void
  removeNote: (id: string) => void
  upsertNotebook: (notebook: Notebook) => void
  removeNotebook: (id: string) => void
}

export const useNotesStore = create<NotesState>((set) => ({
  notes: [],
  notebooks: [],
  activeNotebookId: null,

  setNotes: (notes) => set({ notes }),
  setNotebooks: (notebooks) => set({ notebooks }),
  setActiveNotebook: (activeNotebookId) => set({ activeNotebookId }),

  upsertNote: (note) =>
    set((state) => {
      const idx = state.notes.findIndex((n) => n.id === note.id)
      if (idx >= 0) {
        const updated = [...state.notes]
        updated[idx] = note
        return { notes: updated }
      }
      return { notes: [note, ...state.notes] }
    }),

  removeNote: (id) =>
    set((state) => ({ notes: state.notes.filter((n) => n.id !== id) })),

  upsertNotebook: (notebook) =>
    set((state) => {
      const idx = state.notebooks.findIndex((n) => n.id === notebook.id)
      if (idx >= 0) {
        const updated = [...state.notebooks]
        updated[idx] = notebook
        return { notebooks: updated }
      }
      return { notebooks: [notebook, ...state.notebooks] }
    }),

  removeNotebook: (id) =>
    set((state) => ({ notebooks: state.notebooks.filter((n) => n.id !== id) })),
}))
