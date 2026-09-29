import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, FileText, Image, Link2, MoreHorizontal, UploadCloud } from 'lucide-react'
import { Button, Field, Notice } from '../../components/ui'
import { DetailToast } from './detail-toast'
import { DetailMenu } from './detail-menu'
import { DetailDialog } from './detail-dialog'
import { DetailEmpty, formatDate } from './detail-time'
import { api, messageOf } from '../../lib/api'
import { documentCategories } from '../../shared/employee-detail'
import type { EmployeeDetail } from '../../server/employee-detail'
import type { EmployeeDocument } from '../../server/employee-documents'
const fileSize = (bytes: number | null) =>
  bytes === null
    ? 'Link'
    : bytes >= 1024 * 1024
      ? `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`
export function DetailDocuments({
  documents,
  detail,
  workspaceId,
  reload,
}: {
  documents: EmployeeDocument[]
  detail: EmployeeDetail
  workspaceId: string
  reload: () => Promise<void>
}) {
  const [mode, setMode] = useState<'upload' | 'manage' | 'delete' | 'preview' | null>(null)
  const [selected, setSelected] = useState<EmployeeDocument | null>(null)
  const [category, setCategory] = useState<string>(documentCategories[0])
  const [source, setSource] = useState('file')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [visible, setVisible] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [id, setId] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [undo, setUndo] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const xhr = useRef<XMLHttpRequest | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  useEffect(() => () => xhr.current?.abort(), [])
  useEffect(() => {
    if (!undo) return
    const timer = setTimeout(() => setUndo(null), 30000)
    return () => clearTimeout(timer)
  }, [undo])
  const fileUrl = (doc: EmployeeDocument, download = false) =>
    `/api/app/employee/document-file?workspaceId=${encodeURIComponent(workspaceId)}&id=${encodeURIComponent(detail.id)}&documentId=${doc.id}${download ? '&download=1' : ''}`
  function open(category: string, doc?: EmployeeDocument) {
    setCategory(category)
    setSelected(doc || null)
    setMode(doc ? 'manage' : 'upload')
    setTitle(doc?.title || '')
    setSource(doc?.url ? 'link' : 'file')
    setUrl(doc?.url || '')
    setVisible(doc?.visibleToEmployee ?? true)
    setFile(null)
    setId(doc?.id || crypto.randomUUID())
    setError('')
    setMenu(null)
  }
  function choose(file: File) {
    if (
      file.size > 20 * 1024 * 1024 ||
      !['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)
    ) {
      setError('Choose a PDF, PNG or JPG file up to 20 MB.')
      return
    }
    setFile(file)
    setError('')
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''))
  }
  async function save() {
    setBusy(true)
    setError('')
    setProgress(0)
    const metadata = {
      workspaceId,
      id: detail.id,
      documentId: id,
      version: selected?.version || 0,
      title,
      category,
      visibleToEmployee: visible,
      ...(source === 'link' ? { url } : {}),
    }
    try {
      if (source === 'file' && file) {
        const form = new FormData()
        form.set('metadata', JSON.stringify(metadata))
        form.set('file', file)
        await new Promise<void>((resolve, reject) => {
          const request = new XMLHttpRequest()
          xhr.current = request
          request.open('POST', '/api/app/employee/document-upload')
          request.upload.onprogress = (e) => {
            if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
          }
          request.onload = () => {
            let body
            try {
              body = JSON.parse(request.responseText)
            } catch {
              body = { error: 'Upload failed. Please try again.' }
            }
            if (request.status >= 200 && request.status < 300) resolve()
            else reject(new Error(body.error))
          }
          request.onerror = () =>
            reject(new Error('Upload interrupted. Check your connection and try again.'))
          request.onabort = () => reject(new Error('Upload cancelled.'))
          request.send(form)
        })
      } else await api('employee/document-save', metadata)
      await reload()
      setMode(null)
      setNotice(selected ? 'Changes saved.' : 'Document uploaded.')
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
      xhr.current = null
    }
  }
  async function remove(restore = false, documentId = selected?.id) {
    if (!documentId) return
    setBusy(true)
    setError('')
    try {
      await api('employee/document-delete', { workspaceId, id: detail.id, documentId, restore })
      await reload()
      setMode(null)
      setUndo(restore ? null : documentId)
      setNotice(restore ? 'Document restored.' : 'Document deleted.')
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }
  const dirty =
    title !== (selected?.title || '') ||
    url !== (selected?.url || '') ||
    !!file ||
    visible !== (selected?.visibleToEmployee ?? true)
  return (
    <>
      <DetailToast message={notice} onDismiss={() => setNotice('')} duration={undo ? 30000 : 5000}>
        {undo && (
          <button className="text-button" disabled={busy} onClick={() => void remove(true, undo)}>
            Undo
          </button>
        )}
      </DetailToast>
      {!mode && <Notice>{error}</Notice>}
      {documentCategories.map((cat) => (
        <section key={cat} className="detail-document-section">
          <div className="employee-section-heading">
            <h2>{cat}</h2>
            {detail.permissions.edit && (
              <Button className="secondary" onClick={() => open(cat)}>
                Upload document
              </Button>
            )}
          </div>
          {documents.filter((d) => d.category === cat).length ? (
            <div className="detail-table-scroll">
              <table className="detail-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Uploaded</th>
                    <th>File size</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {documents
                    .filter((d) => d.category === cat)
                    .map((d) => (
                      <tr key={d.id}>
                        <td>
                          <button
                            className="detail-document-name"
                            onClick={() => {
                              setSelected(d)
                              setMode('preview')
                              setError('')
                            }}
                          >
                            {d.url ? (
                              <Link2 size={16} />
                            ) : d.mime?.startsWith('image/') ? (
                              <Image size={16} />
                            ) : (
                              <FileText size={16} />
                            )}
                            <span>{d.title}</span>
                          </button>
                        </td>
                        <td>{formatDate(String(d.createdAt))}</td>
                        <td>{fileSize(d.size)}</td>
                        <td>
                          <div className="detail-row-menu">
                            <button
                              className="icon-button"
                              aria-label={`Actions for ${d.title}`}
                              aria-expanded={menu === d.id}
                              onClick={(e) => {
                                setMenuAnchor(e.currentTarget)
                                setMenu(menu === d.id ? null : d.id)
                              }}
                            >
                              <MoreHorizontal size={16} />
                            </button>
                            {menu === d.id && menuAnchor && (
                              <DetailMenu anchor={menuAnchor} onClose={closeMenu}>
                                <button
                                  onClick={() => {
                                    setSelected(d)
                                    setMode('preview')
                                    setMenu(null)
                                  }}
                                >
                                  Preview
                                </button>
                                {detail.permissions.edit && (
                                  <>
                                    <button onClick={() => open(cat, d)}>Manage document</button>
                                    <button
                                      className="danger-text"
                                      onClick={() => {
                                        setSelected(d)
                                        setMode('delete')
                                        setMenu(null)
                                        setError('')
                                      }}
                                    >
                                      Delete document
                                    </button>
                                  </>
                                )}
                              </DetailMenu>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="detail-document-empty">
              <FileText size={16} />
              No documents
            </div>
          )}
        </section>
      ))}
      {(mode === 'upload' || mode === 'manage') && (
        <DetailDialog
          title={mode === 'manage' ? 'Manage document' : `Upload ${category.toLowerCase()}`}
          description={
            mode === 'manage'
              ? 'Update the document title, file or employee access.'
              : `Add a document to ${detail.fields.fullName}’s employee record.`
          }
          onClose={() => setMode(null)}
          dirty={dirty}
          busy={busy}
          footer={
            <>
              <Button data-dialog-close className="secondary" disabled={busy}>
                Cancel
              </Button>
              <Button
                busy={busy}
                disabled={
                  !title.trim() ||
                  (source === 'file' && !file && !selected?.hasFile) ||
                  (source === 'link' && !url.trim())
                }
                onClick={() => void save()}
              >
                {mode === 'manage'
                  ? 'Save changes'
                  : source === 'link'
                    ? 'Add link'
                    : 'Upload document'}
              </Button>
            </>
          }
        >
          <Notice>{error}</Notice>
          <fieldset disabled={busy} className="detail-fields">
            {mode === 'upload' && (
              <nav className="employee-profile-tabs" aria-label="Document source">
                {[
                  ['file', 'Upload file'],
                  ['link', 'Add link'],
                ].map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    aria-current={source === value ? 'page' : undefined}
                    onClick={() => setSource(value)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            )}
            <Field
              label="Title"
              value={title}
              maxLength={160}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Cover letter"
            />
            {source === 'link' ? (
              <Field
                label="Link"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
              />
            ) : (
              <div className="field">
                <label>Document</label>
                <input
                  className="sr-only"
                  ref={picker}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  aria-label="Choose document"
                  onChange={(e) => {
                    if (e.target.files?.[0]) choose(e.target.files[0])
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  className="detail-dropzone"
                  onClick={() => picker.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (!busy && e.dataTransfer.files[0]) choose(e.dataTransfer.files[0])
                  }}
                >
                  {file || selected?.hasFile ? (
                    <>
                      <FileText size={20} />
                      <strong>{file?.name || selected?.fileName}</strong>
                      <span>
                        {busy ? `${progress}%` : fileSize(file?.size ?? selected?.size ?? null)}
                      </span>
                      <span>Change document</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud size={20} />
                      <span>
                        Drag and drop or <em>browse files</em>
                      </span>
                      <small>PDF, PNG, JPG · Up to 20 MB</small>
                    </>
                  )}
                </button>
                {busy && <progress aria-label="Upload progress" max={100} value={progress} />}
              </div>
            )}
            <label className="detail-visibility">
              <span>
                Visible to employee
                <small>
                  {detail.fields.fullName.split(' ')[0]} {visible ? 'can' : 'cannot'} view this
                  document
                </small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
              />
            </label>
          </fieldset>
        </DetailDialog>
      )}
      {mode === 'delete' && selected && (
        <DetailDialog
          title="Delete document?"
          description={`This removes “${selected.title}” from ${detail.fields.fullName.split(' ')[0]}’s profile. You can undo this for 30 seconds.`}
          onClose={() => setMode(null)}
          busy={busy}
          footer={
            <>
              <Button data-dialog-close className="secondary">
                Cancel
              </Button>
              <Button className="danger" busy={busy} onClick={() => void remove()}>
                Delete document
              </Button>
            </>
          }
        >
          <Notice>{error}</Notice>
        </DetailDialog>
      )}
      {mode === 'preview' && selected && (
        <DetailDialog
          title={selected.title}
          onClose={() => setMode(null)}
          wide
          footer={
            selected.hasFile ? (
              <a className="button secondary" href={fileUrl(selected, true)}>
                <Download size={16} />
                Download
              </a>
            ) : undefined
          }
        >
          {selected.url ? (
            <div className="detail-link-preview">
              <Link2 size={32} />
              <p>{selected.url}</p>
              <a
                className="button secondary"
                href={selected.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open link
              </a>
            </div>
          ) : selected.mime === 'application/pdf' ? (
            <object className="detail-pdf" data={fileUrl(selected)} type="application/pdf">
              <DetailEmpty title="Preview is unavailable" body="Download this PDF to view it." />
            </object>
          ) : (
            <img className="detail-image-preview" src={fileUrl(selected)} alt={selected.title} />
          )}
        </DetailDialog>
      )}
    </>
  )
}
