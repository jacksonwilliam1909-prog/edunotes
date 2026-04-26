import { useRef, useEffect, useState, useCallback, useReducer } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { PDFDocument } from 'pdf-lib'
import { toast } from 'sonner'
import { Search, ChevronUp, ChevronDown, X, Loader2 } from 'lucide-react'
import { PdfToolbar } from './PdfToolbar'
import type { PdfTool } from './PdfToolbar'
import type { PdfStroke, PdfTextBox, PdfAnnotation } from '../../types'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href

// ── Shape detection helpers ──────────────────────────────────────────────────

function detectShape(
  points: [number, number][],
): 'circle' | 'rectangle' | 'triangle' | 'line' {
  if (points.length < 10) return 'line'

  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const w = maxX - minX, h = maxY - minY

  if (w < 20 || h < 20) return 'line'

  const first = points[0], last = points[points.length - 1]
  const distStartEnd = Math.hypot(first[0] - last[0], first[1] - last[1])
  const diagonal = Math.hypot(w, h)

  if (distStartEnd > diagonal * 0.4) return 'line'

  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const dists = points.map((p) => Math.hypot(p[0] - cx, p[1] - cy))
  const meanDist = dists.reduce((a, b) => a + b, 0) / dists.length
  const variance = dists.reduce((a, b) => a + (b - meanDist) ** 2, 0) / dists.length
  const cv = Math.sqrt(variance) / meanDist

  if (cv < 0.22 && Math.abs(w - h) / Math.max(w, h) < 0.45) return 'circle'

  const margin = Math.max(w, h) * 0.2
  const total = points.length
  const nearTop = points.filter((p) => p[1] - minY < margin).length
  const nearBottom = points.filter((p) => maxY - p[1] < margin).length
  const nearLeft = points.filter((p) => p[0] - minX < margin).length
  const nearRight = points.filter((p) => maxX - p[0] < margin).length

  if (
    nearTop > total * 0.1 &&
    nearBottom > total * 0.1 &&
    nearLeft > total * 0.1 &&
    nearRight > total * 0.1
  ) return 'rectangle'

  return 'triangle'
}

function shapeToPoints(
  shape: 'circle' | 'rectangle' | 'triangle',
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
): [number, number][] {
  const { minX, minY, maxX, maxY } = bbox
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2

  if (shape === 'circle') {
    const r = (maxX - minX + maxY - minY) / 4
    const n = 64
    return Array.from({ length: n + 1 }, (_, i) => {
      const angle = (i / n) * Math.PI * 2
      return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as [number, number]
    })
  }
  if (shape === 'rectangle') {
    return [
      [minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY],
    ]
  }
  return [[cx, minY], [maxX, maxY], [minX, maxY], [cx, minY]]
}

// ── Pure canvas helpers ──────────────────────────────────────────────────────

const RELATIVE_POINT_TOLERANCE = 0.05
const MAX_RELATIVE_STROKE_WIDTH = 0.1

function isRelativePoint(point: [number, number]) {
  const [x, y] = point
  return (
    x >= -RELATIVE_POINT_TOLERANCE &&
    x <= 1 + RELATIVE_POINT_TOLERANCE &&
    y >= -RELATIVE_POINT_TOLERANCE &&
    y <= 1 + RELATIVE_POINT_TOLERANCE
  )
}

function isRelativeStroke(stroke: PdfStroke) {
  if (stroke.coordinateSpace === 'relative') return true
  if (stroke.width > MAX_RELATIVE_STROKE_WIDTH) return false
  return stroke.points.every(isRelativePoint)
}

function toCanvasPoint(
  canvas: HTMLCanvasElement,
  stroke: PdfStroke,
  point: [number, number],
): [number, number] {
  if (!isRelativeStroke(stroke)) return point
  return [point[0] * canvas.width, point[1] * canvas.height]
}

function toRelativePoint(canvas: HTMLCanvasElement, point: [number, number]): [number, number] {
  return [
    point[0] / Math.max(canvas.width, 1),
    point[1] / Math.max(canvas.height, 1),
  ]
}

function getStrokeBaseWidth(canvas: HTMLCanvasElement, stroke: PdfStroke) {
  if (!isRelativeStroke(stroke)) return stroke.width
  return stroke.width * canvas.width
}

function applyStrokeStyle(ctx: CanvasRenderingContext2D, stroke: PdfStroke) {
  const baseWidth = getStrokeBaseWidth(ctx.canvas, stroke)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0,0,0,1)'
    ctx.lineWidth = baseWidth * 10
  } else if (stroke.tool === 'highlight') {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = baseWidth * 14
    ctx.globalAlpha = stroke.opacity ?? 0.8
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = baseWidth
  }
}

