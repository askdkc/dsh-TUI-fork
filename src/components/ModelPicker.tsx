import React from 'react'
import { Box, Text } from '../ui.js'
import { t } from '../i18n.js'
import type { ModelPickerRow } from '../modelPickerRows.js'
import { focusedModelRow } from '../modelPickerRows.js'
import type { ModelRef } from '../modelGroups.js'
import { listWindow } from './listWindow.js'
import { SearchBox } from './SearchBox.js'
import { ListItem } from './design-system/ListItem.js'
import { useTerminalFocus } from '../ink/hooks/use-terminal-focus.js'

export function ModelPicker({ rows, focusIndex, currentModel, favorites, query, cursor, height, status, switching, onPick, onWheelStep }: {
  rows: readonly ModelPickerRow[]
  focusIndex: number
  currentModel: string
  favorites: readonly ModelRef[]
  query: string
  cursor: number
  height: number
  status: 'loading' | 'ready' | 'error'
  switching: boolean
  onPick(index: number): void
  onWheelStep(step: number): void
}): React.ReactNode {
  const terminalFocused = useTerminalFocus()
  const available = Math.max(1, height - 6)
  const window = listWindow(rows.map(() => 1), focusIndex, available)
  const focused = focusedModelRow(rows, focusIndex)
  const route = focused ? `${focused.model.provider}/${focused.model.id}` : ''
  const hint = switching ? t('model-switching', { name: focused?.model.name ?? '' }) : t('hint-model-dialog')
  return (
    <Box flexDirection="column" width="100%" height={height} paddingX={1} overflow="hidden" onWheel={(event) => {
      event.stopImmediatePropagation()
      onWheelStep(event.deltaY < 0 ? -1 : 1)
    }}>
      <Box flexDirection="row" justifyContent="space-between"><Text bold>{t('picker-title-model')}</Text><Text dimColor>esc</Text></Box>
      <SearchBox query={query} cursorOffset={cursor} isFocused isTerminalFocused={terminalFocused} borderless placeholder={t('picker-model-search')} />
      <Text dimColor>{t('picker-model-results', { count: rows.filter(row => row.kind === 'model').length })}</Text>
      {rows.length === 0 && <Text dimColor>{t(status === 'loading' ? 'model-loading' : status === 'error' ? 'picker-model-error' : query.trim() ? 'picker-model-no-match' : 'picker-model-empty')}</Text>}
      {rows.slice(window.start, window.end).map((row, offset) => row.kind === 'heading'
        ? <Text key={row.key} color="warning" bold wrap="truncate-end">{row.key === 'heading:favorites' ? t('picker-model-favorites') : row.key === 'heading:recent' ? t('picker-group-recent') : row.label}</Text>
        : <Box key={row.key} width="100%" height={1} overflow="hidden" backgroundColor={window.start + offset === focusIndex ? 'userMessageBackgroundHover' : undefined}>
            <ListItem isFocused={window.start + offset === focusIndex} isSelected={`${row.model.provider}/${row.model.id}` === currentModel} declareCursor={false} onClick={() => onPick(window.start + offset)}>
              {favorites.some(ref => ref.provider === row.model.provider && ref.id === row.model.id) ? '★ ' : ''}{row.model.name}<Text dimColor>{`  ${row.providerName}`}</Text>
            </ListItem>
          </Box>)}
      <Box flexGrow={1} />
      <Text dimColor wrap="truncate-end">{route}</Text>
      <Text dimColor wrap="truncate-end">{hint}</Text>
    </Box>
  )
}
