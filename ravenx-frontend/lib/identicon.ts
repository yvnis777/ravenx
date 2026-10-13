// lib/identicon.ts

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export interface IdenticonRect {
  x: number
  y: number
  width: number
  height: number
  fill: string
}

export function getIdenticonData(address: string, size = 28): { size: number; rects: IdenticonRect[] } {
  const hash = hashCode(address.toLowerCase())
  const hue = hash % 360
  const cells: boolean[][] = []

  for (let row = 0; row < 4; row++) {
    cells[row] = []
    for (let col = 0; col < 2; col++) {
      const bit = (hash >> (row * 2 + col + 4)) & 1
      cells[row][col] = bit === 1
      cells[row][3 - col] = bit === 1
    }
  }

  const cellSize = size / 4
  const pad = 2
  const innerSize = cellSize - pad

  const colors = [
    `hsl(${hue}, 70%, 55%)`,
    `hsl(${hue}, 60%, 45%)`,
    `hsl(${(hue + 30) % 360}, 50%, 50%)`,
  ]

  const rects: IdenticonRect[] = []
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      if (cells[row][col]) {
        const colorIdx = (hash >> (row + col * 3)) % colors.length
        rects.push({
          x: col * cellSize + pad / 2,
          y: row * cellSize + pad / 2,
          width: innerSize,
          height: innerSize,
          fill: colors[colorIdx],
        })
      }
    }
  }

  return { size, rects }
}