function normalizeStrokeForCanvas(stroke: PdfStroke, canvas: HTMLCanvasElement): PdfStroke {
  if (stroke.coordinateSpace === 'relative') return stroke
  if (isRelativeStroke(stroke)) return { ...stroke, coordinateSpace: 'relative' }
  return {
    ...stroke,
    coordinateSpace: 'relative',
    width: stroke.width / Math.max(canvas.width, 1),
    points: stroke.points.map((point) => toRelativePoint(canvas, point)),
  }
}

function syncCanvasSize(canvas: HTMLCanvasElement, width: number, height: number) {
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: PdfStroke) {
  if (stroke.points.length < 2) return
  ctx.save()
  applyStrokeStyle(ctx, stroke)
  ctx.beginPath()

  const firstPoint = toCanvasPoint(ctx.canvas, stroke, stroke.points[0])
  ctx.moveTo(firstPoint[0], firstPoint[1])
  for (let i = 1; i < stroke.points.length; i++) {
    const point = toCanvasPoint(ctx.canvas, stroke, stroke.points[i])
    ctx.lineTo(point[0], point[1])
  }
  ctx.stroke()
  ctx.restore()
}

function drawStrokeSegment(
  ctx: CanvasRenderingContext2D,
  stroke: PdfStroke,
  from: [number, number],
  to: [number, number],
) {
  ctx.save()
  applyStrokeStyle(ctx, stroke)
  ctx.beginPath()
  const fromPoint = toCanvasPoint(ctx.canvas, stroke, from)
  const toPoint = toCanvasPoint(ctx.canvas, stroke, to)
  ctx.moveTo(fromPoint[0], fromPoint[1])
  ctx.lineTo(toPoint[0], toPoint[1])
  ctx.stroke()
  ctx.restore()
}

function redrawPage(canvas: HTMLCanvasElement, pageNum: number, strokes: PdfStroke[]) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  strokes.filter((s) => s.page === pageNum).forEach((s) => drawStroke(ctx, s))
}

// ── Undo/redo reducer ────────────────────────────────────────────────────────

type AnnotState = {
  strokes: PdfStroke[]
  past: PdfStroke[][]
  future: PdfStroke[][]
}
type AnnotAction =
  | { type: 'ADD'; stroke: PdfStroke }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESET'; strokes: PdfStroke[] }

function annotReducer(s: AnnotState, a: AnnotAction): AnnotState {
  switch (a.type) {
    case 'ADD':
      return { strokes: [...s.strokes, a.stroke], past: [...s.past, s.strokes], future: [] }
    case 'UNDO':
      if (!s.past.length) return s
      return {
        strokes: s.past[s.past.length - 1],
        past: s.past.slice(0, -1),
        future: [s.strokes, ...s.future],
      }
    case 'REDO':
      if (!s.future.length) return s
      return {
        strokes: s.future[0],
        past: [...s.past, s.strokes],
        future: s.future.slice(1),
      }
    case 'RESET':
      return { strokes: a.strokes, past: [], future: [] }
  }
}

// ── Search types ─────────────────────────────────────────────────────────────

type SearchMatch = {
  page: number
  rects: { x: number; y: number; width: number; height: number }[]
}

// ── TextBoxOverlay ───────────────────────────────────────────────────────────

interface TextBoxOverlayProps {
  box: PdfTextBox
  getPageRect: () => DOMRect | null
  onUpdate: (id: string, updates: Partial<Omit<PdfTextBox, 'id' | 'tool' | 'page'>>) => void
  onDelete: (id: string) => void
}

