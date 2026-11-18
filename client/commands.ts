import type { Subject } from '/lib/board.js'
import type { CommandKit } from '/lib/view.js'

/** `artifacts/open`, on the board: the gallery in the main pane. */
export const openGallery = ({ kit }: { target: Subject; kit: CommandKit }) => kit.display('board', { view: 'artifacts/gallery' })
