// UserPromptSubmit: an artifact the user's prompt refers to is put beside the worker, as `tower show` puts a file, and
// the worker is told which entry it is. A claude.ai artifact link or an entry's tag (the gallery's Copy entry tag) is
// an exact reference, shown at once. A title anywhere in the prompt is a loose one, the user's choice: one such match
// is shown too, but several are shown none of, and the worker asks the user which is meant. A title inside a longer
// title that also matched counts as the longer one. One with no page kept is named, with how to keep it if it is the
// one meant. Looser references still ("the roadmap") are the worker's to resolve, as the extension's guidance says.
// Nothing here fails the prompt: the catalog unreadable, the hook says nothing.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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

/** An entry's title and link, from its `# Title` and its JSON header's `url`. */
const entryOf = (file) => {
  const md = readFileSync(file, 'utf8')
  const title = /^# (.+)$/m.exec(md)?.[1]?.trim() ?? ''
  const url = /"url":\s*"([^"]+)"/.exec(md)?.[1]
  return { title, url }
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const said = (needle) => new RegExp(`(^|[^\\w-])${escape(needle)}($|[^\\w-])`, 'i').test(prompt)
/** The artifact ids the prompt links to on claude.ai: the id as `idOfUrl` (client/artifact.ts) reads it. */
const linked = new Set([...prompt.matchAll(/claude\.ai\/(?:code\/)?artifact\/([A-Za-z0-9_-]+)/g)].map((m) => m[1]))

let tags
try {
  tags = tagsByFile(tower('kept', 'artifacts'))
} catch {
  process.exit(0)
}

const exact = []
const titled = []
for (const [file, tag] of tags) {
  if (!file.endsWith('.md')) continue
  const id = basename(file, '.md')
  const page = join(dirname(file), `${id}.html`)
  const pageTag = tags.get(page)
  const { title, url } = entryOf(file)
  const a = { id, tag, title: title || id, url, page: pageTag ? page : undefined }
  if (linked.has(id) || said(tag) || (pageTag && said(pageTag))) exact.push(a)
  else if (title.length >= 6 && title.toLowerCase() !== 'untitled' && prompt.toLowerCase().includes(title.toLowerCase())) titled.push(a)
}
/** Title matches, less each one inside a longer title that matched too: "Q1 Roadmap" in "Q1 Roadmap — Lanes". */
const loose = titled.filter((a) => !titled.some((b) => b !== a && b.title.length > a.title.length && b.title.toLowerCase().includes(a.title.toLowerCase())))
if (!exact.length && !loose.length) process.exit(0)

const ifMeant = (a) => (a.url ? `If it is the one meant, read it with the Artifact tool (${a.url}), keep it (\`tower x artifacts page ${a.id} --file <saved.html>\`) and \`tower show\` it.` : 'It has no claude.ai link to read one from.')
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
  const others = loose.length > OPTIONS ? `\n${loose.length - OPTIONS} other titles matched too.` : ''
  parts.push(
    `The user's prompt names the titles of ${loose.length} artifacts in the tower's catalog, and nothing was shown:\n${listed.join('\n')}${others}\n` +
      'Before doing anything with them, ask the user which one they mean with AskUserQuestion, one option per artifact (its title as the label, its entry tag in the description); its own Other answers none of them. Then `tower show` the page of the one picked, or, with no page kept, read it with the Artifact tool and keep it first. If the prompt is plainly about something else, leave them be.',
  )
}
const context = `${parts.join('\n\n')}\n\`tower read <entry>\` has each one's creation context and the prompts that made it; read it before changing the artifact.`
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context } }))
