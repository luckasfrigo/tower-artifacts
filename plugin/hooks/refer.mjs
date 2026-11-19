// UserPromptSubmit: an artifact the user's prompt refers to is put beside the worker, as `tower show` puts a file, and
// the worker is told which entry it is. A reference is a claude.ai artifact link, an entry's tag (the gallery's Copy
// entry tag), or an artifact's whole title. Each kept page is shown; one with no page kept is named, with how to keep
// it. Looser references ("the roadmap") are the worker's to resolve, as the extension's guidance says. Nothing here
// fails the prompt: the catalog unreadable, the hook says nothing.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/** At most this many artifacts are shown for one prompt. */
const MOST = 3

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
/** The artifact ids the prompt links to on claude.ai. */
const linked = new Set([...prompt.matchAll(/claude\.ai\/(?:code\/)?artifact\/([A-Za-z0-9-]+)/g)].map((m) => m[1]))

let tags
try {
  tags = tagsByFile(tower('kept', 'artifacts'))
} catch {
  process.exit(0)
}

const found = []
for (const [file, tag] of tags) {
  if (!file.endsWith('.md')) continue
  const id = basename(file, '.md')
  const page = join(dirname(file), `${id}.html`)
  const pageTag = tags.get(page)
  const { title, url } = entryOf(file)
  const byTitle = title.length >= 6 && title.toLowerCase() !== 'untitled' && prompt.toLowerCase().includes(title.toLowerCase())
  if (linked.has(id) || said(tag) || (pageTag && said(pageTag)) || byTitle) found.push({ id, tag, title: title || id, url, page: pageTag ? page : undefined })
}
if (!found.length) process.exit(0)

const lines = found.slice(0, MOST).map((a) => {
  if (!a.page) return `- "${a.title}" (entry ${a.tag}): no page is kept, so nothing was shown. ${a.url ? `Read it with the Artifact tool (${a.url}) and keep it: \`tower x artifacts page ${a.id} --file <saved.html>\`, then \`tower show\` it.` : 'It has no claude.ai link to read one from.'}`
  try {
    tower('show', a.page, a.title)
    return `- "${a.title}" (entry ${a.tag}): its page is now shown beside you (${a.page}).`
  } catch (err) {
    return `- "${a.title}" (entry ${a.tag}): its page could not be shown: ${(err.stderr || err.message).trim()}`
  }
})
const more = found.length > MOST ? `\n${found.length - MOST} more matched and were not shown.` : ''
const context = `The user's prompt refers to artifacts in the tower's catalog:\n${lines.join('\n')}${more}\n\`tower read <entry>\` has each one's creation context and the prompts that made it; read it before changing the artifact.`
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context } }))
