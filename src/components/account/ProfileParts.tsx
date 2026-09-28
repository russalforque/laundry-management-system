import { useEffect, useRef, useState, type FormEvent, type PointerEvent, type ReactNode } from 'react'
import { Avatar } from '../Avatar'
import { I, Icon } from '../Icons'
import { Field, field, StatusBadge } from '../Manage'
import { Sheet } from '../Sheet'
import { joined, RoleBadge } from '../users/UserParts'
import { ROLE_LABEL } from '../../db/users'
import type { MyAccount } from '../../hooks/useMyAccount'
import { clampCrop, loadImage, renderAvatar, type Crop } from '../../lib/avatarPhoto'
import type { User } from '../../types'

/** My Account profile pieces shared by the phone and tablet / desktop pages (hooks/useMyAccount.ts). */

const solid = 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 font-semibold text-white shadow-sm shadow-blue-600/30 active:bg-blue-700 disabled:bg-blue-300 disabled:shadow-none'
const outline = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-white px-5 font-semibold text-blue-600 active:bg-blue-50 disabled:opacity-50'

const ErrorLine = ({ text }: { text: string }) =>
  text ? <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"><Icon className="mt-px h-4 w-4">{I.info}</Icon><span className="min-w-0 flex-1">{text}</span></p> : null

/** Tappable avatar with a camera badge: opens Take Photo / Choose from Gallery / Remove Photo. */
export function AvatarButton({ user, onClick, className = 'size-24 text-3xl' }: { user: User; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={user.photo ? 'Change profile photo' : 'Add profile photo'} className="relative shrink-0 rounded-full outline-none transition active:scale-[0.97] focus-visible:ring-4 focus-visible:ring-blue-200">
      <Avatar name={user.full_name} photo={user.photo} tone="bg-blue-600 text-white" className={`${className} ring-4 ring-white shadow-sm`} />
      <span aria-hidden className="absolute -bottom-0.5 -right-0.5 grid size-9 place-items-center rounded-full bg-white text-blue-600 shadow-md ring-1 ring-slate-200">
        <Icon className="h-5 w-5">{I.camera}</Icon>
      </span>
    </button>
  )
}

/** Photo, name, role and username, with Edit Profile. `center` on phones, `row` beside other panels on tablets. */
export function ProfileHeader({ a, layout }: { a: MyAccount; layout: 'center' | 'row' }) {
  const { user } = a
  if (!user) return null
  const center = layout === 'center'
  return (
    <section className={center ? 'flex flex-col items-center text-center' : 'flex items-center gap-5'}>
      <AvatarButton user={user} onClick={() => a.setSheet('photo')} className={center ? 'size-24 text-3xl' : 'size-20 text-2xl'} />
      <div className={`min-w-0 ${center ? 'mt-3 w-full' : 'flex-1'}`}>
        <h2 className="truncate text-xl font-bold text-slate-900">{user.full_name}</h2>
        <p className={`mt-1 flex min-w-0 items-center gap-2 text-sm text-slate-500 ${center ? 'justify-center' : ''}`}>
          <RoleBadge role={user.role} />
          <span className="truncate">@{user.username}</span>
        </p>
        <button type="button" onClick={() => a.setSheet('edit')} className={`${outline} mt-4 ${center ? '' : 'min-h-11 rounded-xl text-sm'}`}>
          <Icon className="h-5 w-5">{I.pencil}</Icon>Edit Profile
        </button>
      </div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-13 items-center justify-between gap-3 px-4 py-2">
      <dt className="text-[15px] text-slate-600">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[15px] font-semibold text-slate-900">{children}</dd>
    </div>
  )
}

/** Role, status and join date. Read-only here: only an admin changes them, in Users. */
export function AccountDetails({ user }: { user: User }) {
  return (
    <dl className="divide-y divide-slate-100">
      <Row label="Role"><RoleBadge role={user.role} /></Row>
      <Row label="Status"><StatusBadge active={!!user.active} /></Row>
      <Row label="Member since">{joined(user.created_at)}</Row>
    </dl>
  )
}

/** Whichever My Account sheet is open: photo actions, crop preview or Edit Profile. */
export function AccountSheets({ a }: { a: MyAccount }) {
  const { user } = a
  if (!user) return null
  return (
    <>
      {a.sheet === 'photo' && <PhotoActions hasPhoto={!!user.photo} a={a} />}
      {a.sheet === 'edit' && <EditProfileSheet user={user} onSave={a.saveProfile} onClose={() => a.setSheet(null)} />}
      {a.cropSrc && <CropSheet src={a.cropSrc} name={user.full_name} onSave={a.savePhoto} onClose={a.closeCrop} />}
    </>
  )
}

function ActionRow({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <li>
      <button type="button" onClick={onClick} className={`flex min-h-14 w-full items-center gap-4 rounded-2xl px-3 text-left text-base font-semibold transition ${danger ? 'text-red-600 active:bg-red-50' : 'text-slate-900 active:bg-blue-50'}`}>
        <span className={`grid size-10 place-items-center rounded-xl ${danger ? 'bg-red-50' : 'bg-blue-50 text-blue-600'}`}><Icon className="h-5 w-5">{icon}</Icon></span>
        {label}
      </button>
    </li>
  )
}

