import { bigTextWidth } from './bigfont.js'

/** Width reserved for the whale's widest animated frame. */
export const WHALE_BOX_WIDTH = 40
export const COLUMN_GAP = 2

/** Choose one complete splash layout for the available content columns. */
export function resolveSplashLayout(columns: number, { whale }: { whale: boolean }): {
  showWhale: boolean
  showBigTitle: boolean
  showPlainTitle: boolean
} {
  const titleWidth = bigTextWidth('DEEPSEEK')
  if (whale && columns >= WHALE_BOX_WIDTH + COLUMN_GAP + titleWidth) {
    return { showWhale: true, showBigTitle: true, showPlainTitle: false }
  }
  if (columns >= titleWidth) {
    return { showWhale: false, showBigTitle: true, showPlainTitle: false }
  }
  if (whale && columns >= WHALE_BOX_WIDTH) {
    return { showWhale: true, showBigTitle: false, showPlainTitle: false }
  }
  return { showWhale: false, showBigTitle: false, showPlainTitle: true }
}
