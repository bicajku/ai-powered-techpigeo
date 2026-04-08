import { useEffect, useRef } from "react"

interface QRCodeGeneratorProps {
  value: string
  size?: number
  level?: "L" | "M" | "Q" | "H"
  includeMargin?: boolean
  className?: string
}

export function QRCodeGenerator({ value, size = 256, level = "M", includeMargin = false, className = "" }: QRCodeGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current || !value) return

    // Simple QR code generation using a data URL from QR server API
    const encodedValue = encodeURIComponent(value)
    const qrSize = size * 2 // 2x for crisp rendering
    const img = new Image()

    img.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return

      canvas.width = qrSize
      canvas.height = qrSize

      const ctx = canvas.getContext("2d")
      if (!ctx) return

      ctx.fillStyle = "white"
      ctx.fillRect(0, 0, qrSize, qrSize)

      ctx.drawImage(img, 0, 0, qrSize, qrSize)
    }

    // Use same-origin QR proxy endpoint so CSP remains strict while rendering QR images.
    const margin = includeMargin ? 10 : 0
    img.src = `/api/qr?size=${qrSize}&data=${encodedValue}&ecc=${level}&margin=${margin}`
  }, [value, size, level, includeMargin])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        imageRendering: "pixelated",
      }}
    />
  )
}
