import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { Card } from '/lib/board.js'
import { apiError, type CallCtx, isApiError, type Start, type StreamFact } from '/lib/extension.js'
import { type Artifact, ARTIFACTS, LIST_PROMPT, pageOf, artifactOf, formatArtifact, type Header, idOfUrl, isArtifact, TOWER_WIDE, urlIn } from './client/artifact.ts'

/**
 * The artifacts catalog's writer: every verb that changes an entry of the tower-wide `artifacts` collection. `record`
 * takes a worker's Artifact publish as its Claude hook saw it; `desktop` reads Claude Desktop's Cowork artifacts and the
 * chats that made them, on this machine; `add` takes one a worker found in the claude.ai gallery; `context` writes an
 * entry's summary; `pin` and `unpin` keep the important ones on top. Nothing here reaches the network: what only
 * claude.ai knows, a worker brings with its Artifact tool.
 */

type Settings = { desktop: string; floor?: string }

/** What the `loads` stream folds to: whether the first load hired its account import, and whom. */
type Loads = { hired?: { session: string; project: string; at: number } }


/** How many of a chat's prompts an entry keeps, the latest, and how much of each. */
const PROMPTS = 8
const PROMPT_CHARS = 1500

const expand = (path: string) => (path.startsWith('~/') ? join(homedir(), path.slice(2)) : path)

/** The prompts the user typed in a Claude transcript, oldest first: not tool results, commands' wrappers or the harness's notes. */
export const promptsIn = (jsonl: string): string[] => {
  const prompts: string[] = []
  for (const line of jsonl.split('\n')) {
    if (!line.includes('"type":"user"')) continue
    let entry: { type?: string; isMeta?: boolean; message?: { content?: unknown } }
    try {
      entry = JSON.parse(line)
    } catch {
      continue // a line cut short by a write in progress: the transcript's newest, read again on the next record
    }
    if (entry.type !== 'user' || entry.isMeta) continue
    const content = entry.message?.content
    const text =
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content
              .filter((b): b is { type: 'text'; text: string } => b?.type === 'text')
              .map((b) => b.text)
              .join('\n')
          : ''
    const plain = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
    if (!plain || /^<(command-|local-command|bash-|task-notification)/.test(plain) || plain.startsWith('[Request interrupted')) continue
    prompts.push(plain.length > PROMPT_CHARS ? `${plain.slice(0, PROMPT_CHARS)}…` : plain)
  }
  return prompts.slice(-PROMPTS)
}

const promptsOf = async (transcript: string | undefined) => (transcript ? promptsIn(await readFile(transcript, 'utf8').catch(() => '')) : [])

/** A local page's `<title>`, when it has one. */
const titleOf = async (file: string) => {
  const html = await readFile(file, 'utf8').catch(() => '')
  return /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || undefined
}

const iso = (ms: number) => new Date(ms).toISOString()

/** Where an entry is named: an artifact link, or its id with or without `.md`. */
const idOf = (named: string) => (named.includes('claude.ai/') ? idOfUrl(named) : named.endsWith('.md') ? named : `${named}.md`)

type Cowork = { id: string; name: string; description?: string; createdAt: number; updatedAt?: number; createdBySessionId?: string; sharedArtifactUuid?: string }
type CoworkSession = { title?: string; initialMessage?: string; cliSessionId?: string }

/** The folders under `root` two levels down that hold Claude Desktop's Cowork `artifacts.json`, one per account and org. */
const coworkDirs = async (root: string) => {
  const base = join(root, 'local-agent-mode-sessions')
  const dirs: string[] = []
  for (const a of await readdir(base, { withFileTypes: true }).catch(() => [])) {
    if (!a.isDirectory()) continue
    for (const b of await readdir(join(base, a.name), { withFileTypes: true }).catch(() => [])) {
      const dir = join(base, a.name, b.name)
      if (b.isDirectory() && (await readdir(dir).catch(() => [] as string[])).includes('artifacts.json')) dirs.push(dir)
    }
  }
  return dirs
}

/** A local Cowork session's chat: its title, first message, and its transcript when it is still on disk. */
const coworkChat = async (dir: string, session: string) => {
  const meta: CoworkSession = await readFile(join(dir, `${session}.json`), 'utf8').then(JSON.parse, () => ({}))
  let transcript: string | undefined
  if (meta.cliSessionId) {
    const projects = join(dir, session, '.claude', 'projects')
    for (const p of await readdir(projects).catch(() => [] as string[])) {
      const file = join(projects, p, `${meta.cliSessionId}.jsonl`)
      if (await readFile(file, 'utf8').then(() => true, () => false)) transcript = file
    }
  }
  return { meta, transcript }
}

