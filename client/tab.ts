import type { Mount } from '/lib/view.js'

/**
 * `artifacts/tab`, on the board in the sidebar's strip (`board.strip`): an Artifacts tab after the sidebar's Floors and
 * Stats, which opens the gallery in the main pane. The tower page has no region for a tab there, so this view draws
 * nothing in the strip and places a button of its own beside the page's tabs, found by their `data-side-view`; it
 * marks it while the gallery is open, and takes it away when it closes. On a page without those tabs it places
 * nothing, and the gallery is still in the palette.
 */

const GALLERY = 'artifacts/gallery'
const STYLE_ID = 'artifacts-tab-style'

/**
 * The tab drawn as the page's side tabs are, the gallery's being open said in ink alone (Floors or Stats stays the
 * sidebar's), and the row let wrap while it holds the tab, so the extensions' icons after it go to a line of their own
 * rather than out of the sidebar.
 */
const STYLE = `.artifacts-tab[aria-current="true"] { color: var(--ink); }
[data-side-view] ~ .artifacts-tab { white-space: nowrap; }
:has(> .artifacts-tab) { flex-wrap: wrap; row-gap: var(--sp-xs); }`

export const mount: Mount = (host, { kit }) => {
  host.hidden = true
  if (!document.getElementById(STYLE_ID)) document.head.append(Object.assign(document.createElement('style'), { id: STYLE_ID, textContent: STYLE }))
  const tab = Object.assign(document.createElement('button'), { className: 'eyebrow artifacts-tab', textContent: 'Artifacts' })
  tab.title = 'your claude.ai artifacts, pinned ones first, each with how it was made'
  tab.addEventListener('click', () => kit.display('board', { view: GALLERY }))

  /** After the page's last side tab, Stats today; again whenever the page drew its tabs afresh. */
  const place = () => {
    const tabs = document.querySelectorAll('[data-side-view]')
    const last = tabs[tabs.length - 1]
    if (last && tab.previousElementSibling !== last) last.after(tab)
  }
  const mark = () => tab.setAttribute('aria-current', String(kit.location?.()?.view === GALLERY))

  place()
  mark()
  return {
    update() {
      place()
      mark()
    },
    close() {
      tab.remove()
      document.getElementById(STYLE_ID)?.remove()
    },
  }
}
