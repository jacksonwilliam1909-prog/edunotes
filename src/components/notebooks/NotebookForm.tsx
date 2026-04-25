import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useNotebooks } from '../../hooks/useNotebooks'
import type { Notebook } from '../../types'

const COLORS = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6']
const ICONS = ['📓', '📚', '📖', '📝', '🧪', '🔬', '📐', '🏛️', '💻', '🎨', '🌍', '⚡']

const notebookSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(60),
  color: z.string(),
  icon: z.string(),
})

type NotebookFormData = z.infer<typeof notebookSchema>

interface NotebookFormProps {
  isOpen: boolean
  onClose: () => void
  notebook?: Notebook
}

export function NotebookForm({ isOpen, onClose, notebook }: NotebookFormProps) {
  const { createNotebook, updateNotebook } = useNotebooks()
  const isEditing = !!notebook

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<NotebookFormData>({
    resolver: zodResolver(notebookSchema),
    defaultValues: {
      name: notebook?.name ?? '',
      color: notebook?.color ?? COLORS[0],
      icon: notebook?.icon ?? ICONS[0],
    },
  })

  const selectedColor = watch('color')
  const selectedIcon = watch('icon')

  const onSubmit = async (data: NotebookFormData) => {
    if (isEditing) {
      await updateNotebook(notebook.id, data)
    } else {
      await createNotebook(data)
    }
    reset()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Editar caderno' : 'Novo caderno'}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <Input
          label="Nome do caderno"
          placeholder="Ex: Matemática, Direito Civil..."
          error={errors.name?.message}
          {...register('name')}
        />

        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cor</p>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setValue('color', color)}
                className="w-7 h-7 rounded-full transition-all duration-200"
                style={{
                  backgroundColor: color,
                  outline: selectedColor === color ? `2px solid ${color}` : 'none',
                  outlineOffset: '2px',
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ícone</p>
          <div className="flex gap-2 flex-wrap">
            {ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                onClick={() => setValue('icon', icon)}
                className={`w-9 h-9 rounded-lg text-xl transition-all duration-200 ${
                  selectedIcon === icon
                    ? 'bg-indigo-100 dark:bg-indigo-900 ring-2 ring-indigo-500'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {isEditing ? 'Salvar' : 'Criar caderno'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
