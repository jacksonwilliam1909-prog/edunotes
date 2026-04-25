import { useRef, useEffect, useState, useCallback, useReducer } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { PDFDocument } from 'pdf-lib'
import { toast } from 'sonner'
import { PdfToolbar } from './PdfToolbar'
import type { PdfTool } from './PdfToolbar'
import type { PdfStroke } from '../../types'

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

  // Open shapes → straight line
  if (distStartEnd > diagonal * 0.4) return 'line'

  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const dists = points.map((p) => Math.hypot(p[0] - cx, p[1] - cy))
  const meanDist = dists.reduce((a, b) => a + b, 0) / dists.length
  const variance = dists.reduce((a, b) => a + (b - meanDist) ** 2, 0) / dists.length
  const cv = Math.sqrt(variance) / meanDist

  // Circle: low variance in radial distance + roughly square bounding box
  if (cv < 0.22 && Math.abs(w - h) / Math.max(w, h) < 0.45) return 'circle'

  // Rectangle: points distributed near all 4 edges
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
  // triangle
  return [[cx, minY], [maxX, maxY], [minX, maxY], [cx, minY]]
}

// ── Pure canvas helpers ──────────────────────────────────────────────────────

function drawStroke(ctx: CanvasRenderingContext2D, stroke: PdfStroke) {
  if (stroke.points.length < 2) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()

  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0,0,0,1)'
    ctx.lineWidth = stroke.width * 10
  } else if (stroke.tool === 'highlight') {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.width * 14
    ctx.globalAlpha = stroke.opacity ?? 0.35
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.width
  }

  ctx.moveTo(stroke.points[0][0], stroke.points[0][1])
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i][0], stroke.points[i][1])
  }
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
  }
}

// ── Component ────────────────────────────────────────────────────────────────

interface PdfViewerProps {
  pdfUrl: string
  initialAnnotations: PdfStroke[]
  onAnnotationsChange: (annotations: PdfStroke[]) => void
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
  const [scale, setScale] = useState(1.5)

  const [activeTool, setActiveTool] = useState<PdfTool>('pointer')
  const [penColor, setPenColor] = useState('#1e3a8a')
  const [penWidth, setPenWidth] = useState(2)
  const [highlightColor, setHighlightColor] = useState('#fbbf24')
  const [highlightOpacity, setHighlightOpacity] = useState(0.35)
  const [highlightWidth, setHighlightWidth] = useState(0.5)

  // Merged PDF support
  const [mergedBlobUrl, setMergedBlobUrl] = useState<string | null>(null)
  const [isMerging, setIsMerging] = useState(false)
  const mergedBlobUrlRef = useRef<string | null>(null)
  const mergeInputRef = useRef<HTMLInputElement>(null)

  // The URL actually rendered — merged takes priority over prop
  const effectivePdfUrl = mergedBlobUrl ?? pdfUrl

  const [annot, dispatch] = useReducer(annotReducer, {
    strokes: initialAnnotations,
    past: [],
    future: [],
  })

  const pdfCanvases = useRef<(HTMLCanvasElement | null)[]>([])
  const annotCanvases = useRef<(HTMLCanvasElement | null)[]>([])
  const isDrawing = useRef(false)
  const liveStroke = useRef<PdfStroke | null>(null)
  const latestStrokes = useRef(initialAnnotations)

  // Shape-correction timer refs
  const straightenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isStraightenedRef = useRef(false)

  // Revoke merged blob URL on unmount
  useEffect(() => {
    return () => {
      if (mergedBlobUrlRef.current) URL.revokeObjectURL(mergedBlobUrlRef.current)
    }
  }, [])

