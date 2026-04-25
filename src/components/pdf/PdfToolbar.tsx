import {
  MousePointer2, Pen, Highlighter, Eraser, Undo2, Redo2,
  FilePlus2, Download, FileDown, Loader2, ZoomIn, ZoomOut, Type,
} from 'lucide-react'
import { cn } from '../../lib/utils'

export type PdfTool = 'pointer' | 'pen' | 'highlight' | 'eraser' | 'text'

const PEN_COLORS = [
  { label: 'Azul escuro', value: '#1e3a8a' },
  { label: 'Preto', value: '#111827' },
  { label: 'Vermelho', value: '#dc2626' },
  { label: 'Verde', value: '#16a34a' },
  { label: 'Roxo', value: '#7c3aed' },
]

const HIGHLIGHT_COLORS = [
  { label: 'Amarelo', value: '#fbbf24' },
  { label: 'Verde claro', value: '#4ade80' },
  { label: 'Rosa', value: '#f472b6' },
  { label: 'Azul claro', value: '#38bdf8' },
  { label: 'Laranja', value: '#fb923c' },
  { label: 'Lilás', value: '#c084fc' },
  { label: 'Turquesa', value: '#2dd4bf' },
  { label: 'Vermelho claro', value: '#f87171' },
]

const TEXT_COLORS = [
  { label: 'Preto', value: '#111827' },
  { label: 'Azul', value: '#1e3a8a' },
  { label: 'Vermelho', value: '#dc2626' },
  { label: 'Verde', value: '#16a34a' },
  { label: 'Roxo', value: '#7c3aed' },
]

const PEN_WIDTHS = [
  { label: 'Fina', value: 1.5 },
  { label: 'Média', value: 3 },
  { label: 'Grossa', value: 5 },
]

const HIGHLIGHT_WIDTHS = [
  { label: 'Fino', value: 0.5 },
  { label: 'Médio', value: 1 },
  { label: 'Grosso', value: 2 },
]

const TEXT_SIZES = [
  { label: 'Pequeno', value: 10, display: 'S' },
  { label: 'Médio', value: 14, display: 'M' },
  { label: 'Grande', value: 18, display: 'L' },
  { label: 'Extra grande', value: 24, display: 'XL' },
]

interface ToolBtnProps {
  active?: boolean
  onClick: () => void
  title: string
  disabled?: boolean
  children: React.ReactNode
}

function ToolBtn({ active, onClick, title, disabled, children }: ToolBtnProps) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
        active
          ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
        disabled && 'opacity-30 cursor-not-allowed',
      )}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="w-8 h-px bg-gray-200 dark:bg-gray-700 my-1 mx-auto" />
}

interface PdfToolbarProps {
  activeTool: PdfTool
  onToolChange: (t: PdfTool) => void
  penColor: string
  onPenColorChange: (c: string) => void
  penWidth: number
  onPenWidthChange: (w: number) => void
  highlightColor: string
  onHighlightColorChange: (c: string) => void
  highlightOpacity: number
  onHighlightOpacityChange: (v: number) => void
  highlightWidth: number
  onHighlightWidthChange: (w: number) => void
  textFontSize: number
  onTextFontSizeChange: (size: number) => void
  textColor: string
  onTextColorChange: (c: string) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onMergeRequest: () => void
  onDownload: () => void
  onDownloadAnnotated: () => void
  isMerging: boolean
  scale: number
  onZoomIn: () => void
  onZoomOut: () => void
}

