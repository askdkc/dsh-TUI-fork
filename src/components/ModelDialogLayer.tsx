import React from 'react'
import { Box, useApp, useTerminalSize } from '../ui.js'
import type { DOMElement } from '../ink/dom.js'
import measureElement from '../ink/measure-element.js'

/** Root-level, zero-layout-height modal. Its catcher and card are siblings. */
export function ModelDialogLayer({ children, onClose, onInsufficientSpace, fullscreen }: {
  children(size: { columns: number; rows: number }): React.ReactNode
  onClose(): void
  onInsufficientSpace?(): void
  fullscreen: boolean
}): React.ReactNode {
  const terminal = useTerminalSize()
  const { stdout } = useApp()
  const ref = React.useRef<DOMElement | null>(null)
  const [region, setRegion] = React.useState({ columns: terminal.columns, rows: terminal.rows })
  React.useLayoutEffect(() => {
    const node = ref.current
    const parent = node?.parentNode
    if (!node || !parent) return
    const { width } = measureElement(node)
    const { height } = measureElement(parent)
    let bottom = height
    let rootHeight = height
    for (let ancestor: DOMElement | undefined = parent; ancestor; ancestor = ancestor.parentNode) {
      bottom += ancestor.yogaNode?.getComputedTop() ?? 0
      rootHeight = ancestor.yogaNode?.getComputedHeight() ?? rootHeight
    }
    const terminalRows = stdout.rows ?? terminal.rows
    const visibleTop = rootHeight > terminalRows ? rootHeight - terminalRows + 1 : 0
    const rows = fullscreen ? terminalRows : Math.max(1, Math.min(terminalRows, bottom - visibleTop))
    if (!fullscreen && rows < 8) onInsufficientSpace?.()
    const columns = Math.max(1, width || terminal.columns)
    setRegion(previous => previous.columns === columns && previous.rows === rows ? previous : { columns, rows })
  })
  const visible = region
  const columns = Math.max(1, Math.min(72, visible.columns - 2))
  const rows = Math.max(1, Math.min(26, visible.rows - 2))
  const left = Math.max(0, Math.floor((visible.columns - columns) / 2))
  const bottom = Math.max(0, Math.ceil((visible.rows - rows) / 2))
  const layer = <>
    <Box ref={ref} position="absolute" bottom={0} left={0} width="100%" height={visible.rows} backdrop="dim" onClick={event => { event.stopImmediatePropagation(); onClose() }} />
    <Box position="absolute" bottom={bottom} left={left} width={columns} height={rows} backgroundColor="toolCardBackground" opaque overflow="hidden" onClick={event => event.stopImmediatePropagation()}>
      {children({ columns, rows })}
    </Box>
  </>
  return layer
}
