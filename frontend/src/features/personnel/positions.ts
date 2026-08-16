export const OFFICIAL_POSITIONS = [
  'Chairman',
  'Kagawad',
  'SK Chairman',
  'SK Council',
] as const

export const APPOINTEE_POSITIONS = [
  'Secretary',
  'Treasurer',
  'SK Secretary',
  'SK Treasurer',
  'Tanod',
  'Lupon',
  'Admin',
  'BHW',
  'BNS',
  'Street Sweeper',
] as const

export type PersonnelCategory = 'official' | 'appointee'

export function getPersonnelCategory(position: string): PersonnelCategory | null {
  if ((OFFICIAL_POSITIONS as readonly string[]).includes(position)) return 'official'
  if ((APPOINTEE_POSITIONS as readonly string[]).includes(position)) return 'appointee'
  return null
}

export function positionsForCategory(category: PersonnelCategory): readonly string[] {
  return category === 'official' ? OFFICIAL_POSITIONS : APPOINTEE_POSITIONS
}
