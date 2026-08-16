import { useState, useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import { getResidents, type ApiResident } from '@/api/residents'
import { Input } from '@/components/ui/input'

export function ResidentCombobox({
  value,
  onChange,
  id = 'resident-combobox',
  placeholder = 'Search resident by name...',
}: {
  value: string
  onChange: (id: string | null) => void
  id?: string
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ApiResident[]>([])
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<ApiResident | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (value) {
      getResidents()
        .then((all) => {
          const found = all.find((r) => r.id === value)
          if (found) setSelected(found)
        })
        .catch(() => setSelected(null))
    } else {
      setSelected(null)
    }
  }, [value])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (!query || selected) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const all = await getResidents()
        const q = query.toLowerCase()
        setResults(
          all
            .filter((r) =>
              `${r.first_name} ${r.last_name} ${r.middle_name}`
                .toLowerCase()
                .includes(q),
            )
            .slice(0, 10),
        )
      } catch {
        setResults([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, selected])

  function handleSelect(r: ApiResident) {
    setSelected(r)
    onChange(r.id)
    setQuery('')
    setOpen(false)
  }

  function handleClear() {
    setSelected(null)
    onChange(null)
    setQuery('')
    inputRef.current?.focus()
  }

  const displayValue = selected
    ? `${selected.first_name} ${selected.last_name}`
    : query

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          id={id}
          value={displayValue}
          onChange={(e) => {
            setSelected(null)
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="h-9 pl-8 text-sm"
        />
        {selected && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-lg text-muted-foreground hover:text-foreground leading-none"
            aria-label="Clear resident"
          >
            ×
          </button>
        )}
      </div>
      {open && results.length > 0 && query && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-background shadow-lg">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => handleSelect(r)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <span className="font-medium">
                {r.first_name} {r.last_name}
              </span>
              {r.type_of_resident ? (
                <span className="ml-auto text-xs text-muted-foreground">
                  {r.type_of_resident}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}
      {open && !selected && query && results.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background p-2 text-sm text-muted-foreground shadow-lg">
          No residents found
        </div>
      )}
    </div>
  )
}
