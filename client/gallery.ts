import type { Board } from '/lib/board.js'
import { markdownCss, markdownHtml } from '/lib/markdown.js'
import { closeHtml, copyTelling, itemPath, type Mount, paintOnce, viewCss } from '/lib/view.js'
import { esc } from '/lib/words.js'
import { type Artifact, ARTIFACTS, artifactOf, type Broken, byUpdated, clonePrompt, IMPORT_PROMPT, isArtifact, matches, modifyPrompt, pageOf, pagePrompt, TOWER_WIDE } from './artifact.ts'

/**
 * `artifacts/gallery`, on the board: every entry of the tower-wide `artifacts` collection, pinned ones first, then the
 * rest newest first, searched by title, description, summary and who made it. The one picked is drawn beside the list
 * with its creation context, and offers to open it on claude.ai, pin it, or hire a worker to modify or clone it.
 */

const ID = 'artifacts/gallery'

const STYLE = viewCss(
  ID,
  `& .gallery { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(220px, 22em) 1fr; gap: var(--sp-l); }
  & .index, & .reader { min-height: 0; overflow-y: auto; background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
  & .index { display: flex; flex-direction: column; gap: var(--sp-m); padding: var(--sp-l); }
  & .index input { padding: var(--sp-s) var(--sp-m); font: inherit; color: var(--ink); background: var(--panel); border: 1px solid var(--line-strong); border-radius: var(--radius); }
  & .index input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  & .index h3 { margin: var(--sp-s) 0 0; font: 700 var(--fs-s)/1.3 var(--display); text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  & .index ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
  & .index li { display: flex; align-items: center; gap: var(--sp-xs); }
  & .index li > button.pick { flex: 1; min-width: 0; text-align: left; padding: var(--sp-xs) var(--sp-s); border: 0; border-radius: var(--radius-s); background: none; color: var(--ink); font: inherit; cursor: pointer; display: flex; flex-direction: column; }
  & .index li > button.pick:hover { background: color-mix(in oklab, var(--accent) 10%, transparent); }
  & .index li > button.pick[aria-current="true"] { background: color-mix(in oklab, var(--accent) 18%, transparent); }
  & .index li > button.pick[aria-current="true"] .t { font-weight: 700; }
  & .index .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  & .index .m { color: var(--muted); font-size: var(--fs-s); }
  & .star { border: 0; background: none; cursor: pointer; color: var(--faint); font-size: 1.1em; padding: var(--sp-xs); border-radius: var(--radius-s); line-height: 1; }
  & .star:hover { color: var(--ink); background: color-mix(in oklab, var(--accent) 10%, transparent); }
  & .star[aria-pressed="true"] { color: var(--accent); }
  & .index .none, & .index .broken { color: var(--muted); font-size: var(--fs-s); margin: 0; }
  & .reader { padding: var(--sp-xl) var(--sp-2xl); display: flex; flex-direction: column; gap: var(--sp-l); }
  & .reader h1 { margin: 0; font: 700 var(--fs-xl)/1.25 var(--display); }
  & .reader .desc { margin: 0; color: var(--muted); }
  & .reader .acts { display: flex; flex-wrap: wrap; gap: var(--sp-s); align-items: center; }
  & .reader .acts a, & .reader .acts button { min-height: var(--control); padding: 0 var(--sp-l); display: inline-flex; align-items: center; text-decoration: none; }
  & .reader .acts select { min-height: var(--control); font: inherit; color: var(--ink); background: var(--panel); border: 1px solid var(--line-strong); border-radius: var(--radius); padding: 0 var(--sp-s); }
  & .reader dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: var(--sp-xs) var(--sp-l); font-size: var(--fs-s); }
  & .reader dt { color: var(--muted); }
  & .reader dd { margin: 0; overflow-wrap: anywhere; }
  & .reader h2 { margin: var(--sp-m) 0 0; font: 700 var(--fs-s)/1.3 var(--display); text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  & .reader .missing { color: var(--muted); font-style: italic; margin: 0; }
  & .reader blockquote { margin: 0 0 var(--sp-m); padding: var(--sp-s) var(--sp-l); border-left: 3px solid var(--line-strong); color: var(--ink); white-space: pre-wrap; }
  & .reader .empty { color: var(--muted); }
  & .reader .tabs { display: flex; gap: var(--sp-xs); border-bottom: 1px solid var(--line); padding-bottom: var(--sp-s); }
  & .reader .tabs button { padding: var(--sp-xs) var(--sp-m); border: 1px solid transparent; border-radius: var(--radius); background: none; color: var(--muted); cursor: pointer; }
  & .reader .tabs button:hover { color: var(--ink); }
  & .reader .tabs button[aria-selected="true"] { color: var(--ink); border-color: var(--line-strong); }
  & .gallery.wide { grid-template-columns: 1fr; } & .gallery.wide .index { display: none; }
  & .reader .tabs .expand { margin-left: auto; }
  & .reader .rhead, & .reader .rbody { display: flex; flex-direction: column; gap: var(--sp-l); }
  & .reader .rbody { flex: 1; min-height: 0; }
  & .reader.paging { padding: var(--sp-l); gap: var(--sp-m); } & .reader.paging .rhead { gap: var(--sp-m); }
  & .reader.paging .page { min-height: 0; }
  & .reader .page { flex: 1; min-height: 24em; width: 100%; border: 1px solid var(--line); border-radius: var(--radius-s); background: #fff; }
  & .reader .nopage { display: flex; flex-direction: column; align-items: flex-start; gap: var(--sp-m); color: var(--muted); }
  @media (max-width: 720px) { & .gallery { grid-template-columns: 1fr; grid-template-rows: minmax(10em, 40%) 1fr; } & .reader { padding: var(--sp-l); } }`,
)

