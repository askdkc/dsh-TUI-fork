import { getGraphemeSegmenter } from '../utils/intl.js'

/** UTF-16 offsets used by SearchBox, stepped at complete Unicode characters. */
export function previousModelQueryBoundary(query: string, cursor: number): number {
  let previous = 0
  for (const { index } of getGraphemeSegmenter().segment(query)) {
    if (index >= cursor) break
    previous = index
  }
  return previous
}

export function nextModelQueryBoundary(query: string, cursor: number): number {
  for (const { index, segment } of getGraphemeSegmenter().segment(query)) {
    const end = index + segment.length
    if (end > cursor) return end
  }
  return query.length
}
