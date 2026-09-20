import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { isLive, type Dog, type PupEvent } from '@/lib/domain'
import { csvFilename, toCsv } from '../lib/csv'
import { tapped } from '../lib/feedback'
import { isNative } from '../lib/native'

type Props = {
  dogs: Dog[]
  events: PupEvent[]
}

/**
 * Everything logged, as a spreadsheet. Built from what is already on the device
 * rather than fetched — the timeline holds the whole history, so this works with
 * no signal and asks the server for nothing.
 */
export function ExportButton({ dogs, events }: Props) {
  const count = events.filter(isLive).length

  async function save() {
    tapped()
    const name = csvFilename()
    const file = new File([toCsv(events, dogs)], name, { type: 'text/csv' })

    // A link with `download` does nothing inside the web view — there is no
    // Downloads folder at capacitor://localhost. The share sheet is how a file
    // leaves the phone, and it is what puts it in Files or a mail draft.
    if (isNative()) {
      if (!navigator.canShare?.({ files: [file] })) {
        toast('This build cannot share files — export from pupluv.online instead')
        return
      }
      try {
        await navigator.share({ files: [file], title: name })
      } catch (error) {
        // Dismissing the sheet rejects, and that is not a failure.
        if ((error as Error).name !== 'AbortError') toast('Could not share the export')
      }
      return
    }

    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    // Not on this tick: the click only queues the download, and revoking before
    // the browser has read the blob cancels it.
    setTimeout(() => URL.revokeObjectURL(url), 0)
    toast(`${name} · ${count} ${count === 1 ? 'entry' : 'entries'}`)
  }

  return (
    <button
      type="button"
      onClick={() => void save()}
      disabled={count === 0}
      aria-label="Export as CSV"
      title="Export as CSV"
      className="press grid size-9 place-items-center rounded-full text-ink-muted hover:bg-sunk hover:text-ink disabled:pointer-events-none disabled:opacity-40"
    >
      <Download size={17} />
    </button>
  )
}