export function PdfToolbar({
  activeTool,
  onToolChange,
  penColor,
  onPenColorChange,
  penWidth,
  onPenWidthChange,
  highlightColor,
  onHighlightColorChange,
  highlightOpacity,
  onHighlightOpacityChange,
  highlightWidth,
  onHighlightWidthChange,
  textFontSize,
  onTextFontSizeChange,
  textColor,
  onTextColorChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onMergeRequest,
  onDownload,
  onDownloadAnnotated,
  isMerging,
  scale,
  onZoomIn,
  onZoomOut,
}: PdfToolbarProps) {
  return (
    <div className="w-14 flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col items-center py-3 gap-0.5 overflow-y-auto">
      {/* Ferramentas principais */}
      <ToolBtn active={activeTool === 'pointer'} onClick={() => onToolChange('pointer')} title="Ponteiro">
        <MousePointer2 size={18} />
      </ToolBtn>
      <ToolBtn active={activeTool === 'pen'} onClick={() => onToolChange('pen')} title="Caneta">
        <Pen size={18} />
      </ToolBtn>
      <ToolBtn active={activeTool === 'highlight'} onClick={() => onToolChange('highlight')} title="Marca-texto">
        <Highlighter size={18} />
      </ToolBtn>
      <ToolBtn active={activeTool === 'eraser'} onClick={() => onToolChange('eraser')} title="Borracha">
        <Eraser size={18} />
      </ToolBtn>
      <ToolBtn active={activeTool === 'text'} onClick={() => onToolChange('text')} title="Caixa de texto">
        <Type size={18} />
      </ToolBtn>

      <Divider />

      {/* Opções da caneta */}
      {activeTool === 'pen' && (
        <>
          {PEN_COLORS.map((c) => (
            <button
              key={c.value}
              title={c.label}
              onClick={() => onPenColorChange(c.value)}
              className={cn(
                'w-6 h-6 rounded-full my-0.5 transition-transform hover:scale-110',
                penColor === c.value && 'ring-2 ring-offset-1 ring-indigo-500 scale-110',
              )}
              style={{ background: c.value }}
            />
          ))}
          <input
            type="color"
            value={penColor}
            onChange={(e) => onPenColorChange(e.target.value)}
            title="Cor personalizada"
            className="w-6 h-6 rounded cursor-pointer my-0.5 border border-gray-200"
            style={{ padding: '1px' }}
          />
          <Divider />
          {PEN_WIDTHS.map((w) => (
            <button
              key={w.value}
              title={w.label}
              onClick={() => onPenWidthChange(w.value)}
              className={cn(
                'w-10 h-8 flex items-center justify-center rounded transition-colors',
                penWidth === w.value
                  ? 'bg-indigo-100 dark:bg-indigo-900'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800',
              )}
            >
              <div
                className="rounded-full bg-gray-700 dark:bg-gray-300"
                style={{ width: `${Math.min(w.value * 5, 28)}px`, height: `${w.value}px` }}
              />
            </button>
          ))}
          <Divider />
        </>
      )}

      {/* Opções do marca-texto */}
      {activeTool === 'highlight' && (
        <>
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.value}
              title={c.label}
              onClick={() => onHighlightColorChange(c.value)}
              className={cn(
                'w-6 h-6 rounded-full my-0.5 transition-transform hover:scale-110',
                highlightColor === c.value && 'ring-2 ring-offset-1 ring-indigo-500 scale-110',
              )}
              style={{ background: c.value }}
            />
          ))}
          <label className="w-6 h-6 rounded-full cursor-pointer border-2 border-gray-400 overflow-hidden" title="Cor personalizada">
            <input
              type="color"
              value={highlightColor}
              onChange={(e) => onHighlightColorChange(e.target.value)}
              className="opacity-0 w-0 h-0"
            />
            <div className="w-full h-full" style={{ background: highlightColor }} />
          </label>

          <Divider />
          {/* Espessura */}
          {HIGHLIGHT_WIDTHS.map((w) => (
            <button
              key={w.value}
              title={w.label}
              onClick={() => onHighlightWidthChange(w.value)}
              className={cn(
                'w-10 h-8 flex items-center justify-center rounded transition-colors',
                highlightWidth === w.value
                  ? 'bg-indigo-100 dark:bg-indigo-900'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800',
              )}
            >
              <div
                className="rounded-full bg-gray-700 dark:bg-gray-300"
                style={{ width: '22px', height: `${w.value * 6}px` }}
              />
            </button>
          ))}
          <Divider />
          {/* Opacidade */}
          <div className="flex flex-col items-center gap-1 w-full px-1" title={`Opacidade: ${Math.round(highlightOpacity * 100)}%`}>
            <span className="text-[9px] text-gray-400 dark:text-gray-500 leading-none">
              {Math.round(highlightOpacity * 100)}%
            </span>
            <input
              type="range"
              min={10}
              max={50}
              step={5}
              value={Math.round(highlightOpacity * 100)}
              onChange={(e) => onHighlightOpacityChange(Number(e.target.value) / 100)}
              className="accent-indigo-500"
              style={{
                writingMode: 'vertical-lr',
                direction: 'rtl',
                height: '72px',
                width: '8px',
                cursor: 'pointer',
              }}
            />
          </div>
          <Divider />
        </>
      )}

      {/* Opções da caixa de texto */}
      {activeTool === 'text' && (
        <>
          {TEXT_COLORS.map((c) => (
            <button
              key={c.value}
              title={c.label}
              onClick={() => onTextColorChange(c.value)}
              className={cn(
                'w-6 h-6 rounded-full my-0.5 transition-transform hover:scale-110',
                textColor === c.value && 'ring-2 ring-offset-1 ring-indigo-500 scale-110',
              )}
              style={{ background: c.value }}
            />
          ))}
          <input
            type="color"
            value={textColor}
            onChange={(e) => onTextColorChange(e.target.value)}
            title="Cor personalizada"
            className="w-6 h-6 rounded cursor-pointer my-0.5 border border-gray-200"
            style={{ padding: '1px' }}
          />
          <Divider />
          {/* Tamanho da fonte */}
          {TEXT_SIZES.map((s) => (
            <button
              key={s.value}
              title={s.label}
              onClick={() => onTextFontSizeChange(s.value)}
              className={cn(
                'w-10 h-8 flex items-center justify-center rounded text-xs font-semibold transition-colors',
                textFontSize === s.value
                  ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
              )}
            >
              {s.display}
            </button>
          ))}
          <Divider />
        </>
      )}

      {/* Desfazer / Refazer */}
      <ToolBtn onClick={onUndo} title="Desfazer (Ctrl+Z)" disabled={!canUndo}>
        <Undo2 size={18} />
      </ToolBtn>
      <ToolBtn onClick={onRedo} title="Refazer (Ctrl+Y)" disabled={!canRedo}>
        <Redo2 size={18} />
      </ToolBtn>

      <Divider />

      {/* Zoom */}
      <ToolBtn onClick={onZoomIn} title="Aumentar zoom" disabled={scale >= 4}>
        <ZoomIn size={18} />
      </ToolBtn>
      <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 leading-none py-0.5">
        {Math.round(scale * 100)}%
      </span>
      <ToolBtn onClick={onZoomOut} title="Diminuir zoom" disabled={scale <= 0.5}>
        <ZoomOut size={18} />
      </ToolBtn>

      <Divider />

      {/* Ações de PDF */}
      <ToolBtn onClick={onMergeRequest} title="Inserir páginas de outro PDF" disabled={isMerging}>
        {isMerging ? <Loader2 size={18} className="animate-spin" /> : <FilePlus2 size={18} />}
      </ToolBtn>
      <ToolBtn onClick={onDownload} title="Baixar PDF original">
        <Download size={18} />
      </ToolBtn>
      <ToolBtn onClick={onDownloadAnnotated} title="Baixar PDF com anotações">
        <FileDown size={18} />
      </ToolBtn>
    </div>
  )
}
