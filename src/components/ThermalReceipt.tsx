import { useEffect, useRef } from 'react'
import type { Bitmap, ReceiptDoc } from '../lib/receipt'

/**
 * Renders a receipt layout the way the thermal printer will: same fixed-width lines, bold and
 * double-size text, and the exact 1-bit logo/QR dots. The font scales so every line fits the paper.
 */
export default function ThermalReceipt({ doc, className = '' }: { doc: ReceiptDoc; className?: string }) {
  return (
    <div className="@container w-full">
      <div
        className={`mx-auto w-fit max-w-full bg-white px-[1.5ch] py-[2ch] font-mono leading-[1.35] text-black ${className}`}
        // Monospace glyphs are ~0.6em wide; keep `cols` characters plus the side padding inside the container.
        style={{ fontSize: `min(13px, calc(100cqw / ${(doc.cols + 3) * 0.62}))` }}
      >
        <div style={{ width: `${doc.cols}ch` }}>
          {doc.lines.map((l, i) =>
            l.kind === 'image' ? (
              <BitmapCanvas key={i} bitmap={l.bitmap} />
            ) : (
              <div
                key={i}
                className={`whitespace-pre ${l.bold ? 'font-bold' : ''}`}
                style={l.big ? { fontSize: '2em', lineHeight: 1.2 } : undefined}
              >
                {l.text || ' '}
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  )
}

function BitmapCanvas({ bitmap }: { bitmap: Bitmap }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(bitmap.width, bitmap.height)
    for (let i = 0; i < bitmap.data.length; i++) {
      const v = bitmap.data[i] ? 0 : 255
      img.data.set([v, v, v, 255], i * 4)
    }
    ctx.putImageData(img, 0, 0)
  }, [bitmap])
  return <canvas ref={ref} width={bitmap.width} height={bitmap.height} className="block w-full [image-rendering:pixelated]" />
}
