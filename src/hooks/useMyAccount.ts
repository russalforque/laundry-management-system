import { useState } from 'react'
import type { Msg } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { setOwnPhoto, updateOwnProfile } from '../db/users'
import { deleteAvatarFile, pickPhoto, saveAvatarFile } from '../lib/avatarPhoto'

export type AccountSheet = 'photo' | 'edit' | null

/**
 * My Account profile: photo (take / choose → crop → save, or remove) and name / username. Only ever the
 * signed-in employee's own account: the db layer takes the id from the session (db/users.ts).
 * Shared by pages/mobile/MobileAccount.tsx and pages/desktop-tablet/Account.tsx.
 */
export function useMyAccount() {
  const { user, refreshUser, logout, switchUser } = useAuth()
  const [sheet, setSheet] = useState<AccountSheet>(null)
  /** Picked image waiting in the crop preview. */
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [msg, setMsg] = useState<Msg>(null)
  const fail = (e: unknown) => setMsg({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong. Please try again.' })

  async function choose(source: 'camera' | 'gallery') {
    setSheet(null)
    setMsg(null)
    try {
      const src = await pickPhoto(source)
      if (src) setCropSrc(src) // null = backed out: nothing to say
    } catch (e) {
      fail(e)
    }
  }

  /** Saves the cropped photo; the old file is removed only once the new one is in the database. */
  async function savePhoto(base64: string) {
    if (!user) return
    const old = user.photo
    const path = await saveAvatarFile(user.id, base64)
    try {
      refreshUser(await setOwnPhoto(path))
    } catch (e) {
      await deleteAvatarFile(path)
      throw e
    }
    await deleteAvatarFile(old)
    setCropSrc(null)
    setMsg({ ok: true, text: 'Profile photo updated.' })
  }

  async function removePhoto() {
    setSheet(null)
    if (!user?.photo) return
    const old = user.photo
    try {
      refreshUser(await setOwnPhoto(null))
      await deleteAvatarFile(old)
      setMsg({ ok: true, text: 'Profile photo removed.' })
    } catch (e) {
      fail(e)
    }
  }

  async function saveProfile(input: { fullName: string; username: string }) {
    refreshUser(await updateOwnProfile(input))
    setSheet(null)
    setMsg({ ok: true, text: 'Profile updated.' })
  }

  return {
    user, sheet, setSheet, cropSrc, closeCrop: () => setCropSrc(null), msg, clearMsg: () => setMsg(null),
    choose, savePhoto, removePhoto, saveProfile, logout, switchUser,
  }
}
export type MyAccount = ReturnType<typeof useMyAccount>