function TextBoxOverlay({ box, getPageRect, onUpdate, onDelete }: TextBoxOverlayProps) {
  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const origX = box.x
    const origY = box.y

    const onMove = (ev: MouseEvent) => {
      const rect = getPageRect()
      if (!rect) return
      const dx = (ev.clientX - startX) / rect.width
      const dy = (ev.clientY - startY) / rect.height
      onUpdate(box.id, {
        x: Math.max(0, Math.min(1 - box.width, origX + dx)),
        y: Math.max(0, origY + dy),
      })
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const origW = box.width
    const origH = box.height

    const onMove = (ev: MouseEvent) => {
      const rect = getPageRect()
      if (!rect) return
      const dw = (ev.clientX - startX) / rect.width
      const dh = (ev.clientY - startY) / rect.height
      onUpdate(box.id, {
        width: Math.max(0.08, origW + dw),
        height: Math.max(0.03, origH + dh),
      })
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: `${box.width * 100}%`,
        minHeight: `${box.height * 100}%`,
        zIndex: 20,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Drag handle */}
      <div
        style={{ cursor: 'move', userSelect: 'none' }}
        className="flex items-center justify-between px-1.5 bg-indigo-500 rounded-t"
        onMouseDown={handleDragStart}
        title="Arrastar"
      >
        <span className="text-white text-[10px] leading-4 pointer-events-none">⠿</span>
        <button
          className="text-white/80 hover:text-white text-xs leading-4 font-bold"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(box.id)}
          title="Excluir caixa"
        >
          ×
        </button>
      </div>

      {/* Text content */}
      <div style={{ position: 'relative' }}>
        <textarea
          value={box.content}
          onChange={(e) => onUpdate(box.id, { content: e.target.value })}
          placeholder="Digite aqui..."
          style={{
            width: '100%',
            minHeight: '36px',
            resize: 'none',
            border: '1.5px solid #6366f1',
            borderTop: 'none',
            borderRadius: '0 0 4px 4px',
            outline: 'none',
            background: 'rgba(255,255,255,0.93)',
            fontSize: `${box.fontSize}px`,
            color: box.color,
            padding: '4px 24px 4px 6px',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            lineHeight: '1.4',
          }}
          rows={2}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        />
        {/* Resize handle */}
        <div
          onMouseDown={handleResizeStart}
          title="Redimensionar"
          style={{
            position: 'absolute',
            bottom: 2,
            right: 2,
            width: 14,
            height: 14,
            cursor: 'se-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" style={{ pointerEvents: 'none' }}>
            <line x1="3" y1="9" x2="9" y2="3" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="6" y1="9" x2="9" y2="6" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

interface PdfViewerProps {
  pdfUrl: string
  initialAnnotations: PdfAnnotation[]
  onAnnotationsChange: (annotations: PdfAnnotation[]) => void
  onSaveMergedPdf?: (bytes: Uint8Array) => Promise<void>
}

export function PdfViewer({
  pdfUrl,
  initialAnnotations,
  onAnnotationsChange,
  onSaveMergedPdf,
}: PdfViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  // requestedScale: what the user wants (changes instantly)
  // renderScale: what the canvases are actually rendered at (changes after 300ms debounce)
  const [requestedScale, setRequestedScale] = useState(1.5)
  const [renderScale, setRenderScale] = useState(1.5)

  const [activeTool, setActiveTool] = useState<PdfTool>('pointer')
  const [penColor, setPenColor] = useState('#1e3a8a')
  const [penWidth, setPenWidth] = useState(2)
  const [highlightColor, setHighlightColor] = useState('#fbbf24')
  const [highlightOpacity, setHighlightOpacity] = useState(1.0)
  const [highlightWidth, setHighlightWidth] = useState(0.5)
  const [textFontSize, setTextFontSize] = useState(14)
  const [textColor, setTextColor] = useState('#111827')

  // Merged PDF support
  const [mergedBlobUrl, setMergedBlobUrl] = useState<string | null>(null)
  const [isMerging, setIsMerging] = useState(false)
  const mergedBlobUrlRef = useRef<string | null>(null)
  const mergeInputRef = useRef<HTMLInputElement>(null)

  const effectivePdfUrl = mergedBlobUrl ?? pdfUrl

  const [textBoxes, setTextBoxes] = useState<PdfTextBox[]>(
    initialAnnotations.filter((a): a is PdfTextBox => a.tool === 'text'),
  )

  const [annot, dispatch] = useReducer(annotReducer, {
    strokes: initialAnnotations.filter((a): a is PdfStroke => a.tool !== 'text'),
    past: [],
    future: [],
  })

  // Page navigation state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageInputValue, setPageInputValue] = useState('1')

  // Search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1)
  const [isSearching, setIsSearching] = useState(false)

  const pdfCanvases = useRef<(HTMLCanvasElement | null)[]>([])
  const annotCanvases = useRef<(HTMLCanvasElement | null)[]>([])
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
  const isDrawing = useRef(false)
  const liveStroke = useRef<PdfStroke | null>(null)
  const latestStrokes = useRef(
    initialAnnotations.filter((a): a is PdfStroke => a.tool !== 'text'),
  )
  const straightenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isStraightenedRef = useRef(false)

  // Navigation & search refs
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pageInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchAbortRef = useRef(false)

  useEffect(() => {
    return () => {
      if (mergedBlobUrlRef.current) URL.revokeObjectURL(mergedBlobUrlRef.current)
    }
  }, [])

  useEffect(() => {
    latestStrokes.current = annot.strokes
    onAnnotationsChange([...annot.strokes, ...textBoxes])
  }, [annot.strokes, textBoxes, onAnnotationsChange])

  const normalizeLegacyStrokesForPage = useCallback((pageNum: number, canvas: HTMLCanvasElement) => {
    let changed = false
    const normalized = latestStrokes.current.map((stroke) => {
      if (stroke.page !== pageNum || stroke.coordinateSpace === 'relative') return stroke
      const nextStroke = normalizeStrokeForCanvas(stroke, canvas)
      if (nextStroke !== stroke) changed = true
      return nextStroke
    })

    if (changed) {
      latestStrokes.current = normalized
      dispatch({ type: 'RESET', strokes: normalized })
    }

    return normalized
  }, [])

  // ── PDF loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const task = pdfjsLib.getDocument(effectivePdfUrl)
    task.promise.then((doc) => {
      if (!cancelled) {
        setPdfDoc(doc)
        setNumPages(doc.numPages)
      }
    })
    return () => { cancelled = true }
  }, [effectivePdfUrl])

  // ── Page rendering ───────────────────────────────────────────────────────
  const renderPdfPage = useCallback(
    async (pageNum: number) => {
      if (!pdfDoc) return
      const pdfCanvas = pdfCanvases.current[pageNum - 1]
      const annotCanvas = annotCanvases.current[pageNum - 1]
      if (!pdfCanvas || !annotCanvas) return

      const page = await pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale: renderScale })
      const canvasWidth = Math.max(1, Math.round(viewport.width))
      const canvasHeight = Math.max(1, Math.round(viewport.height))
      const pageEl = pageRefs.current[pageNum - 1]

      if (pageEl) {
        pageEl.style.width = `${canvasWidth}px`
        pageEl.style.height = `${canvasHeight}px`
      }

      syncCanvasSize(pdfCanvas, canvasWidth, canvasHeight)
      syncCanvasSize(annotCanvas, canvasWidth, canvasHeight)

      const ctx = pdfCanvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height)
      await page.render({ canvasContext: ctx, viewport, canvas: pdfCanvas }).promise

      const strokes = normalizeLegacyStrokesForPage(pageNum, annotCanvas)
      redrawPage(annotCanvas, pageNum, strokes)
    },
    [pdfDoc, renderScale, normalizeLegacyStrokesForPage],
  )

  useEffect(() => {
    if (!pdfDoc || numPages === 0) return
    const container = scrollContainerRef.current
    // Render visible pages first to minimize flash during zoom re-render
    const visible: number[] = []
    const rest: number[] = []
    for (let i = 1; i <= numPages; i++) {
      const ref = pageRefs.current[i - 1]
      if (ref && container) {
        const r = ref.getBoundingClientRect()
        const c = container.getBoundingClientRect()
        if (r.bottom >= c.top && r.top <= c.bottom) visible.push(i)
        else rest.push(i)
      } else {
        rest.push(i)
      }
    }
    ;[...visible, ...rest].forEach((i) => renderPdfPage(i))
  }, [pdfDoc, numPages, renderPdfPage])

  useEffect(() => {
    for (let i = 1; i <= numPages; i++) {
      const canvas = annotCanvases.current[i - 1]
      if (canvas && canvas.width > 0) redrawPage(canvas, i, annot.strokes)
    }
  }, [annot.strokes, numPages])

  // ── Zoom handlers ────────────────────────────────────────────────────────
  const handleZoomIn = useCallback(
    () => setRequestedScale((s) => Math.min(parseFloat((s + 0.25).toFixed(2)), 4.0)),
    [],
  )
  const handleZoomOut = useCallback(
    () => setRequestedScale((s) => Math.max(parseFloat((s - 0.25).toFixed(2)), 0.5)),
    [],
  )

  // ── Debounce: re-render canvases 300ms after zoom stabilises ─────────────
  useEffect(() => {
    const timer = setTimeout(() => setRenderScale(requestedScale), 300)
    return () => clearTimeout(timer)
  }, [requestedScale])

  // ── Ctrl+Scroll zoom ─────────────────────────────────────────────────────
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const delta = e.deltaY < 0 ? 0.1 : -0.1
      setRequestedScale((s) => Math.min(4.0, Math.max(0.5, parseFloat((s + delta).toFixed(2)))))
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [])

  // ── Page tracking via scroll ─────────────────────────────────────────────
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || !numPages) return

    const update = () => {
      if (document.activeElement === pageInputRef.current) return
      const containerRect = container.getBoundingClientRect()
      const containerMid = containerRect.top + containerRect.height / 2
      let best = 0
      let bestDist = Infinity
      pageRefs.current.slice(0, numPages).forEach((ref, idx) => {
        if (!ref) return
        const rect = ref.getBoundingClientRect()
        const pageMid = rect.top + rect.height / 2
        const dist = Math.abs(pageMid - containerMid)
        if (dist < bestDist) { bestDist = dist; best = idx }
      })
      const newPage = best + 1
      setCurrentPage(newPage)
      setPageInputValue(String(newPage))
    }

    container.addEventListener('scroll', update, { passive: true })
    update()
    return () => container.removeEventListener('scroll', update)
  }, [numPages])

  // ── Clear search immediately when user starts zooming ───────────────────
  useEffect(() => {
    searchAbortRef.current = true
    const timer = window.setTimeout(() => {
      setSearchMatches([])
      setCurrentMatchIndex(-1)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [requestedScale])

  // ── Navigation helpers ───────────────────────────────────────────────────
  const scrollToPage = useCallback((page: number) => {
    const container = scrollContainerRef.current
    const pageEl = pageRefs.current[page - 1]
    if (!container || !pageEl) return
    const containerRect = container.getBoundingClientRect()
    const pageRect = pageEl.getBoundingClientRect()
    container.scrollTop += pageRect.top - containerRect.top - 24
  }, [])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchMatches([])
    setCurrentMatchIndex(-1)
  }, [])

  const goToMatch = useCallback((idx: number) => {
    if (searchMatches.length === 0) return
    const newIdx = ((idx % searchMatches.length) + searchMatches.length) % searchMatches.length
    setCurrentMatchIndex(newIdx)
    scrollToPage(searchMatches[newIdx].page)
  }, [searchMatches, scrollToPage])

  const runSearch = useCallback(async () => {
    if (!pdfDoc || !searchQuery.trim()) {
      setSearchMatches([])
      setCurrentMatchIndex(-1)
      return
    }

    searchAbortRef.current = false
    setIsSearching(true)
    const matches: SearchMatch[] = []
    const queryLower = searchQuery.toLowerCase()

    try {
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        if (searchAbortRef.current) break

        const page = await pdfDoc.getPage(pageNum)
        const viewport = page.getViewport({ scale: renderScale })
        const textContent = await page.getTextContent()

        // Build character map for this page
        type ItemInfo = {
          str: string
          charOffset: number
          transform: number[]
          width: number
          height: number
        }
        const items: ItemInfo[] = []
        let pageText = ''

        for (const rawItem of textContent.items) {
          if (!('str' in rawItem)) continue
          const item = rawItem as { str: string; transform: number[]; width: number; height: number }
          if (!item.str) continue
          items.push({
            str: item.str,
            charOffset: pageText.length,
            transform: item.transform,
            width: item.width,
            height: item.height,
          })
          pageText += item.str
        }

        // Find all occurrences of the query in the page text
        const pageTextLower = pageText.toLowerCase()
        let offset = 0

        while (offset < pageTextLower.length) {
          if (searchAbortRef.current) break
          const matchStart = pageTextLower.indexOf(queryLower, offset)
          if (matchStart === -1) break

          const matchEnd = matchStart + queryLower.length
          const overlapping = items.filter(
            (it) => it.charOffset < matchEnd && it.charOffset + it.str.length > matchStart,
          )

          const rects: SearchMatch['rects'] = []
          for (const it of overlapping) {
            const [, , , , tx, ty] = it.transform
            // Use item.height if valid, fall back to font size from transform matrix
            const itemH = it.height > 0
              ? it.height
              : (Math.abs(it.transform[3]) || Math.abs(it.transform[0]) || 12)

            const [x1, vy1] = viewport.convertToViewportPoint(tx, ty)
            const [x2, vy2] = viewport.convertToViewportPoint(tx + it.width, ty + itemH)

            rects.push({
              x: Math.min(x1, x2),
              y: Math.min(vy1, vy2),
              width: Math.abs(x2 - x1),
              height: Math.abs(vy2 - vy1) + 2,
            })
          }

          if (rects.length > 0) matches.push({ page: pageNum, rects })
          offset = matchStart + 1
        }
      }

      if (!searchAbortRef.current) {
        setSearchMatches(matches)
        setCurrentMatchIndex(matches.length > 0 ? 0 : -1)
        if (matches.length > 0) scrollToPage(matches[0].page)
      }
    } catch (err) {
      console.error(err)
      if (!searchAbortRef.current) toast.error('Erro na busca')
    } finally {
      setIsSearching(false)
    }
  }, [pdfDoc, searchQuery, numPages, renderScale, scrollToPage])

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(true)
        setTimeout(() => searchInputRef.current?.focus(), 50)
      }
      if (e.key === 'Escape' && searchOpen) {
        closeSearch()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [searchOpen, closeSearch])

  // ── Drawing helpers ──────────────────────────────────────────────────────
  const toPageCoords = (
    e: React.MouseEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement,
  ): [number, number] => {
    const rect = canvas.getBoundingClientRect()
    return [
      (e.clientX - rect.left) / rect.width,
      (e.clientY - rect.top) / rect.height,
    ]
  }

  const toRelativeStrokeWidth = (width: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    return width / Math.max(rect.width, 1)
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>, page: number) => {
    if (activeTool === 'pointer' || activeTool === 'text') return
    const canvas = annotCanvases.current[page - 1]
    if (!canvas) return

    isStraightenedRef.current = false
    isDrawing.current = true
    const baseWidth = activeTool === 'highlight' ? highlightWidth : penWidth
    liveStroke.current = {
      id: crypto.randomUUID(),
      tool: activeTool,
      color: activeTool === 'highlight' ? highlightColor : activeTool === 'eraser' ? '' : penColor,
      coordinateSpace: 'relative',
      width: toRelativeStrokeWidth(baseWidth, canvas),
      page,
      points: [toPageCoords(e, canvas)],
      opacity: activeTool === 'highlight' ? highlightOpacity : undefined,
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>, page: number) => {
    if (!isDrawing.current || !liveStroke.current) return
    const canvas = annotCanvases.current[page - 1]
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const point = toPageCoords(e, canvas)
    const pts = liveStroke.current.points
    liveStroke.current = { ...liveStroke.current, points: [...pts, point] }

    if (pts.length >= 1) {
      const stroke = liveStroke.current

      if (stroke.tool === 'highlight') {
        redrawPage(canvas, page, latestStrokes.current)
        drawStroke(ctx, stroke)
      } else {
        drawStrokeSegment(ctx, stroke, pts[pts.length - 1], point)
      }
    }

    if (activeTool === 'pen' || activeTool === 'highlight') {
      if (isStraightenedRef.current) {
        isStraightenedRef.current = false
      }
      if (straightenTimerRef.current) clearTimeout(straightenTimerRef.current)
      straightenTimerRef.current = setTimeout(() => {
        if (!isDrawing.current || !liveStroke.current) return
        const strokePage = liveStroke.current.page
        const annotCanvas = annotCanvases.current[strokePage - 1]
        if (!annotCanvas) return
        const strokeCtx = annotCanvas.getContext('2d')
        if (!strokeCtx) return

        const strokePts = liveStroke.current.points.map((point) =>
          toCanvasPoint(annotCanvas, liveStroke.current as PdfStroke, point),
        )
        if (strokePts.length < 2) return

        const xs = strokePts.map((p) => p[0])
        const ys = strokePts.map((p) => p[1])
        const bbox = {
          minX: Math.min(...xs), minY: Math.min(...ys),
          maxX: Math.max(...xs), maxY: Math.max(...ys),
        }

        const detectedShape = detectShape(strokePts)
        const correctedCanvasPoints =
          detectedShape === 'line'
            ? [strokePts[0], strokePts[strokePts.length - 1]]
            : shapeToPoints(detectedShape, bbox)
        const correctedPoints = correctedCanvasPoints.map((point) =>
          toRelativePoint(annotCanvas, point),
        )

        liveStroke.current = { ...liveStroke.current, points: correctedPoints }
        isStraightenedRef.current = true

        redrawPage(annotCanvas, strokePage, latestStrokes.current)
        drawStroke(strokeCtx, liveStroke.current)
      }, 500)
    }
  }

  const handleMouseUp = () => {
    if (straightenTimerRef.current) clearTimeout(straightenTimerRef.current)
    isStraightenedRef.current = false

    if (!isDrawing.current || !liveStroke.current) return
    isDrawing.current = false
    if (liveStroke.current.points.length > 1) {
      dispatch({ type: 'ADD', stroke: liveStroke.current })
    }
    liveStroke.current = null
  }

  // ── Text box placement on canvas click ───────────────────────────────────
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>, page: number) => {
    if (activeTool !== 'text') return
    const canvas = annotCanvases.current[page - 1]
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const xNorm = (e.clientX - rect.left) / rect.width
    const yNorm = (e.clientY - rect.top) / rect.height
    setTextBoxes((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        tool: 'text' as const,
        page,
        x: xNorm,
        y: yNorm,
        width: 0.3,
        height: 0.1,
        content: '',
        fontSize: textFontSize,
        color: textColor,
      },
    ])
  }

  const updateTextBox = useCallback(
    (id: string, updates: Partial<Omit<PdfTextBox, 'id' | 'tool' | 'page'>>) => {
      setTextBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)))
    },
    [],
  )

  const deleteTextBox = useCallback((id: string) => {
    setTextBoxes((prev) => prev.filter((b) => b.id !== id))
  }, [])

  // ── Mesclar PDF ─────────────────────────────────────────────────────────
  const handleMergeFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (mergeInputRef.current) mergeInputRef.current.value = ''

    setIsMerging(true)
    try {
      const [currentBuffer, newBuffer] = await Promise.all([
        fetch(effectivePdfUrl).then((r) => r.arrayBuffer()),
        file.arrayBuffer(),
      ])

      const pdfA = await PDFDocument.load(currentBuffer)
      const pdfB = await PDFDocument.load(newBuffer)

      const copiedPages = await pdfA.copyPages(pdfB, pdfB.getPageIndices())
      copiedPages.forEach((p) => pdfA.addPage(p))

      const mergedBytes = await pdfA.save()
      const blob = new Blob([mergedBytes as BlobPart], { type: 'application/pdf' })

      if (mergedBlobUrlRef.current) URL.revokeObjectURL(mergedBlobUrlRef.current)
      const newUrl = URL.createObjectURL(blob)
      mergedBlobUrlRef.current = newUrl
      setMergedBlobUrl(newUrl)

      await onSaveMergedPdf?.(mergedBytes)
      toast.success('Páginas inseridas com sucesso')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao mesclar PDFs')
    } finally {
      setIsMerging(false)
    }
  }

  // ── Baixar PDF original ──────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    try {
      let blobUrl: string
      let shouldRevoke = false

      if (mergedBlobUrl) {
        blobUrl = mergedBlobUrl
      } else {
        const response = await fetch(pdfUrl)
        const blob = await response.blob()
        blobUrl = URL.createObjectURL(blob)
        shouldRevoke = true
      }

      const a = document.createElement('a')
      a.href = blobUrl
      a.download = 'documento.pdf'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      if (shouldRevoke) URL.revokeObjectURL(blobUrl)
    } catch {
      toast.error('Erro ao baixar PDF')
    }
  }, [mergedBlobUrl, pdfUrl])

  // ── Baixar PDF com anotações ─────────────────────────────────────────────
  const handleDownloadAnnotated = useCallback(async () => {
    if (!pdfDoc) {
      toast.error('PDF não carregado')
      return
    }
    try {
      const response = await fetch(effectivePdfUrl)
      const pdfBytes = await response.arrayBuffer()
      const pdfLibDoc = await PDFDocument.load(pdfBytes)

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const annotCanvas = annotCanvases.current[pageNum - 1]
        if (!annotCanvas || annotCanvas.width === 0) continue
        if (!annot.strokes.some((s) => s.page === pageNum)) continue

        const dataUrl = annotCanvas.toDataURL('image/png')
        const pngBytes = Uint8Array.from(
          atob(dataUrl.split(',')[1]),
          (c) => c.charCodeAt(0),
        )
        const pngImage = await pdfLibDoc.embedPng(pngBytes)
        const page = pdfLibDoc.getPage(pageNum - 1)
        const { width, height } = page.getSize()
        page.drawImage(pngImage, { x: 0, y: 0, width, height })
      }

      const savedBytes = await pdfLibDoc.save()
      const blob = new Blob([savedBytes as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'documento_anotado.pdf'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao gerar PDF com anotações')
    }
  }, [pdfDoc, numPages, effectivePdfUrl, annot.strokes])

  const cursorStyle = (tool: PdfTool) => {
    if (tool === 'eraser') return 'cell'
    if (tool === 'pointer') return 'default'
    if (tool === 'text') return 'text'
    return 'crosshair'
  }

  return (
    <div className="flex h-full overflow-hidden">
      <PdfToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        penColor={penColor}
        onPenColorChange={setPenColor}
        penWidth={penWidth}
        onPenWidthChange={setPenWidth}
        highlightColor={highlightColor}
        onHighlightColorChange={setHighlightColor}
        highlightOpacity={highlightOpacity}
        onHighlightOpacityChange={setHighlightOpacity}
        highlightWidth={highlightWidth}
        onHighlightWidthChange={setHighlightWidth}
        textFontSize={textFontSize}
        onTextFontSizeChange={setTextFontSize}
        textColor={textColor}
        onTextColorChange={setTextColor}
        onUndo={() => dispatch({ type: 'UNDO' })}
        onRedo={() => dispatch({ type: 'REDO' })}
        canUndo={annot.past.length > 0}
        canRedo={annot.future.length > 0}
        onMergeRequest={() => mergeInputRef.current?.click()}
        onDownload={handleDownload}
        onDownloadAnnotated={handleDownloadAnnotated}
        isMerging={isMerging}
        scale={requestedScale}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        searchOpen={searchOpen}
        onToggleSearch={() => {
          if (!searchOpen) {
            setSearchOpen(true)
            setTimeout(() => searchInputRef.current?.focus(), 50)
          } else {
            closeSearch()
          }
        }}
      />

      <input
        ref={mergeInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleMergeFileChange}
      />

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* ── Navigation top bar ── */}
        <div className="flex items-center gap-3 px-3 py-1.5 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          {/* Page indicator */}
          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
            <span className="text-xs">Página</span>
            <input
              ref={pageInputRef}
              type="text"
              inputMode="numeric"
              value={pageInputValue}
              onChange={(e) => setPageInputValue(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const page = parseInt(pageInputValue)
                  if (page >= 1 && page <= numPages) {
                    scrollToPage(page)
                    ;(e.target as HTMLInputElement).blur()
                  } else {
                    setPageInputValue(String(currentPage))
                  }
                } else if (e.key === 'Escape') {
                  setPageInputValue(String(currentPage))
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
              onFocus={(e) => e.target.select()}
              onBlur={() => setPageInputValue(String(currentPage))}
              className="w-12 text-center border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs font-medium text-gray-900 dark:text-gray-100"
            />
            <span className="text-xs">de {numPages || '–'}</span>
          </div>

          <div className="flex-1" />

          {/* Search bar */}
          {searchOpen ? (
            <div className="flex items-center gap-1.5">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runSearch()
                  if (e.key === 'Escape') closeSearch()
                }}
                placeholder="Buscar no PDF..."
                className="w-52 border border-gray-300 dark:border-gray-600 rounded px-2.5 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />

              <button
                onClick={runSearch}
                disabled={isSearching || !searchQuery.trim()}
                title="Buscar"
                className="px-2 py-1 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSearching ? <Loader2 size={12} className="animate-spin" /> : 'Buscar'}
              </button>

              {searchQuery && !isSearching && (
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap flex-shrink-0 min-w-[72px]">
                  {searchMatches.length === 0
                    ? 'Sem resultados'
                    : `${currentMatchIndex + 1} / ${searchMatches.length}`}
                </span>
              )}

              <button
                onClick={() => goToMatch(currentMatchIndex - 1)}
                disabled={searchMatches.length === 0}
                title="Resultado anterior (Shift+Enter)"
                className="p-1 rounded text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={() => goToMatch(currentMatchIndex + 1)}
                disabled={searchMatches.length === 0}
                title="Próximo resultado (Enter)"
                className="p-1 rounded text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronDown size={14} />
              </button>
              <button
                onClick={closeSearch}
                title="Fechar busca (ESC)"
                className="p-1 rounded text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setSearchOpen(true)
                setTimeout(() => searchInputRef.current?.focus(), 50)
              }}
              title="Buscar no PDF (Ctrl+F)"
              className="p-1 rounded text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <Search size={14} />
            </button>
          )}
        </div>

        {/* ── PDF scrollable area ── */}
        <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-gray-300 dark:bg-gray-950 p-6">
          {numPages === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          <div
            className="flex flex-col items-center gap-6"
            style={{
              transform: `scale(${(requestedScale / renderScale).toFixed(4)})`,
              transformOrigin: 'top center',
              willChange: 'transform',
            }}
          >
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <div
                key={pageNum}
                className="relative shadow-2xl bg-white"
                ref={(el) => { pageRefs.current[pageNum - 1] = el }}
              >
                <canvas
                  ref={(el) => { pdfCanvases.current[pageNum - 1] = el }}
                  className="block"
                />

                {/* Search highlight overlays (between PDF canvas and annotation canvas) */}
                {searchMatches.map((match, matchIdx) =>
                  match.page === pageNum
                    ? match.rects.map((rect, rectIdx) => (
                        <div
                          key={`${matchIdx}-${rectIdx}`}
                          style={{
                            position: 'absolute',
                            left: rect.x,
                            top: rect.y,
                            width: rect.width,
                            height: rect.height,
                            background: matchIdx === currentMatchIndex
                              ? 'rgba(255, 140, 0, 0.5)'
                              : 'rgba(255, 220, 0, 0.45)',
                            pointerEvents: 'none',
                            mixBlendMode: 'multiply',
                          }}
                        />
                      ))
                    : null,
                )}

                <canvas
                  ref={(el) => { annotCanvases.current[pageNum - 1] = el }}
                  className="absolute left-0 top-0 block touch-none"
                  style={{ cursor: cursorStyle(activeTool), mixBlendMode: 'multiply' }}
                  onMouseDown={(e) => handleMouseDown(e, pageNum)}
                  onMouseMove={(e) => handleMouseMove(e, pageNum)}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onClick={(e) => handleCanvasClick(e, pageNum)}
                />
                {textBoxes
                  .filter((tb) => tb.page === pageNum)
                  .map((tb) => (
                    <TextBoxOverlay
                      key={tb.id}
                      box={tb}
                      getPageRect={() => pageRefs.current[pageNum - 1]?.getBoundingClientRect() ?? null}
                      onUpdate={updateTextBox}
                      onDelete={deleteTextBox}
                    />
                  ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
