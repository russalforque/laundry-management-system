/**
 * Reads a picked image file and returns a downscaled JPEG data URL, small enough
 * to keep in SQLite (and in backups) without bloating the database.
 */
export async function fileToThumbnail(file: File, maxSide = 640, quality = 0.8): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Could not read this image.'))
      el.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not process this image.')
    ctx.fillStyle = '#fff' // JPEG has no alpha; avoid black behind transparent PNGs
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}
