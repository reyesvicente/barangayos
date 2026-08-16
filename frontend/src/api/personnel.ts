import type { RecordModel } from 'pocketbase'
import { getClient } from './client'
import { handleApiError } from './errorHandler'

export interface PersonnelData {
  resident_id: string
  position: string
  term_start?: string
  term_end?: string
  status: 'Active' | 'Inactive'
  remarks?: string
}

export interface ApiPersonnel extends RecordModel, PersonnelData {}

export async function getPersonnel(): Promise<ApiPersonnel[]> {
  try {
    return await getClient().collection('barangay_personnel').getFullList<ApiPersonnel>({ sort: '-created' })
  } catch (err) { throw handleApiError(err) }
}

export async function createPersonnel(data: PersonnelData): Promise<ApiPersonnel> {
  try {
    return await getClient().collection('barangay_personnel').create<ApiPersonnel>(data)
  } catch (err) { throw handleApiError(err) }
}

export async function updatePersonnel(id: string, data: Partial<PersonnelData>): Promise<ApiPersonnel> {
  try {
    return await getClient().collection('barangay_personnel').update<ApiPersonnel>(id, data)
  } catch (err) { throw handleApiError(err) }
}

export async function deletePersonnel(id: string): Promise<boolean> {
  try {
    await getClient().collection('barangay_personnel').delete(id)
    return true
  } catch (err) { throw handleApiError(err) }
}
