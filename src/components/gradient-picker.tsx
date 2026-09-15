import { useEffect, useState } from 'react'
import gradients from '../shared/avatar-gradients.json'

export function GradientPicker({
  disabled,
  onChoose,
}: {
  disabled: boolean
  onChoose: (src: string) => void
}) {
  const [batch, setBatch] = useState(() => gradients.slice(0, 12))
  const [loaded, setLoaded] = useState<boolean[]>([])
  const [retry, setRetry] = useState(0)
  const loading = loaded.length === 0
  useEffect(() => {
    let cancelled = false
    setLoaded([])
    void Promise.all(
      batch.map(async ({ src }) => {
        const image = new Image()
        image.src = src
        try {
          await image.decode()
          return true
        } catch {
          return false
        }
      }),
    ).then((results) => {
      if (!cancelled) setLoaded(results)
    })
    return () => {
      cancelled = true
    }
  }, [batch, retry])
  function shuffle() {
    const remaining = gradients.filter((item) => !batch.includes(item))
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[remaining[i], remaining[j]] = [remaining[j], remaining[i]]
    }
    setLoaded([])
    setBatch(remaining.slice(0, 12))
  }
  return (
    <>
      <div className="avatar-section-header">
        <h3 className="avatar-section-title">Gradients</h3>
        <button
          type="button"
          className="button secondary small"
          disabled={disabled || loading}
          onClick={shuffle}
        >
          {loading ? 'Loading…' : 'Shuffle'}
        </button>
      </div>
      <div className="avatar-gradients" aria-busy={loading}>
        {batch.map((item, index) => (
          <button
            key={item.src}
            type="button"
            className="avatar-gradient"
            disabled={disabled || !loaded[index]}
            aria-label={`Choose ${item.name} avatar`}
            onClick={() => onChoose(item.src)}
          >
            <span className="avatar-gradient-visual">
              {loading ? (
                <span className="avatar-skeleton" />
              ) : loaded[index] ? (
                <img src={item.src} alt="" width={64} height={64} />
              ) : (
                <span className="avatar-unavailable">Unavailable</span>
              )}
            </span>
            <span>{item.name.split(' · ')[0]}</span>
          </button>
        ))}
      </div>
      <p className="sr-only" role="status">
        {loading ? 'Loading gradient avatars' : '12 gradient options. Shuffle for more.'}
      </p>
      {loaded.includes(false) && (
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          onClick={() => setRetry((value) => value + 1)}
        >
          Retry unavailable avatars
        </button>
      )}
    </>
  )
}