const SOURCE_WORDS: Record<Artifact['source'], string> = { tower: 'tower', cowork: 'Claude Desktop · Cowork', 'claude.ai': 'claude.ai' }

/** An entry as of its version, read again when the board shows a newer one. */
type Read = { modifiedAt: number; artifact: Artifact | Broken }

const pathOf = (id: string) => itemPath(TOWER_WIDE, ARTIFACTS, id)

const day = (iso: string | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '')

export const mount: Mount = (host, { tower, board: first, kit }) => {
  let board: Board = first
  let query = ''
  let open: string | undefined
  /** The reader's tab the user picked for the artifact open: its page, or how it was made. Unpicked, the page when kept. */
  let tab: 'page' | 'context' | undefined
  /** Whether the list is put away, the reader taking the whole width. */
  let wide = false
  /** The floor a worker is hired on, as last picked. */
  let floorPick: string | undefined
  const reads = new Map<string, Read>()
  const reading = new Map<string, number>()

  host.innerHTML = `<style>${STYLE}${markdownCss}</style>
  <div class="shelf-head"><span class="label">Artifacts</span><span class="dim">pinned first, each with how it was made</span>
    <button class="secondary" data-import>Refresh from Claude Desktop</button><button class="secondary" data-import-account>Import my claude.ai account</button><span class="actions"></span></div>
  <div class="gallery"><nav class="index" aria-label="artifacts"><input type="search" placeholder="Search artifacts" aria-label="search artifacts"><div class="list"></div></nav>
    <article class="reader" aria-live="polite"><div class="rhead"></div><div class="rbody"></div></article></div>`
  const $ = <T extends Element>(selector: string) => host.querySelector<T>(selector)!

  const collection = () => board.collections.find((c) => c.id === ARTIFACTS)
  const files = () => (collection()?.items ?? []).filter((i) => i.id.endsWith('.md'))
  const hasPage = (id: string) => collection()?.items.some((i) => i.id === pageOf(id)) ?? false
  const tagOf = (id: string) => collection()?.items.find((i) => i.id === id)?.tag ?? id

  const readAll = async () => {
    const stale = files().filter((i) => reads.get(i.id)?.modifiedAt !== i.modifiedAt && reading.get(i.id) !== i.modifiedAt)
    if (!stale.length) return
    await Promise.all(
      stale.map(async (i) => {
        reading.set(i.id, i.modifiedAt)
        const artifact = await tower.text(pathOf(i.id)).then(
          (text) => artifactOf(i.id, text),
          (err: Error) => ({ id: i.id, why: err.message }),
        )
        if (reading.get(i.id) !== i.modifiedAt) return
        reading.delete(i.id)
        reads.set(i.id, { modifiedAt: i.modifiedAt, artifact })
      }),
    )
    draw()
  }

  const rowHtml = (a: Artifact) =>
    `<li><button class="star" data-pin="${esc(a.id)}" aria-pressed="${!!a.pinned}" aria-label="${a.pinned ? 'unpin' : 'pin'} ${esc(a.title)}" title="${a.pinned ? 'Unpin' : 'Pin'}">${a.pinned ? '★' : '☆'}</button>
      <button class="pick" data-artifact="${esc(a.id)}" aria-current="${a.id === open}"><span class="t">${esc(a.title)}</span><span class="m">${esc([SOURCE_WORDS[a.source], a.callsign, day(a.updated ?? a.created)].filter(Boolean).join(' · '))}</span></button></li>`

  const listHtml = (all: Artifact[], broken: Broken[]) => {
    const shown = all.filter((a) => matches(a, query))
    const pinned = shown.filter((a) => a.pinned)
    const rest = shown.filter((a) => !a.pinned)
    const group = (title: string, as: Artifact[]) => (as.length ? `<h3>${title}</h3><ul>${as.map(rowHtml).join('')}</ul>` : '')
    const none = !shown.length
      ? `<p class="none">${all.length ? `No artifact matches “${esc(query)}”.` : files().length ? 'Reading the catalog…' : 'No artifacts yet: import them from Claude Desktop, or ask a worker to import your claude.ai gallery.'}</p>`
      : ''
    const bad = broken.map((b) => `<p class="broken">${esc(b.id)} is not an artifact entry: ${esc(b.why)}</p>`).join('')
    return group('Pinned', pinned) + group(pinned.length ? 'All the rest' : 'All', rest) + none + bad
  }

  const floorsHtml = (a: Artifact) => {
    const floors = board.floors
    if (!floors.length) return ''
    const pick = floors.find((f) => f.id === floorPick)?.id ?? floors.find((f) => f.id === a.project)?.id ?? floors[0]!.id
    floorPick = pick
    return `<select data-hire-floor aria-label="floor to hire the worker on">${floors.map((f) => `<option value="${esc(f.id)}"${f.id === pick ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}</select>`
  }

  /** The kept page's version, which a new keep changes. */
  const pageVersion = (a: Artifact) => `${a.id}@${collection()?.items.find((i) => i.id === pageOf(a.id))?.modifiedAt ?? 0}`

  /**
   * A frame for the kept page, filled once painted (`fillPage`): its markup read as the item's text and drawn as the
   * frame's document, sandboxed without `allow-same-origin`, so its scripts run at an opaque origin and reach neither
   * the tower page nor its API.
   */
  const pageHtml = (a: Artifact) =>
    `<iframe class="page" title="${esc(a.title)}" data-page="${esc(pageVersion(a))}" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals allow-downloads"></iframe>`

  /** The version each frame holds, so a redraw keeps a frame already filled. */
  const filled = new WeakMap<HTMLIFrameElement, string>()
  const fillPage = (a: Artifact) => {
    const frame = host.querySelector<HTMLIFrameElement>('iframe.page')
    const version = frame?.dataset.page
    if (!frame || !version || filled.get(frame) === version) return
    filled.set(frame, version)
    void tower.text(pathOf(pageOf(a.id))).then(
      (html) => {
        if (filled.get(frame) === version) frame.srcdoc = html
      },
      (err: Error) => {
        if (filled.get(frame) === version) frame.srcdoc = `<p style="font:14px system-ui;color:#555">The kept page can't be read: ${esc(err.message)}</p>`
      },
    )
  }

  const tabOf = (a: Artifact) => tab ?? (hasPage(a.id) ? 'page' : 'context')

  /** Why the page isn't here, and what brings it: a worker reads it on claude.ai, the only place that serves it. */
  const noPageHtml = (a: Artifact, can: boolean) =>
    `<div class="nopage"><p>${a.url ? 'The page is not kept here yet. Only claude.ai serves it, signed in, so a worker reads it there and keeps it.' : 'No page was kept for this artifact, and it has no claude.ai link to read one from.'}</p>
      ${a.url && can ? '<button class="primary" data-keep-page>Fetch page</button>' : ''}</div>`

  /**
   * The reader's head: the artifact's title, what can be done with it, and its tabs. Painted apart from the body, so a
   * label changing here (Pin, Expand) leaves the page's frame, and what the user did in it, alone.
   */
  const headHtml = (a: Artifact) => {
    const can = board.floors.length > 0
    return `<h1>${esc(a.title)}</h1>${a.description ? `<p class="desc">${esc(a.description)}</p>` : ''}
      <div class="acts">${a.url?.startsWith('https://claude.ai/') ? `<a class="secondary" href="${esc(a.url)}" target="_blank" rel="noopener" title="open it in your browser, signed in to claude.ai">Open on claude.ai ↗</a>` : ''}
        <button class="secondary" data-pin="${esc(a.id)}">${a.pinned ? 'Unpin' : 'Pin'}</button>
        ${can ? `${floorsHtml(a)}<button class="secondary" data-work="modify">Modify with a worker</button><button class="secondary" data-work="clone">Clone with a worker</button>` : ''}
        <button class="secondary" data-copy-tag>Copy entry tag</button></div>
      <div class="tabs" role="tablist">${(['page', 'context'] as const).map((t) => `<button class="eyebrow" role="tab" data-tab="${t}" aria-selected="${t === tabOf(a)}">${t === 'page' ? 'Page' : 'Context'}</button>`).join('')}<button class="expand" data-wide aria-pressed="${wide}" title="${wide ? 'show the list again' : 'put the list away, the page taking the width'}">${wide ? '⤡ Show list' : '⤢ Expand'}</button></div>`
  }

  /** The reader's body: the page's frame, which changes only with the page's version, or how the artifact was made. */
  const bodyHtml = (a: Artifact) => {
    const meta: [string, string][] = [
      ['Source', SOURCE_WORDS[a.source]],
      ['Made by', a.callsign ? `${a.callsign}${a.project ? ` on ${a.project}` : ''}` : ''],
      ['Chat', a.chat ?? ''],
      ['Created', day(a.created)],
      ['Updated', day(a.updated)],
      ['Link', a.url ?? ''],
      ['Local page', a.file ?? ''],
      ['Transcript', a.transcript ?? ''],
      ['Entry', tagOf(a.id)],
      ['Page', hasPage(a.id) ? tagOf(pageOf(a.id)) : 'not kept yet: Fetch page has a worker keep it'],
    ]
    const can = board.floors.length > 0
    return `${tabOf(a) === 'page' ? (hasPage(a.id) ? pageHtml(a) : noPageHtml(a, can)) : `<dl>${meta
        .filter(([, v]) => v)
        .map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`)
        .join('')}</dl>
      <h2>Creation context</h2>${a.summary ? `<div class="md">${markdownHtml(a.summary)}</div>` : `<p class="missing">No summary written yet: ask a worker to write one with <code>tower x artifacts context ${esc(a.id)}</code>.</p>`}
      <h2>Prompts that made it</h2>${a.prompts.length ? a.prompts.map((p) => `<blockquote>${esc(p)}</blockquote>`).join('') : '<p class="missing">The chat that made it is not on this machine.</p>'}`}`
  }

  const current = () => {
    const r = open ? reads.get(open)?.artifact : undefined
    return r && isArtifact(r) ? r : undefined
  }

  const draw = () => {
    const all = files().flatMap((i) => (reads.has(i.id) ? [reads.get(i.id)!.artifact] : []))
    const artifacts = all.filter(isArtifact).sort(byUpdated)
    const ordered = [...artifacts.filter((a) => a.pinned), ...artifacts.filter((a) => !a.pinned)]
    if (!open || !artifacts.some((a) => a.id === open)) open = ordered[0]?.id
    paintOnce($('.shelf-head .actions'), closeHtml(board.keys))
    paintOnce($('.list'), listHtml(artifacts, all.filter((a): a is Broken => !isArtifact(a))))
    const a = current()
    $('.reader').classList.toggle('paging', !!a && tabOf(a) === 'page')
    paintOnce($('.rhead'), a ? headHtml(a) : '<p class="empty">Pick an artifact.</p>')
    paintOnce($('.rbody'), a ? bodyHtml(a) : '')
    if (a) fillPage(a)
  }

  /** One of this extension's verbs, which the client's types (the core's verbs) don't name. */
  const ownVerb = tower.call as unknown as (verb: string, input: unknown) => Promise<{ said?: string }>
  const call = (verb: string, input: unknown, done?: string) =>
    ownVerb(verb, input).then(
      (reply) => kit.toast(done ?? reply.said ?? 'Done'),
      (err: Error) => kit.toast(err.message),
    )

  /** A worker on the floor picked, else the first, started on `prompt`, then shown. */
  const hire = (prompt: string) => {
    const project = floorPick ?? board.floors[0]?.id
    if (!project) return kit.toast('A worker starts on a floor: add one first')
    void tower.call('spawn', { project, runtime: 'claude', prompt }).then(
      ({ id }) => kit.display(`card:${id}`),
      (err: Error) => kit.toast(err.message),
    )
  }

  $<HTMLInputElement>('input').addEventListener('input', (e) => {
    query = (e.target as HTMLInputElement).value
    draw()
  })

  host.addEventListener('change', (e) => {
    const select = (e.target as Element).closest<HTMLSelectElement>('[data-hire-floor]')
    if (select) floorPick = select.value
  })

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    if (target.closest('[data-home]')) return kit.display('board')
    if (target.closest('[data-import]')) return void call('artifacts/desktop', {})
    if (target.closest('[data-import-account]')) return hire(IMPORT_PROMPT)
    const pin = target.closest<HTMLElement>('[data-pin]')?.dataset.pin
    if (pin) {
      const r = reads.get(pin)?.artifact
      return void call(r && isArtifact(r) && r.pinned ? 'artifacts/unpin' : 'artifacts/pin', { artifact: pin })
    }
    const a = current()
    if (a && target.closest('[data-keep-page]')) return hire(pagePrompt(a, tagOf(a.id)))
    const picked = target.closest<HTMLElement>('[data-tab]')?.dataset.tab
    if (target.closest('[data-wide]')) return ((wide = !wide), $('.gallery').classList.toggle('wide', wide), draw())
    if (a && picked) return ((tab = picked as 'page' | 'context'), draw())
    if (a && target.closest('[data-copy-tag]')) return void copyTelling(tagOf(a.id), 'the entry tag', kit.toast)
    const work = target.closest<HTMLElement>('[data-work]')?.dataset.work
    if (a && work && floorPick) {
      const tag = tagOf(a.id)
      return hire(work === 'modify' ? modifyPrompt(a, tag) : clonePrompt(a, tag))
    }
    const id = target.closest<HTMLElement>('[data-artifact]')?.dataset.artifact
    if (!id) return
    if (id !== open) tab = undefined
    open = id
    draw()
    $('.reader').scrollTop = 0
  })

  draw()
  void readAll()

  return {
    update(next) {
      board = next
      draw()
      void readAll()
    },
    close() {},
  }
}
