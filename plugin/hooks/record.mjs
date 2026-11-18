// PostToolUse on the Artifact tool: a publish of a page goes to `tower x artifacts record`, and what it says comes back
// to the worker as context, asking it to write the artifact's creation context. Anything else the tool did (a read, a
// list, an asset upload) is left alone. Claude's hook stdin is a socket, which `tower x` reads no text from, so the
// payload goes as the flag.
import { execFileSync } from 'node:child_process'

let text = ''
for await (const chunk of process.stdin) text += chunk
const hook = JSON.parse(text)
const input = hook.tool_input ?? {}
if ((input.action ?? 'publish') !== 'publish' || input.asset || !process.env.TOWER_SESSION_ID) process.exit(0)

let said
try {
  said = execFileSync('tower', ['x', 'artifacts', 'record', '--payload', text], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
} catch (err) {
  // Said to the worker rather than failing its turn: the publish happened, only the catalog missed it.
  said = `The artifacts catalog could not record this publish: ${(err.stderr || err.message).trim()}`
}
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: said } }))
