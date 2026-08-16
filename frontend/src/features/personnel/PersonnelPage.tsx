import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { Plus, ChevronDown, User, Calendar } from 'lucide-react'
import {
  getPersonnel,
  createPersonnel,
  updatePersonnel,
  deletePersonnel,
  type ApiPersonnel,
} from '@/api/personnel'
import { getResidents, type ApiResident } from '@/api/residents'
import { ResidentCombobox } from '@/components/ResidentCombobox'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { DetailPanel, DetailSection, FieldRow } from '@/components/ui/DetailPanel'
import { hasRole } from '@/auth/session'
import { formatDate, formatDateTime } from '@/lib/utils'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { positionsForCategory, type PersonnelCategory } from './positions'

function emptyForm() {
  return {
    resident_id: '',
    position: '',
    term_start: '',
    term_end: '',
    status: 'Active' as 'Active' | 'Inactive',
    remarks: '',
  }
}

export default function PersonnelPage({
  category,
  title,
}: {
  category: PersonnelCategory
  title: string
}) {
  const positions = positionsForCategory(category)

  const [allRecords, setAllRecords] = useState<ApiPersonnel[]>([])
  const [residents, setResidents] = useState<ApiResident[]>([])
  const [loading, setLoading] = useState(true)
  const [flyoutRecord, setFlyoutRecord] = useState<ApiPersonnel | null>(null)

  const [form, setForm] = useState(emptyForm())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  useBodyScrollLock(panelOpen)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getPersonnel(), getResidents()])
      .then(([p, r]) => {
        setAllRecords(p)
        setResidents(r)
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load records'),
      )
      .finally(() => setLoading(false))
  }, [])

  const records = useMemo(
    () => allRecords.filter((r) => (positions as readonly string[]).includes(r.position)),
    [allRecords, positions],
  )

  const [searchParams] = useSearchParams()
  const selectedId = searchParams.get('selected')

  useEffect(() => {
    if (selectedId && records.length > 0) {
      const record = records.find((r) => r.id === selectedId)
      if (record) {
        setFlyoutRecord(record)
      }
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [selectedId, records])

  function getResidentName(id: string): string {
    const r = residents.find((res) => res.id === id)
    return r ? `${r.first_name} ${r.last_name}` : '—'
  }

  function getResident(id: string): ApiResident | undefined {
    return residents.find((res) => res.id === id)
  }

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.resident_id.trim() || !form.position.trim() || !form.status.trim()) return

    try {
      const payload = {
        resident_id: form.resident_id,
        position: form.position,
        term_start: form.term_start || undefined,
        term_end: form.term_end || undefined,
        status: form.status,
        remarks: form.remarks || undefined,
      }
      if (editingId) {
        const updated = await updatePersonnel(editingId, payload)
        setAllRecords((prev) => prev.map((r) => (r.id === editingId ? updated : r)))
      } else {
        const created = await createPersonnel(payload)
        setAllRecords((prev) => [created, ...prev])
      }
      closePanel()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save record')
    }
  }

  function openCreatePanel() {
    setError(null)
    setEditingId(null)
    setForm(emptyForm())
    setPanelOpen(true)
  }

  function openEditPanel(record: ApiPersonnel) {
    setEditingId(record.id)
    setForm({
      resident_id: record.resident_id,
      position: record.position,
      term_start: record.term_start || '',
      term_end: record.term_end || '',
      status: record.status,
      remarks: record.remarks || '',
    })
    setPanelOpen(true)
    setError(null)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
  }

  async function confirmDelete() {
    if (!deletingId) return
    try {
      await deletePersonnel(deletingId)
      setAllRecords((prev) => prev.filter((r) => r.id !== deletingId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete record')
    } finally {
      setDeletingId(null)
    }
  }

  function closePanel() {
    setPanelOpen(false)
    setEditingId(null)
    setForm(emptyForm())
    setError(null)
  }

  const canModify = hasRole('admin', 'staff')

  const columns: Column<ApiPersonnel>[] = [
    {
      key: 'resident_id',
      label: 'Name',
      sortable: true,
      filterType: 'text',
      filterValue: (r) => getResidentName(r.resident_id),
      render: (r) => {
        const resident = getResident(r.resident_id)
        return (
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <User className="size-3.5" />
            </div>
            <span className="font-medium">
              {resident ? `${resident.first_name} ${resident.last_name}` : '—'}
            </span>
          </div>
        )
      },
    },
    {
      key: 'position',
      label: 'Position',
      sortable: true,
      filterType: 'select',
      filterOptions: positions.map((p) => ({ label: p, value: p })),
      render: (r) => r.position,
    },
    {
      key: 'term_start',
      label: 'Term Start',
      sortable: true,
      render: (r) => (r.term_start ? formatDate(r.term_start) : '—'),
    },
    {
      key: 'term_end',
      label: 'Term End',
      sortable: true,
      render: (r) => (r.term_end ? formatDate(r.term_end) : '—'),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      filterType: 'select',
      filterOptions: [
        { label: 'Active', value: 'Active' },
        { label: 'Inactive', value: 'Inactive' },
      ],
      render: (r) => (
        <span
          className={
            r.status === 'Active'
              ? 'rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600'
              : 'rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
          }
        >
          {r.status}
        </span>
      ),
    },
  ]

  function closeFlyout() {
    setFlyoutRecord(null)
  }

  return (
    <>
      <PageHeader title={title}>
        {canModify && (
          <Button size="sm" className="gap-1.5 motion-press" onClick={openCreatePanel}>
            <Plus className="size-3.5" />
            New Record
          </Button>
        )}
      </PageHeader>

      <Card lifted={false} className="shadow-none">
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={records}
            loading={loading}
            onRowClick={(r) => setFlyoutRecord(r)}
            emptyState={
              records.length === 0
                ? (
                  <EmptyState
                    title={`No ${title.toLowerCase()} yet`}
                    description={`Add your first ${category === 'official' ? 'official' : 'appointee'} record.`}
                    action={
                      canModify
                        ? { label: 'Create first record', onClick: openCreatePanel }
                        : undefined
                    }
                  />
                )
                : undefined
            }
            rowKey={(r) => r.id}
            toolbar
            exportable
          />
        </CardContent>
      </Card>

      {panelOpen && (
        <div className="fixed inset-0 z-40 flex max-md:flex-col max-md:justify-end md:justify-end">
          <div
            className="fixed inset-0 bg-black/40 motion-fade-in"
            onClick={closePanel}
            aria-hidden="true"
          />
          <div className="relative w-full bg-card shadow-xl motion-slide-up motion-fade-in overflow-y-auto md:w-1/2 md:border-l md:border-border max-md:max-h-[85vh] max-md:rounded-t-2xl font-display">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="font-display text-sm font-semibold text-foreground">
                {editingId ? 'Edit Record' : 'New Record'}
              </h2>
              <button
                type="button"
                onClick={closePanel}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <ChevronDown className="size-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5 p-5">
              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="panel-resident">Resident *</Label>
                <ResidentCombobox
                  id="panel-resident"
                  value={form.resident_id}
                  onChange={(id) => updateField('resident_id', id ?? '')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="panel-position">Position *</Label>
                <Select
                  id="panel-position"
                  value={form.position}
                  onValueChange={(v) => updateField('position', v)}
                  required
                >
                  <option value="">Select position</option>
                  {positions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="panel-term-start">Term Start</Label>
                  <Input
                    id="panel-term-start"
                    type="date"
                    value={form.term_start}
                    onChange={(e) => updateField('term_start', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="panel-term-end">Term End</Label>
                  <Input
                    id="panel-term-end"
                    type="date"
                    value={form.term_end}
                    onChange={(e) => updateField('term_end', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="panel-status">Status *</Label>
                <Select
                  id="panel-status"
                  value={form.status}
                  onValueChange={(v) => updateField('status', v)}
                  required
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="panel-remarks">Remarks</Label>
                <textarea
                  id="panel-remarks"
                  value={form.remarks}
                  onChange={(e) => updateField('remarks', e.target.value)}
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="submit">{editingId ? 'Update' : 'Create'}</Button>
                <Button type="button" variant="outline" onClick={closePanel}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DetailPanel
        open={flyoutRecord !== null}
        onClose={closeFlyout}
        title={flyoutRecord ? getResidentName(flyoutRecord.resident_id) : ''}
        onEdit={
          canModify && flyoutRecord
            ? () => {
              openEditPanel(flyoutRecord)
              closeFlyout()
            }
            : undefined
        }
        onDelete={
          canModify && flyoutRecord ? () => handleDelete(flyoutRecord.id) : undefined
        }
      >
        {flyoutRecord &&
          (() => {
            const resident = getResident(flyoutRecord.resident_id)
            return (
              <>
                <DetailSection icon={<User className="size-3" />} title="Resident Info">
                  <FieldRow label="Name">
                    <span className="font-medium text-foreground">
                      {resident ? `${resident.first_name} ${resident.last_name}` : '—'}
                    </span>
                  </FieldRow>
                  <FieldRow label="Type of Resident" value={resident?.type_of_resident || '—'} />
                </DetailSection>

                <DetailSection icon={<Calendar className="size-3" />} title="Position Info">
                  <FieldRow label="Position" value={flyoutRecord.position} />
                  <FieldRow label="Status" value={flyoutRecord.status} />
                  <FieldRow
                    label="Term Start"
                    value={flyoutRecord.term_start ? formatDate(flyoutRecord.term_start) : '—'}
                  />
                  <FieldRow
                    label="Term End"
                    value={flyoutRecord.term_end ? formatDate(flyoutRecord.term_end) : '—'}
                  />
                  {flyoutRecord.remarks && (
                    <FieldRow label="Remarks" value={flyoutRecord.remarks} />
                  )}
                </DetailSection>

                <DetailSection icon={<Calendar className="size-3" />} title="Metadata">
                  <FieldRow label="Created" value={formatDateTime(flyoutRecord.created)} />
                  <FieldRow label="Updated" value={formatDateTime(flyoutRecord.updated)} />
                </DetailSection>
              </>
            )
          })()}
      </DetailPanel>

      <ConfirmDialog
        open={deletingId !== null}
        title="Delete record"
        message="This action cannot be undone. The record will be permanently removed."
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </>
  )
}
