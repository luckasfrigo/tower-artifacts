// UserPromptSubmit: an artifact the user's prompt refers to is put beside the worker, as `tower show` puts a file, and
// the worker is told which entry it is. A claude.ai artifact link or an entry's tag (the gallery's Copy entry tag) is
// an exact reference, shown at once. A title anywhere in the prompt is a loose one, the user's choice: one such match
// is shown too, but several are shown none of, and the worker asks the user which is meant. A title inside a longer
// title that also matched counts as the longer one. One with no page kept is named, with how to keep it if it is the
// one meant. A prompt that speaks of an artifact already there ("open the smile artifact") names one more loosely, by a
// word of its title, those this worker made first, or, with no word matching, those this worker made; such a
// match is shown or asked about as a title is. Looser references still ("the roadmap") are the worker's to resolve, as
// the extension's guidance says.
// Nothing here fails the prompt: the catalog unreadable, the hook says nothing.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/** At most this many artifacts are shown for one prompt, exact references among them. */
const MOST = 3
/** At most this many candidates are offered when titles disagree: what one AskUserQuestion holds as options. */
const OPTIONS = 4

let text = ''
for await (const chunk of process.stdin) text += chunk
const prompt = String(JSON.parse(text).prompt ?? '')
if (!process.env.TOWER_SESSION_ID || !prompt.trim()) process.exit(0)

const tower = (...args) => execFileSync('tower', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

/** Each kept item's tag by its file, from `tower kept artifacts`: a `  tag  ·  title  ·  …` line, then its path. */
const tagsByFile = (listing) => {
  const tags = new Map()
  const lines = listing.split('\n')
  lines.forEach((line, i) => {
    const tag = /^ {2}([a-z0-9-]+) {2}·/.exec(line)?.[1]
    const file = lines[i + 1]?.trim()
    if (tag && file?.startsWith('/')) tags.set(file, tag)
  })
  return tags
}

/** An entry's title, link and the worker session that made it, from its `# Title` and its JSON header. */
const entryOf = (file) => {
  const md = readFileSync(file, 'utf8')
  const title = /^# (.+)$/m.exec(md)?.[1]?.trim() ?? ''
  const url = /"url":\s*"([^"]+)"/.exec(md)?.[1]
  const session = /"session":\s*"([^"]+)"/.exec(md)?.[1]
  return { title, url, session }
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const said = (needle) => new RegExp(`(^|[^\\w-])${escape(needle)}($|[^\\w-])`, 'i').test(prompt)
/** The artifact ids the prompt links to on claude.ai: the id as `idOfUrl` (client/artifact.ts) reads it. */
const linked = new Set([...prompt.matchAll(/claude\.ai\/(?:code\/)?artifact\/([A-Za-z0-9_-]+)/g)].map((m) => m[1]))

/**
 * A tower-wide collection's folder, read directly so a prompt about nothing costs no call to the tower: the tower-wide
 * collections sit in the system root beside the hooks socket. Where that is not so, `tower kept <name>` names it.
 */
const folder = (name) => {
  const root = process.env.TOWER_HOOKS_SOCKET ? dirname(process.env.TOWER_HOOKS_SOCKET) : undefined
  const dir = root && join(root, 'collections', '_tower', name)
  if (dir && existsSync(dir)) return dir
  const any = tower('kept', name).split('\n').map((l) => l.trim()).find((l) => l.startsWith('/'))
  return any && dirname(any)
}

/** Whether the prompt speaks of an artifact already there ("the smile artifact", "this artifact"), not of a new one, which a looser match needs. */
const aboutArtifacts = /\b(?:the|this|that|my|our|its)\s+(?:[\p{L}\p{N}-]+\s+){0,3}artifacts?\b/iu.test(prompt)
/** A title's words that can name it alone: four letters or more, not the commonest. */
const COMMON = new Set(['with', 'from', 'that', 'this', 'your', 'into', 'page', 'test', 'copy', 'draft', 'untitled'])
const wordsOf = (title) => (title.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []).filter((w) => !COMMON.has(w))
/** Whether the prompt holds a word shaped like an item's tag (`wavy-salmon`), which only `tower kept` can tell. */
const tagShaped = /(^|[^\w-])[a-z]+-[a-z]+($|[^\w-])/.test(prompt)

let entries
try {
  const dir = folder('artifacts')
  if (!dir) process.exit(0)
  const pages = folder('artifacts.pages')
  entries = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const id = basename(f, '.md')
      const page = pages && join(pages, `${id}.html`)
      const { title, url, session } = entryOf(join(dir, f))
      return { id, file: join(dir, f), title: title || id, rawTitle: title, url, session, page: page && existsSync(page) ? page : undefined }
    })
} catch {
  process.exit(0)
}

