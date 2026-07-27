import type { HostedDocument, HostedMetadata } from './hosted'
import { t } from './i18n'
import { ICONS } from './icons'

export type HostedLibraryDocument = HostedDocument & {
  displayMetadata: HostedMetadata | null
}

export type HostedLibraryOptions = {
  profileLabel: string
  list: () => Promise<HostedLibraryDocument[]>
  open: (docId: string) => Promise<void>
  remove: (docId: string) => Promise<void>
  create: () => Promise<void>
  setupVault: () => Promise<void>
  continueLocal: () => void
  signOut: () => void
}

function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const el = document.createElement('button')
  el.className = primary ? 'ed-hosted-library-action primary' : 'ed-hosted-library-action'
  el.textContent = label
  el.addEventListener('click', onClick)
  return el
}

function iconButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button')
  el.className = 'ed-hosted-library-icon-action'
  el.innerHTML = icon
  el.title = label
  el.setAttribute('aria-label', label)
  el.addEventListener('click', onClick)
  return el
}

function formatUpdated(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function openHostedLibrary(options: HostedLibraryOptions): { close: () => void } {
  const overlay = document.createElement('div')
  overlay.className = 'ed-hosted-library-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', t('Hosted documents'))

  const shell = document.createElement('section')
  shell.className = 'ed-hosted-library'

  const header = document.createElement('header')
  header.className = 'ed-hosted-library-header'
  const heading = document.createElement('div')
  heading.innerHTML = `<div class="ed-hosted-library-kicker">bento/vault</div><h1>${t('Your decks')}</h1>`
  const account = document.createElement('div')
  account.className = 'ed-hosted-library-account'
  account.textContent = options.profileLabel
  const vault = document.createElement('button')
  vault.className = 'ed-hosted-library-vault'
  vault.textContent = t('Set up or unlock hosted vault…')
  vault.addEventListener('click', () => void run(options.setupVault, false, t('Hosted vault setup failed')))
  const accountMenu = document.createElement('button')
  accountMenu.className = 'ed-hosted-library-signout'
  accountMenu.textContent = t('Sign out of Zitadel')
  accountMenu.addEventListener('click', () => options.signOut())
  account.append(vault, accountMenu)
  header.append(heading, account)

  const toolbar = document.createElement('div')
  toolbar.className = 'ed-hosted-library-toolbar'
  const actions = document.createElement('div')
  actions.className = 'ed-hosted-library-actions'
  actions.append(
    button(t('New hosted deck'), () => void run(options.create), true),
    button(t('Continue locally'), options.continueLocal),
  )
  toolbar.append(actions)

  const status = document.createElement('p')
  status.className = 'ed-hosted-library-status'
  const list = document.createElement('div')
  list.className = 'ed-hosted-library-list'

  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    overlay.remove()
  }

  let documents: HostedLibraryDocument[] = []
  const render = (nextDocuments: HostedLibraryDocument[]) => {
    documents = nextDocuments
    list.textContent = ''
    if (!documents.length) {
      const empty = document.createElement('div')
      empty.className = 'ed-hosted-library-empty'
      empty.innerHTML = `<strong>${t('No hosted documents found')}</strong><span>${t('Create a hosted deck or continue locally.')}</span>`
      list.appendChild(empty)
      return
    }
    for (const doc of documents) {
      const row = document.createElement('article')
      row.className = 'ed-hosted-library-row'
      const body = document.createElement('div')
      body.className = 'ed-hosted-library-row-body'
      const title = document.createElement('h2')
      title.textContent = doc.displayMetadata?.title || t('Untitled deck')
      const detail = document.createElement('p')
      detail.textContent = `${t('Updated {when}', { when: formatUpdated(doc.updatedAt) })} · ${doc.role}`
      body.append(title, detail)
      const open = button(t('Open'), () => void run(() => options.open(doc.docId)))
      const rowActions = document.createElement('div')
      rowActions.className = 'ed-hosted-library-row-actions'
      rowActions.appendChild(open)
      if (doc.role === 'owner') {
        rowActions.appendChild(iconButton(ICONS.trash, t('Delete'), () => {
          if (!window.confirm(t('Delete this hosted deck? Its stored versions will be removed.'))) return
          void run(async () => {
            await options.remove(doc.docId)
            render(documents.filter((item) => item.docId !== doc.docId))
          }, false, t('Hosted delete failed'))
        }))
      }
      row.append(body, rowActions)
      list.appendChild(row)
    }
  }

  const run = async (action: () => Promise<void>, closeAfter = true, failureText = t('Hosted open failed')) => {
    status.textContent = ''
    for (const el of overlay.querySelectorAll('button')) el.disabled = true
    try {
      await action()
      if (closeAfter) close()
      else for (const el of overlay.querySelectorAll('button')) el.disabled = false
    } catch (error) {
      console.error(error)
      status.textContent = error instanceof Error ? error.message : failureText
      for (const el of overlay.querySelectorAll('button')) el.disabled = false
    }
  }

  shell.append(header, toolbar, status, list)
  overlay.appendChild(shell)
  document.body.appendChild(overlay)

  status.textContent = t('Loading hosted documents…')
  void options.list().then((documents) => {
    if (closed) return
    status.textContent = ''
    render(documents)
  }).catch((error) => {
    if (closed) return
    console.error(error)
    status.textContent = error instanceof Error ? error.message : t('Hosted open failed')
    render([])
  })

  return { close }
}
