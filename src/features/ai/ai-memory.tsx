import { useEffect, useState } from 'react'
import { Button, Notice } from '../../components/ui'
import { DetailDialog } from '../team/detail-dialog'
import { api, messageOf } from '../../lib/api'
import type { AiMemory } from '../../shared/ai'

export function AiMemoryDialog({
  workspaceId,
  funding,
  onClose,
  onCleared,
}: {
  workspaceId: string
  funding: 'rekann' | 'workspace'
  onClose: () => void
  onCleared: () => void
}) {
  const [saved, setSaved] = useState<AiMemory | null>(null)
  const [notes, setNotes] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [clearing, setClearing] = useState<'conversation' | 'all' | null>(null)
  useEffect(() => {
    let live = true
    void api<AiMemory>(`ai/memory?workspaceId=${workspaceId}`)
      .then((value) => {
        if (live) {
          setSaved(value)
          setNotes(value.notes)
          setEnabled(value.enabled)
        }
      })
      .catch((e) => {
        if (live) setError(messageOf(e))
      })
    return () => {
      live = false
    }
  }, [workspaceId])
  async function save() {
    if (!saved) return
    setBusy(true)
    setError('')
    try {
      await api<AiMemory>(
        clearing ? 'ai/forget' : 'ai/memory',
        clearing
          ? { workspaceId, version: saved.version, all: clearing === 'all' }
          : { workspaceId, version: saved.version, enabled, notes },
      )
      if (clearing) onCleared()
      onClose()
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <DetailDialog
      className="ai-dialog"
      title={clearing ? 'Clear your memory?' : 'Your memory'}
      onClose={onClose}
      busy={busy}
      dirty={!!saved && (notes !== saved.notes || enabled !== saved.enabled)}
      description={
        clearing
          ? 'This removes your conversation and cancels pending drafts in this workspace. Saved employee details stay unchanged.'
          : 'Private to you in this workspace. Other members, including admins, cannot view these notes.'
      }
      footer={
        <>
          <Button className="secondary" data-dialog-close disabled={busy}>
            Cancel
          </Button>
          <Button busy={busy} disabled={!saved} onClick={() => void save()}>
            {clearing ? 'Clear memory' : 'Save memory'}
          </Button>
        </>
      }
    >
      <div className="ai-settings-fields">
        <Notice>{error}</Notice>
        {!saved ? (
          <p>Loading your memory...</p>
        ) : clearing ? (
          <>
            <p>
              {clearing === 'all'
                ? 'Your saved notes will also be removed.'
                : 'Your saved notes will stay available for your next conversation.'}
            </p>
            <button className="ai-text-button" onClick={() => setClearing(null)}>
              Back to your notes
            </button>
          </>
        ) : (
          <>
            <label className="ai-check">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Use my notes and recent messages
            </label>
            <label className="ai-memory-label" htmlFor="ai-private-notes">
              What should Rekann remember?
            </label>
            <textarea
              id="ai-private-notes"
              className="ai-memory-notes"
              value={notes}
              maxLength={1000}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="For example: We call our Design department the Product Studio."
            />
            <p className="hint">
              Your messages are processed by{' '}
              {funding === 'rekann' ? 'Cloudflare Workers AI' : 'OpenRouter'}. When memory is
              enabled, your notes and a few recent messages are included for context. Keep passwords
              and sensitive personal information out of them.
            </p>
            <p className="hint">
              Notes are only saved when you choose. Memory helps with context; it never changes your
              permissions or confirms an action for you.
            </p>
            <div className="ai-memory-actions">
              <Button className="secondary" onClick={() => setClearing('conversation')}>
                Clear conversation
              </Button>
              <Button className="secondary" onClick={() => setClearing('all')}>
                Forget everything
              </Button>
            </div>
          </>
        )}
      </div>
    </DetailDialog>
  )
}
