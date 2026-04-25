import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelativeDate(dateString: string): string {
  return formatDistanceToNow(new Date(dateString), {
    addSuffix: true,
    locale: ptBR,
  })
}

export function formatDate(dateString: string): string {
  return format(new Date(dateString), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

export function extractTextFromTiptap(content: Record<string, unknown>): string {
  if (!content || !content.content) return ''
  const nodes = content.content as Array<Record<string, unknown>>
  return nodes
    .flatMap((node) => {
      if (node.type === 'paragraph' && node.content) {
        const textNodes = node.content as Array<{ type: string; text?: string }>
        return textNodes.map((t) => t.text ?? '')
      }
      return []
    })
    .join(' ')
    .trim()
}
