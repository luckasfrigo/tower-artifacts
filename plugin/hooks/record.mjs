// PostToolUse on the Artifact tool: a publish of a page goes to `tower x artifacts record`, and what it says comes back
// to the worker as context, asking it to write the artifact's creation context. The page the record kept is then put
// beside the worker with `tower show`, after every publish, first or later, so the user sees it in the tower (Claude
// Code opens it in the browser as well, which no hook can stop). Anything else the tool did (a read, a list, an asset
// upload) is left alone. Claude's hook stdin is a socket, which `tower x` reads no text from, so the payload goes as the
// flag.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

let text = ''
for await (const chunk of process.stdin) text += chunk
const hook = JSON.parse(text)
const input = hook.tool_input ?? {}
if ((input.action ?? 'publish') !== 'publish' || input.asset || !process.env.TOWER_SESSION_ID) process.exit(0)

const tower = (...args) => execFileSync('tower', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const failed = (err) => (err.stderr || err.message).trim()

let said
try {
  said = tower('x', 'artifacts', 'record', '--payload', text)
} catch (err) {
  // Said to the worker rather than failing its turn: the publish happened, only the catalog missed it.
  said = `The artifacts catalog could not record this publish: ${failed(err)}`
}

/** The id of the artifact the publish answered with: the id as `idOfUrl` (client/artifact.ts) reads it. */
const idIn = (s) => /claude\.ai\/(?:code\/)?artifact\/([A-Za-z0-9_-]+)/.exec(s)?.[1]

/** The kept page of the published artifact, as `tower kept artifacts.pages` lists it, and its title. */
const keptPage = () => {
  const id = idIn(JSON.stringify(hook.tool_response ?? '')) ?? idIn(String(input.url ?? ''))
  if (!id) return undefined
  const page = tower('kept', 'artifacts.pages')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('/') && line.endsWith(`/${id}.html`))
  if (!page) return undefined
  const title = /<title>([^<]*)<\/title>/i.exec(readFileSync(page, 'utf8'))?.[1]?.trim()
  return { page, title: title || input.title || id }
}

try {
  const kept = keptPage()
  if (kept) {
    tower('show', kept.page, kept.title)
    said += ` Its kept page is now shown beside you (${kept.page}), so the user sees it: don't also \`tower show\` the local file you published from, which would only show the same page twice. To show it again after a change, publish it (this hook shows it then) or \`tower show\` that kept file; the Artifact tool's open goes to the browser, not the tower.`
  }
} catch (err) {
  said += ` Its page could not be shown beside you: ${failed(err)}`
}
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: said } }))
