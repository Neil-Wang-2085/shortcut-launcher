import type { Entry } from '../src/shared/types.ts'

declare global {
  interface Window {
    api: {
      onRenderPopup: (cb: (entry: Entry) => void) => void
    }
  }
}

const appEl = document.getElementById('app') as HTMLElement
const keysEl = document.getElementById('keys') as HTMLElement
const titleEl = document.getElementById('title') as HTMLElement
const zhEl = document.getElementById('zh') as HTMLElement
const descEl = document.getElementById('desc') as HTMLElement

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

function keycaps(combo: string): string {
  return combo
    .split('+')
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => `<span class="key">${escapeHtml(k)}</span>`)
    .join('')
}

window.api.onRenderPopup((e: Entry) => {
  appEl.textContent = e.app
  const combo = e.type === 'shortcut' ? (e.keys.win ?? '') : ''
  keysEl.innerHTML = keycaps(combo)
  titleEl.textContent = e.title
  zhEl.textContent = [e.zh, e.usage].filter(Boolean).join(' · ')
  descEl.textContent = e.description ?? ''
})