function PhotoActions({ hasPhoto, a }: { hasPhoto: boolean; a: MyAccount }) {
  return (
    <Sheet label="Profile photo" onClose={() => a.setSheet(null)}>
      <ul className="space-y-1 pb-1">
        <ActionRow icon={I.camera} label="Take Photo" onClick={() => a.choose('camera')} />
        <ActionRow icon={I.image} label="Choose from Gallery" onClick={() => a.choose('gallery')} />
        {hasPhoto && <ActionRow icon={I.trash} label="Remove Photo" onClick={a.removePhoto} danger />}
      </ul>
    </Sheet>
  )
}

/** Crop frame on screen, px. The saved photo is rendered separately at AVATAR_PX. */
const FRAME = 256

/** Preview with a round mask: drag to position, slider to zoom, then Use Photo. */
function CropSheet({ src, name, onSave, onClose }: { src: string; name: string; onSave: (base64: string) => Promise<void>; onClose: () => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [crop, setCrop] = useState<Crop>({ zoom: 1, x: 0, y: 0 })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)

  useEffect(() => {
    let live = true
    loadImage(src).then((el) => { if (live) setImg(el) }, (e: Error) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [src])

  const move = (next: Crop) => img && setCrop(clampCrop(img, next))
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { px: e.clientX, py: e.clientY, x: crop.x, y: crop.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (d) move({ zoom: crop.zoom, x: d.x + (e.clientX - d.px) / FRAME, y: d.y + (e.clientY - d.py) / FRAME })
  }
  const onUp = () => { drag.current = null }

  async function save() {
    if (!img || busy) return
    setBusy(true)
    setError('')
    try {
      await onSave(renderAvatar(img, crop))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the photo.')
      setBusy(false)
    }
  }

  const scale = img ? (FRAME / Math.min(img.naturalWidth, img.naturalHeight)) * crop.zoom : 1
  const w = (img?.naturalWidth ?? 0) * scale
  const h = (img?.naturalHeight ?? 0) * scale

  return (
    <Sheet label="Adjust photo" onClose={onClose}>
      <div className="space-y-4">
        <div
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-label={`Photo preview for ${name}. Drag to position.`}
          className="relative mx-auto touch-none select-none overflow-hidden rounded-3xl bg-slate-900"
          style={{ width: FRAME, height: FRAME }}
        >
          {img ? (
            <img
              src={src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{ width: w, height: h, left: FRAME / 2 + crop.x * FRAME - w / 2, top: FRAME / 2 + crop.y * FRAME - h / 2 }}
            />
          ) : !error && <div className="absolute inset-0 animate-pulse bg-slate-700" />}
          {/* Round mask: what shows inside the circle is the avatar */}
          <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgba(15,23,42,0.55)] ring-2 ring-white/80" />
        </div>
        <label className="flex items-center gap-3 px-2">
          <Icon className="h-4 w-4 shrink-0 text-slate-400">{I.minus}</Icon>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={crop.zoom}
            onChange={(e) => move({ ...crop, zoom: Number(e.target.value) })}
            aria-label="Zoom"
            disabled={!img}
            className="h-11 w-full accent-blue-600"
          />
          <Icon className="h-4 w-4 shrink-0 text-slate-400">{I.plus}</Icon>
        </label>
        <p className="text-center text-sm text-slate-500">Drag to position, slide to zoom.</p>
        <ErrorLine text={error} />
        <button type="button" onClick={save} disabled={!img || busy} className={solid}>{busy ? 'Saving…' : 'Use Photo'}</button>
        <button type="button" onClick={onClose} disabled={busy} className={`${outline} w-full`}>Cancel</button>
      </div>
    </Sheet>
  )
}

/** Full name and username. Role is shown but not editable: only an admin changes it, in Users. */
function EditProfileSheet({ user, onSave, onClose }: {
  user: User
  onSave: (input: { fullName: string; username: string }) => Promise<void>
  onClose: () => void
}) {
  const [fullName, setFullName] = useState(user.full_name)
  const [username, setUsername] = useState(user.username)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const unchanged = fullName.trim() === user.full_name && username.trim() === user.username

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (unchanged) return onClose()
    setBusy(true)
    setError('')
    try {
      await onSave({ fullName, username })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.')
      setBusy(false)
    }
  }

  return (
    <Sheet label="Edit Profile" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full Name" icon={I.pencil} required>
          <input className={field} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" maxLength={60} required />
        </Field>
        <div>
          <Field label="Username" icon={I.user} required>
            <input
              className={field}
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              maxLength={32}
              required
            />
          </Field>
          <span className="mt-1 block text-xs text-slate-400">3–32 letters, numbers, . _ -</span>
        </div>
        <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-sm text-slate-600">
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-blue-600">{I.info}</Icon>
          <span>Your role is {ROLE_LABEL[user.role]}. Only an admin can change roles, in Users.</span>
        </div>
        <ErrorLine text={error} />
        <button type="submit" disabled={busy} className={solid}>{busy ? 'Saving…' : 'Save Changes'}</button>
      </form>
    </Sheet>
  )
}
