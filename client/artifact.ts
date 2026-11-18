/**
 * An artifact's catalog entry: one markdown file of the tower-wide `artifacts` collection. A `# Title` line, a ```json
 * header (where it lives, where it came from, when, and whether the user pinned it), then its creation context: a
 * `## Summary` written by a worker, and `## Prompts`, the user's prompts in the chat that made it, as found there.
 * Pure: shared by the server, which writes entries, and the gallery, which reads them.
 */

export const ARTIFACTS = 'artifacts'
/** The project of a tower-wide collection. */
export const TOWER_WIDE = '_tower'

/** Where an artifact was made: a tower worker, a Claude Desktop Cowork chat, or claude.ai, imported from its gallery. */
export const SOURCES = ['tower', 'cowork', 'claude.ai'] as const
export type Source = (typeof SOURCES)[number]

export type Header = {
  url?: string
  source: Source
  /** ISO dates. */
  created?: string
  updated?: string
  pinned?: boolean
  description?: string
  /** The tower worker that published it: its session, callsign and floor. */
  session?: string
  callsign?: string
  project?: string
  /** The local page it was published from. */
  file?: string
  /** The chat that made it: its title, and its transcript on this machine when one is there. */
  chat?: string
  transcript?: string
}

export type Artifact = Header & { id: string; title: string; summary: string; prompts: string[] }
export type Broken = { id: string; why: string }

/** What the first load's worker starts on: the import skill, listing the claude.ai account and adding every artifact, no more. */
export const LIST_PROMPT = '/artifacts:import list: add every artifact of my claude.ai account to the catalog, without reading pages or writing summaries'

/** What the gallery's account import starts on: every artifact, each with its page and a summary. */
export const IMPORT_PROMPT = '/artifacts:import every artifact of my claude.ai account, with its page and a summary'

/** What a worker hired to keep one artifact's page is asked. */
export const pagePrompt = (a: Artifact, tag: string) =>
  `Keep the page of the artifact “${a.title}” (${a.url}) in the catalog: read it with the Artifact tool, keep it with \`tower x artifacts page ${a.id} --file <the saved page>\`, and if its entry (\`tower read ${tag}\`) has no summary, write one with \`tower x artifacts context\`. Use the artifacts:import skill's step 3 for this one artifact only.`

/** An entry's page beside it: `<id>.html` for `<id>.md`, what the gallery shows and a worker `tower show`s. */
export const pageOf = (entry: string) => entry.replace(/\.md$/, '.html')

export const isArtifact = (a: Artifact | Broken): a is Artifact => !('why' in a)

const SUMMARY = '## Summary'
const PROMPTS = '## Prompts'
const NO_SUMMARY = '_None written yet._'

/** The entry's id for an artifact link: its last path segment, so one artifact is one entry whoever records it. */
export const idOfUrl = (url: string) => {
  const m = /claude\.ai\/(?:code\/)?artifact\/([A-Za-z0-9_-]+)/.exec(url)
  if (!m) throw new Error(`${url} is not a claude.ai artifact link (https://claude.ai/artifact/<id>)`)
  return `${m[1]}.md`
}

/** The first claude.ai artifact link in any text, such as a tool's answer. */
export const urlIn = (text: string) => /https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9_-]+/.exec(text)?.[0]

/** The text between `heading` and the next `## ` heading, trimmed; `undefined` when the heading is absent. */
const section = (body: string, heading: string) => {
  const at = body.indexOf(`${heading}\n`)
  if (at < 0) return undefined
  const rest = body.slice(at + heading.length + 1)
  const end = rest.search(/^## /m)
  return (end < 0 ? rest : rest.slice(0, end)).trim()
}

/** A prompt as a blockquote, each of its lines quoted. */
const quote = (p: string) =>
  p
    .split('\n')
    .map((l) => `> ${l}`.trimEnd())
    .join('\n')

const unquote = (block: string) =>
  block
    .split('\n')
    .map((l) => l.replace(/^> ?/, ''))
    .join('\n')

export const artifactOf = (id: string, text: string): Artifact | Broken => {
  const m = /^# (.+)\n+```json\n([\s\S]*?)\n```\n?([\s\S]*)$/.exec(text)
  if (!m) return { id, why: 'expected a `# Title` line, then a ```json header' }
  let header: Header
  try {
    header = JSON.parse(m[2]!)
  } catch (err) {
    return { id, why: `its header is not JSON: ${(err as Error).message}` }
  }
  if (!SOURCES.includes(header.source)) return { id, why: `its source is ${JSON.stringify(header.source)}, not one of ${SOURCES.join(', ')}` }
  const body = m[3]!
  const summary = section(body, SUMMARY)
  const prompts = (section(body, PROMPTS) ?? '').split(/\n\s*\n/).filter((b) => b.trim().startsWith('>'))
  return { ...header, id, title: m[1]!.trim(), summary: summary === NO_SUMMARY ? '' : (summary ?? body.trim()), prompts: prompts.map(unquote) }
}

export const formatArtifact = ({ id: _, title, summary, prompts, ...header }: Artifact) => {
  const kept = Object.fromEntries(Object.entries(header).filter(([, v]) => v !== undefined && v !== ''))
  return `# ${title}\n\n\`\`\`json\n${JSON.stringify(kept, null, 2)}\n\`\`\`\n\n${SUMMARY}\n\n${summary.trim() || NO_SUMMARY}\n\n${PROMPTS}\n\n${
    prompts.length ? prompts.map(quote).join('\n\n') : '_None found: the chat that made it is not on this machine._'
  }\n`
}

/** Newest first, by when it last changed. */
export const byUpdated = (a: Artifact, b: Artifact) => (b.updated ?? b.created ?? '').localeCompare(a.updated ?? a.created ?? '')

export const matches = (a: Artifact, query: string) => {
  const q = query.trim().toLowerCase()
  return !q || [a.title, a.description, a.summary, a.callsign, a.project, a.chat, a.source].some((s) => s?.toLowerCase().includes(q))
}

/**
 * How a worker starts on an artifact: from its entry, so it works from the context, not from scratch. One never shared
 * to claude.ai (a Cowork artifact kept in Claude Desktop) has no page to read: it is rebuilt from its entry and chat.
 */
const readFirst = (a: Artifact, tag: string) =>
  `the artifact “${a.title}”${a.url ? ` (${a.url})` : ''}. Read its catalog entry first with \`tower read ${tag}\`: it says how and why it was made. Then ${
    a.url ? 'read the published page with the Artifact tool' : 'read the chat that made it, which its entry names: it was never published to claude.ai, so its page lives only in Claude Desktop'
  }`

/** What a worker hired to modify an artifact is asked. */
export const modifyPrompt = (a: Artifact, tag: string) =>
  `Modify ${readFirst(a, tag)}, ask me what to change, and publish ${a.url ? 'the change to the same link' : 'the result as a new artifact'}. Use the artifacts:work skill.`

/** What a worker hired to make a new artifact from one is asked. */
export const clonePrompt = (a: Artifact, tag: string) =>
  `Make a new artifact from ${readFirst(a, tag)}, ask me what the new one is for, and publish it as a new artifact, leaving the original as it is. Use the artifacts:work skill.`