  // Sync annotations to parent and keep latestStrokes up to date
  useEffect(() => {
    latestStrokes.current = annot.strokes
    onAnnotationsChange(annot.strokes)
  }, [annot.strokes, onAnnotationsChange])

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
    return () => {
      cancelled = true
    }
  }, [effectivePdfUrl])

  // ── Page rendering ───────────────────────────────────────────────────────
  const renderPdfPage = useCallback(
    async (pageNum: number) => {
      if (!pdfDoc) return
      const pdfCanvas = pdfCanvases.current[pageNum - 1]
      const annotCanvas = annotCanvases.current[pageNum - 1]
      if (!pdfCanvas || !annotCanvas) return

      const page = await pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale })
      pdfCanvas.width = viewport.width
      pdfCanvas.height = viewport.height
      annotCanvas.width = viewport.width
      annotCanvas.height = viewport.height

      const ctx = pdfCanvas.getContext('2d')
      if (!ctx) return
      await page.render({ canvasContext: ctx, viewport, canvas: pdfCanvas }).promise

      redrawPage(annotCanvas, pageNum, latestStrokes.current)
    },
    [pdfDoc, scale],
  )

  useEffect(() => {
    if (!pdfDoc || numPages === 0) return
    for (let i = 1; i <= numPages; i++) renderPdfPage(i)
  }, [pdfDoc, numPages, renderPdfPage])

  useEffect(() => {
    for (let i = 1; i <= numPages; i++) {
      const canvas = annotCanvases.current[i - 1]
      if (canvas && canvas.width > 0) redrawPage(canvas, i, annot.strokes)
    }
  }, [annot.strokes, numPages])

  // ── Zoom handlers ────────────────────────────────────────────────────────
  const handleZoomIn = useCallback(
    () => setScale((s) => Math.min(parseFloat((s + 0.25).toFixed(2)), 4.0)),
    [],
  )
  const handleZoomOut = useCallback(
    () => setScale((s) => Math.max(parseFloat((s - 0.25).toFixed(2)), 0.5)),
    [],
  )

  // ── Drawing helpers ──────────────────────────────────────────────────────
  const toCanvasCoords = (
    e: React.MouseEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement,
  ): [number, number] => {
    const rect = canvas.getBoundingClientRect()
    return [
      ((e.clientX - rect.left) * canvas.width) / rect.width,
      ((e.clientY - rect.top) * canvas.height) / rect.height,
    ]
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>, page: number) => {
    if (activeTool === 'pointer') return
    const canvas = annotCanvases.current[page - 1]
    if (!canvas) return

    isStraightenedRef.current = false
    isDrawing.current = true
    liveStroke.current = {
      id: crypto.randomUUID(),
      tool: activeTool,
      color: activeTool === 'highlight' ? highlightColor : activeTool === 'eraser' ? '' : penColor,
      width: activeTool === 'highlight' ? highlightWidth : penWidth,
      page,
      points: [toCanvasCoords(e, canvas)],
      opacity: activeTool === 'highlight' ? highlightOpacity : undefined,
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>, page: number) => {
    if (!isDrawing.current || !liveStroke.current) return
    const canvas = annotCanvases.current[page - 1]
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const point = toCanvasCoords(e, canvas)
    const pts = liveStroke.current.points
    liveStroke.current = { ...liveStroke.current, points: [...pts, point] }

    // Draw only the last segment incrementally
    if (pts.length >= 1) {
      const stroke = liveStroke.current
      ctx.save()
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()

      if (stroke.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out'
        ctx.strokeStyle = 'rgba(0,0,0,1)'
        ctx.lineWidth = stroke.width * 10
      } else if (stroke.tool === 'highlight') {
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = stroke.color
        ctx.lineWidth = stroke.width * 14
        ctx.globalAlpha = stroke.opacity ?? 0.35
      } else {
        ctx.strokeStyle = stroke.color
        ctx.lineWidth = stroke.width
      }

      ctx.moveTo(pts[pts.length - 1][0], pts[pts.length - 1][1])
      ctx.lineTo(point[0], point[1])
      ctx.stroke()
      ctx.restore()
    }

    // ── Auto-correção de forma: reinicia timer a cada movimento ─────────
    if (activeTool === 'pen' || activeTool === 'highlight') {
      if (isStraightenedRef.current) {
        // Usuário moveu após correção — volta ao desenho livre
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

        const strokePts = liveStroke.current.points
        if (strokePts.length < 2) return

        const xs = strokePts.map((p) => p[0])
        const ys = strokePts.map((p) => p[1])
        const bbox = {
          minX: Math.min(...xs), minY: Math.min(...ys),
          maxX: Math.max(...xs), maxY: Math.max(...ys),
        }

        const detectedShape = detectShape(strokePts)
        const correctedPoints =
          detectedShape === 'line'
            ? [strokePts[0], strokePts[strokePts.length - 1]]
            : shapeToPoints(detectedShape, bbox)

        liveStroke.current = { ...liveStroke.current, points: correctedPoints }
        isStraightenedRef.current = true

        // Redesenhar como preview da forma corrigida
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
      const blob = new Blob([mergedBytes], { type: 'application/pdf' })

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
      const blob = new Blob([savedBytes], { type: 'application/pdf' })
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

        onUndo={() => dispatch({ type: 'UNDO' })}
        onRedo={() => dispatch({ type: 'REDO' })}
        canUndo={annot.past.length > 0}
        canRedo={annot.future.length > 0}
        onMergeRequest={() => mergeInputRef.current?.click()}
        onDownload={handleDownload}
        onDownloadAnnotated={handleDownloadAnnotated}
        isMerging={isMerging}
        scale={scale}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
      />

      {/* Input oculto para seleção do segundo PDF */}
      <input
        ref={mergeInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleMergeFileChange}
      />

      <div className="flex-1 overflow-auto bg-gray-300 dark:bg-gray-950 p-6">
        {numPages === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        <div className="flex flex-col items-center gap-6">
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
            <div key={pageNum} className="relative shadow-2xl">
              <canvas
                ref={(el) => {
                  pdfCanvases.current[pageNum - 1] = el
                }}
                className="block"
              />
              <canvas
                ref={(el) => {
                  annotCanvases.current[pageNum - 1] = el
                }}
                className="absolute inset-0 touch-none"
                style={{ cursor: cursorStyle(activeTool) }}
                onMouseDown={(e) => handleMouseDown(e, pageNum)}
                onMouseMove={(e) => handleMouseMove(e, pageNum)}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