const isTitled = (a) => a.rawTitle.length >= 6 && a.rawTitle.toLowerCase() !== 'untitled' && prompt.toLowerCase().includes(a.rawTitle.toLowerCase())
const isWorded = (a) => aboutArtifacts && wordsOf(a.rawTitle).some(said)
const mine = entries.filter((a) => a.session && a.session === process.env.TOWER_SESSION_ID)
const maybe = entries.some((a) => linked.has(a.id) || isTitled(a) || isWorded(a)) || (aboutArtifacts && mine.length > 0)
if (!maybe && !tagShaped) process.exit(0)

/** The tags of entries and pages, wanted only now that the prompt may name one: to match one said, and to name each to the worker. */
let tags
try {
  tags = new Map([...tagsByFile(tower('kept', 'artifacts')), ...tagsByFile(tower('kept', 'artifacts.pages'))])
} catch {
  process.exit(0)
}
for (const a of entries) a.tag = tags.get(a.file) ?? a.id

const exact = []
const titled = []
/** Entries the prompt names by a word of their title, when it speaks of an artifact. */
const worded = entries.filter(isWorded)
for (const a of entries) {
  const pageTag = a.page && tags.get(a.page)
  if (linked.has(a.id) || said(a.tag) || (pageTag && said(pageTag))) exact.push(a)
  else if (isTitled(a)) titled.push(a)
}
/** Title matches, less each one inside a longer title that matched too: "Q1 Roadmap" in "Q1 Roadmap — Lanes". */
const byTitle = titled.filter((a) => !titled.some((b) => b !== a && b.title.length > a.title.length && b.title.toLowerCase().includes(a.title.toLowerCase())))
/**
 * With no title said, a prompt speaking of an artifact names one more loosely: by a word of its title ("the smile
 * artifact"), those this worker made first; or, with no word matching, those this worker made, shown when one, asked about when several.
 */
const mineWorded = worded.filter((a) => mine.includes(a))
const loose = exact.length || byTitle.length ? byTitle : mineWorded.length ? mineWorded : worded.length ? worded : aboutArtifacts ? mine : []
if (!exact.length && !loose.length) process.exit(0)

const ifMeant = (a) =>
  a.url
    ? `If it is the one meant, \`tower open ${a.url}\` gives the user the live page in one click; to show it here, read it with the Artifact tool, keep it (\`tower x artifacts page ${a.id} --file <saved.html>\`) and \`tower show\` it.`
    : 'It has no claude.ai link to read one from.'
const shown = (a) => {
  if (!a.page) return `- "${a.title}" (entry ${a.tag}): no page is kept, so nothing was shown. ${ifMeant(a)}`
  try {
    tower('show', a.page, a.title)
    return `- "${a.title}" (entry ${a.tag}): its page is now shown beside you (${a.page}).`
  } catch (err) {
    return `- "${a.title}" (entry ${a.tag}): its page could not be shown: ${(err.stderr || err.message).trim()}`
  }
}

const parts = []
const sure = [...exact, ...(loose.length === 1 ? loose : [])]
if (sure.length) {
  const more = sure.length > MOST ? `\n${sure.length - MOST} more were referred to and not shown.` : ''
  parts.push(`The user's prompt refers to artifacts in the tower's catalog:\n${sure.slice(0, MOST).map(shown).join('\n')}${more}`)
}
if (loose.length > 1) {
  const listed = loose.slice(0, OPTIONS).map((a) => `- "${a.title}" (entry ${a.tag}; ${a.page ? `page ${a.page}` : 'no page kept'})`)
  const others = loose.length > OPTIONS ? `\n${loose.length - OPTIONS} others matched too.` : ''
  parts.push(
    `The user's prompt may refer to any of ${loose.length} artifacts in the tower's catalog, by their titles or words of them, and nothing was shown:\n${listed.join('\n')}${others}\n` +
      'Before doing anything with them, ask the user which one they mean with AskUserQuestion, one option per artifact (its title as the label, its entry tag in the description); its own Other answers none of them. Then `tower show` the page of the one picked, or, with no page kept, read it with the Artifact tool and keep it first. If the prompt is plainly about something else, leave them be.',
  )
}
const context = `${parts.join('\n\n')}\n\`tower read <entry>\` has each one's creation context and the prompts that made it; read it before changing the artifact.`
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context } }))
