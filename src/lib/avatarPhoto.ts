import { Camera } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { useEffect, useState } from 'react'

/**
 * My Account profile photos. The picked image is cropped to a small square JPEG and written to the app's private
 * data folder; the database keeps only its path (users.photo). Backups carry the path, not the file, so a photo
 * restored on another device falls back to initials.
 */

const DIR = 'avatars'
/** Saved size in px: sharp at the largest avatar (96px on a 3x screen) and ~20–40 KB on disk. */
export const AVATAR_PX = 320
const QUALITY = 0.85

/** Thrown when the camera or photo library is off for this app; the message says what to do. */
export class PhotoAccessError extends Error {}

const isCancel = (e: unknown) => /cancel|no (image|picture|photo|media)/i.test(e instanceof Error ? e.message : String(e))

/**
 * Opens the camera or the gallery. Returns a URL the WebView can load, or null when the employee backed out.
 * Camera access is asked for here first, so a denial gets a clear message rather than a plugin error.
 */
export async function pickPhoto(source: 'camera' | 'gallery'): Promise<string | null> {
  try {
    if (source === 'camera') {
      if (Capacitor.isNativePlatform()) {
        let { camera } = await Camera.checkPermissions()
        if (camera === 'prompt' || camera === 'prompt-with-rationale') ({ camera } = await Camera.requestPermissions({ permissions: ['camera'] }))
        if (camera !== 'granted' && camera !== 'limited')
          throw new PhotoAccessError('Camera access is off. Allow it in the app settings, or choose a photo from the gallery.')
      }
      const r = await Camera.takePhoto({ quality: 90, targetWidth: 1280, targetHeight: 1280, correctOrientation: true, webUseInput: true })
      return r.webPath ?? null
    }
    const { results } = await Camera.chooseFromGallery({ allowMultipleSelection: false, webUseInput: true })
    return results[0]?.webPath ?? null
  } catch (e) {
    if (e instanceof PhotoAccessError) throw e
    if (isCancel(e)) return null
    const msg = e instanceof Error ? e.message : String(e)
    if (/denied|permission/i.test(msg))
      throw new PhotoAccessError(`${source === 'camera' ? 'Camera' : 'Photo'} access is off. Allow it in the app settings and try again.`)
    throw new Error(source === 'camera' ? 'Could not take a photo.' : 'Could not open this photo.')
  }
}

export const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Could not read this image.'))
    el.src = src
  })

/** Crop: `zoom` ≥ 1 over the image's cover fit, `x` / `y` the offset of its center in fractions of the frame. */
export interface Crop { zoom: number; x: number; y: number }

/** Draws the cropped square at AVATAR_PX and returns the JPEG as base64 (no data: prefix). */
export function renderAvatar(img: HTMLImageElement, crop: Crop): string {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = AVATAR_PX
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process this image.')
  const scale = (AVATAR_PX / Math.min(img.naturalWidth, img.naturalHeight)) * crop.zoom
  const w = img.naturalWidth * scale
  const h = img.naturalHeight * scale
  ctx.fillStyle = '#fff' // JPEG has no alpha
  ctx.fillRect(0, 0, AVATAR_PX, AVATAR_PX)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, AVATAR_PX / 2 + crop.x * AVATAR_PX - w / 2, AVATAR_PX / 2 + crop.y * AVATAR_PX - h / 2, w, h)
  return canvas.toDataURL('image/jpeg', QUALITY).split(',')[1]!
}

/** Keeps the image covering the whole frame: no empty edges at any zoom. */
export function clampCrop(img: { naturalWidth: number; naturalHeight: number }, crop: Crop): Crop {
  const short = Math.min(img.naturalWidth, img.naturalHeight)
  const maxX = Math.max(0, ((img.naturalWidth / short) * crop.zoom - 1) / 2)
  const maxY = Math.max(0, ((img.naturalHeight / short) * crop.zoom - 1) / 2)
  return { zoom: crop.zoom, x: Math.min(maxX, Math.max(-maxX, crop.x)), y: Math.min(maxY, Math.max(-maxY, crop.y)) }
}

// ---------- files ----------

const cache = new Map<string, string>()

/** Writes a new file (a new name each time, so nothing shows a stale cached image) and returns its path. */
export async function saveAvatarFile(userId: number, base64: string): Promise<string> {
  const path = `${DIR}/user-${userId}-${Date.now()}.jpg`
  await Filesystem.writeFile({ path, data: base64, directory: Directory.Data, recursive: true })
  cache.set(path, `data:image/jpeg;base64,${base64}`)
  return path
}

/** Best effort: a missing file is already gone. */
export async function deleteAvatarFile(path: string | null | undefined) {
  if (!path) return
  cache.delete(path)
  await Filesystem.deleteFile({ path, directory: Directory.Data }).catch(() => {})
}

async function readAvatar(path: string): Promise<string | null> {
  const hit = cache.get(path)
  if (hit) return hit
  try {
    const { data } = await Filesystem.readFile({ path, directory: Directory.Data })
    const url = typeof data === 'string' ? `data:image/jpeg;base64,${data}` : URL.createObjectURL(data)
    cache.set(path, url)
    return url
  } catch {
    return null // file missing (e.g. restored from another device's backup): show initials
  }
}

/** The photo as an <img> src, or null while loading / when there is none. */
export function useAvatarSrc(path: string | null | undefined) {
  const [loaded, setLoaded] = useState<{ path: string; src: string | null } | null>(null)
  useEffect(() => {
    if (!path) return
    let live = true
    readAvatar(path).then((src) => { if (live) setLoaded({ path, src }) })
    return () => { live = false }
  }, [path])
  if (!path) return null
  return loaded?.path === path ? loaded.src : (cache.get(path) ?? null)
}