const start: Start = (ctx) => {
  const settings = ctx.settings as Settings

  const entries = () => ctx.collections.list(TOWER_WIDE, ARTIFACTS)

  /** The entry by id as it stands, or `undefined`: one a hand broke is refused rather than written over. */
  const existing = async (id: string): Promise<Artifact | undefined> => {
    if (!entries().some((i) => i.id === id)) return undefined
    const a = artifactOf(id, await ctx.collections.read(TOWER_WIDE, ARTIFACTS, id))
    if (!isArtifact(a)) throw Object.assign(new Error(`${id} is not an artifact entry (${a.why}): fix it by hand or delete it`), { code: 'invalid' })
    return a
  }

  /** Writes an entry over what it was, keeping what only the user or a worker writes: the pin and the summary. */
  const upsert = async (id: string, next: Omit<Artifact, 'id' | 'pinned' | 'summary'> & { summary?: string }) => {
    const was = await existing(id)
    const artifact: Artifact = { ...next, id, created: was?.created ?? next.created, pinned: was?.pinned, summary: next.summary ?? was?.summary ?? '' }
    const item = await ctx.collections.put(TOWER_WIDE, ARTIFACTS, id, formatArtifact(artifact))
    return { item, isNew: !was }
  }

  /** Changes one entry the caller names, refusing a name with no entry. */
  const change = async (named: string, how: (a: Artifact) => Artifact) => {
    const id = idOf(named)
    const was = await existing(id)
    if (!was) return undefined
    return ctx.collections.put(TOWER_WIDE, ARTIFACTS, id, formatArtifact(how(was)))
  }

  const notFound = (named: string) => apiError('not_found', `No artifact entry is ${named}: \`tower kept artifacts\` lists them`)

  /** Turns an error a helper threw with a code into the API's, so a broken entry is said, not an `internal`. */
  const said = async <T>(fn: () => Promise<T>) => {
    try {
      return await fn()
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'invalid') return apiError('invalid', (err as Error).message)
      throw err
    }
  }

  const cardOf = (caller: CallCtx['caller'], c: CallCtx): Card | undefined =>
    caller.t === 'worker' ? c.cards().find((card) => card.id === caller.id) : undefined

  const pinTo = (pinned: boolean) => async ({ artifact }: { artifact: string }) =>
    said(async () => {
      const item = await change(artifact, (a) => ({ ...a, pinned: pinned || undefined }))
      return item ? { id: item.id, tag: item.tag, pinned, said: `${pinned ? 'Pinned' : 'Unpinned'} ${item.tag}` } : notFound(artifact)
    })

  /** The collection's folder on disk, as the board says. */
  const dirOf = () => {
    const c = ctx.board().collections.find((c) => c.id === ARTIFACTS)
    if (!c) throw new Error(`the board holds no ${ARTIFACTS} collection`)
    return c.dir
  }

  /** Keeps `file`, as it is, as the entry's page. */
  const keepPage = async (entry: string, file: string) => ctx.collections.put(TOWER_WIDE, ARTIFACTS, pageOf(entry), await readFile(file, 'utf8'))

  /**
   * What a publish's page came to, said after its record: kept when it is html, as published (a fragment the Artifact
   * tool wraps in its skeleton included), or why not. Never a failure of the record, which is the hook's point.
   */
  const keptWords = async (entry: string, file: string | undefined) => {
    if (!file) return ''
    if (!/\.html?$/i.test(file)) return ` Its page (${basename(file)}) is not html, so the gallery can't show it.`
    try {
      await keepPage(entry, file)
      return ' Its page is kept beside it.'
    } catch (err) {
      return ` Its page was not kept: ${(err as Error).message}.`
    }
  }

  /** Every Cowork artifact in Claude Desktop's data, into the catalog: new ones added, those in refreshed. */
  const importDesktop = async () => {
    const root = expand(settings.desktop)
    const dirs = await coworkDirs(root)
    const ids: string[] = []
    let added = 0
    for (const dir of dirs) {
      const list: Cowork[] = JSON.parse(await readFile(join(dir, 'artifacts.json'), 'utf8'))
      for (const a of list) {
        const url = a.sharedArtifactUuid ? `https://claude.ai/code/artifact/${a.sharedArtifactUuid}` : undefined
        const id = url ? idOfUrl(url) : `cowork-${a.id}.md`
        const session = a.createdBySessionId
        const { meta, transcript } = session?.startsWith('local_') ? await coworkChat(dir, session) : { meta: {} as CoworkSession, transcript: undefined }
        const prompts = transcript ? await promptsOf(transcript) : meta.initialMessage ? [meta.initialMessage.slice(0, PROMPT_CHARS)] : []
        const header: Omit<Header, 'pinned'> = {
          url,
          source: 'cowork',
          created: iso(a.createdAt),
          updated: iso(a.updatedAt ?? a.createdAt),
          description: a.description,
          chat: meta.title ?? (session ? `Cowork session ${session}` : undefined),
          transcript,
        }
        const { isNew } = await upsert(id, { ...header, title: a.name, prompts })
        ids.push(id)
        if (isNew) added++
      }
    }
    return { root, dirs, ids, added }
  }

  /**
   * The first load: once, as the tower first runs the extension, every artifact there is, listed. Claude Desktop's
   * Cowork artifacts are on this machine and read here; the claude.ai account is reached only through Claude's
   * Artifact tool, which only an interactive session has, so a worker is hired to list it and add each entry, on the
   * `floor` setting's floor or the board's first. Pages and summaries, one Artifact read each, are left to the
   * gallery's buttons: the user's call. The hire is the stream's fact, so a restart doesn't hire again. Waits each tick
   * for a floor to hire on; a failure is logged and not tried again until the extension restarts.
   */
  const firstLoad = async () => {
    if (tried || (ctx.own.streams('loads') as Loads).hired) return
    const floors = ctx.board().floors
    const project = floors.find((f) => f.id === settings.floor)?.id ?? floors[0]?.id
    if (!project) return
    tried = true
    try {
      const desktop = await importDesktop()
      ctx.log(`first load: ${desktop.ids.length} Cowork artifacts from ${desktop.root}, ${desktop.added} new`)
    } catch (err) {
      ctx.log(`first load: Claude Desktop's artifacts couldn't be read: ${(err as Error).message}. Fix it, then press Refresh from Claude Desktop in the gallery`)
    }
    const reply = (await ctx.call('tower/spawn', { project, runtime: 'claude', prompt: LIST_PROMPT })) as { id: string } | ReturnType<typeof apiError>
    if (isApiError(reply))
      return ctx.log(`first load: the account import couldn't be hired on ${project}: ${reply.message}. Press Import my claude.ai account in the gallery once it can`)
    await ctx.streams.append('loads', {}, 'h', { session: reply.id, project })
    ctx.log(`first load: hired ${reply.id} on ${project} to list the claude.ai account`)
  }
  let tried = false
  ctx.every(5_000, firstLoad)

  return {
    reduce: { loads: { init: {}, step: (_: Loads, [at, , fact]: StreamFact<'h', { session: string; project: string }>): Loads => ({ hired: { ...fact, at } }) } },
    reads: {
      'page/<id>': ({ params }: { params: Record<string, string> }) => {
        const page = pageOf(idOf(params.id!))
        if (!ctx.collections.list(TOWER_WIDE, ARTIFACTS).some((i) => i.id === page))
          return apiError('not_found', `${params.id} has no page kept: a worker keeps it with \`tower x artifacts page ${params.id} --file <saved.html>\``)
        return { file: join(dirOf(), page) }
      },
    },
    verbs: {
      record: async ({ payload }: { payload: string }, c: CallCtx) =>
        said(async () => {
          let hook: { tool_name?: string; tool_input?: Record<string, unknown>; tool_response?: unknown; transcript_path?: string }
          try {
            hook = JSON.parse(payload)
          } catch (err) {
            return apiError('invalid', `payload is a PostToolUse hook's JSON: ${(err as Error).message}`)
          }
          const input = hook.tool_input ?? {}
          if (hook.tool_name !== 'Artifact' || (input.action ?? 'publish') !== 'publish' || input.asset)
            return apiError('invalid', 'record takes an Artifact publish of a page: another tool, action or an asset upload is not an artifact')
          const url = urlIn(JSON.stringify(hook.tool_response ?? '')) ?? (typeof input.url === 'string' ? input.url : undefined)
          if (!url) return apiError('invalid', 'The publish answered no claude.ai artifact link: nothing to record')
          const id = idOfUrl(url)
          const was = await existing(id)
          const file = typeof input.file_path === 'string' ? input.file_path : undefined
          const card = cardOf(c.caller, c)
          const title = (file && (await titleOf(file))) || (typeof input.title === 'string' ? input.title : undefined) || was?.title || (file ? basename(file) : id)
          const now = iso(Date.now())
          const { item, isNew } = await upsert(id, {
            title,
            url,
            source: was?.source ?? 'tower',
            created: now,
            updated: now,
            description: (typeof input.description === 'string' ? input.description : undefined) ?? was?.description,
            session: was?.session ?? card?.id ?? (c.caller.t === 'worker' ? c.caller.id : undefined),
            callsign: was?.callsign ?? card?.callsign,
            project: was?.project ?? card?.project,
            file: file ?? was?.file,
            chat: was?.chat,
            transcript: was?.transcript ?? hook.transcript_path,
            // The chat that made it is its context: a later change, maybe by another worker, keeps the first one's prompts.
            prompts: was?.prompts.length ? was.prompts : await promptsOf(hook.transcript_path),
          })
          const ask = was?.summary
            ? `If this change alters what it is for, update its summary: tower x artifacts context ${item.id} <<'EOF' … EOF`
            : `Write its creation context now, while you hold it, so another worker can modify or clone it without redoing it: tower x artifacts context ${item.id} <<'EOF' … EOF (what it is for, who asked and why, the data and sources it draws on, the choices made and what was ruled out, and how it is built).`
          const kept = await keptWords(item.id, file)
          return { id: item.id, tag: item.tag, isNew, said: `${isNew ? 'Recorded' : 'Updated'} the artifact “${title}” in the catalog as ${item.tag}.${kept} ${ask}` }
        }),

      add: async (input: { url: string; title: string; created?: string; updated?: string; description?: string; summary?: string }) =>
        said(async () => {
          const id = idOf(input.url)
          const was = await existing(id)
          const { item, isNew } = await upsert(id, {
            ...(was ?? { source: 'claude.ai' as const, prompts: [] }),
            title: input.title,
            url: input.url,
            created: input.created ?? was?.created,
            updated: input.updated ?? was?.updated,
            description: input.description ?? was?.description,
            summary: input.summary?.trim() || undefined,
          })
          return { id: item.id, tag: item.tag, isNew, said: `${isNew ? 'Added' : 'Updated'} ${item.tag}` }
        }),

      desktop: async () =>
        said(async () => {
          const { root, dirs, ids, added } = await importDesktop()
          if (!dirs.length) return apiError('not_found', `No Claude Desktop Cowork artifacts under ${root}: set the extension's \`desktop\` setting to Claude Desktop's data folder`)
          return { ids, added, said: `Read ${ids.length} Cowork artifacts from Claude Desktop: ${added} new, ${ids.length - added} refreshed` }
        }),

      page: async ({ artifact, file }: { artifact: string; file: string }) =>
        said(async () => {
          const id = idOf(artifact)
          if (!(await existing(id))) return notFound(artifact)
          // A read's saved page, refused only when it holds no markup at all: a fragment is a page the tool wraps.
          if (!/<[a-z!][^>]*>/i.test(await readFile(file, 'utf8')))
            return apiError('invalid', `${file} holds no html: keep the page the Artifact tool's read gave, saved as a file`)
          const item = await keepPage(id, file)
          return { id: item.id, tag: item.tag, said: `Kept the page of ${id} as ${item.tag}: \`tower show ${join(dirOf(), item.id)}\` shows it beside you` }
        }),

      context: async ({ artifact, summary }: { artifact: string; summary: string }) =>
        said(async () => {
          if (!summary.trim()) return apiError('invalid', `context needs the summary on stdin: tower x artifacts context ${artifact} <<'EOF' … EOF`)
          const item = await change(artifact, (a) => ({ ...a, summary }))
          return item ? { id: item.id, tag: item.tag, said: `Wrote the creation context of ${item.tag}` } : notFound(artifact)
        }),

      pin: pinTo(true),
      unpin: pinTo(false),
    },
  }
}

export default start
