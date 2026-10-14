import { supabase, ROLE_LABEL, type Role } from './supabase'
import { APP_NAME } from './brand'

export const inviteUrl = (token: string) => `${window.location.origin}/welcome/${token}`
export const joinUrl = (slug: string) => `${window.location.origin}/join/${slug}`

/** A new invite link for a user (first password, or a reset). Valid for 7 days. */
export async function issueInvite(userId: string): Promise<{ url: string } | { error: string }> {
  const { data, error } = await supabase.rpc('admin_issue_invite', { p_user: userId })
  if (error) return { error: error.message }
  return { url: inviteUrl(data as string) }
}

/** The WhatsApp-ready message that goes with an invite link. Coaches get it in English and Kinyarwanda. */
export function inviteMessage({ name, role, project, url, reset }: { name: string | null; role: Role; project: string; url: string; reset?: boolean }) {
  const hi = name ? `Hi ${name.split(' ')[0]},` : 'Hi,'
  if (role === 'coach') {
    return reset
      ? `${hi}\nHere is a new link to set your ${APP_NAME} password: ${url}\nIt works for 7 days.\n\nMuraho, iyi ni link nshya yo gushyiraho ijambo ry'ibanga rya ${APP_NAME}: ${url}\nIkora iminsi 7.`
      : `${hi}\nYou have been invited to ${APP_NAME}, the coach app of ${project}. Open this link, choose your password and you are in: ${url}\nThe link works for 7 days.\n\nMuraho, watumiwe kuri ${APP_NAME}, porogaramu y'abatoza ya ${project}. Fungura iyi link, hitamo ijambo ry'ibanga, uhite winjira: ${url}\nLink ikora iminsi 7.`
  }
  return reset
    ? `${hi}\nHere is a new link to set your ${APP_NAME} password: ${url}\nIt works for 7 days.`
    : `${hi}\nYou have been invited to ${APP_NAME} (${project}) as ${ROLE_LABEL[role]}. Open this link, choose your password and you are in: ${url}\nThe link works for 7 days.`
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { window.prompt('Copy this', text); return false }
}

export const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function'
export async function shareText(title: string, text: string) {
  try { await navigator.share({ title, text }) } catch { /* cancelled */ }
}
