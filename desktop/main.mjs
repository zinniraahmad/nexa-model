import { app, BrowserWindow, dialog, ipcMain, net, protocol, session as electronSession, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DesktopStore, inspectStorageRoot } from './storage.mjs'

const PRIMARY_ROOT = 'X:\\'
const DEMO_MODE = !app.isPackaged && process.argv.includes('--demo')
const ADMIN_ORIGIN = 'https://onlyadmin.nexa-model.com'
const CONTACTED_TRAINING_URL = `${ADMIN_ORIGIN}/api/admin/training/candidates`
const CONTACTED_APPLICATIONS_URL = `${ADMIN_ORIGIN}/api/admin/applications?status=contacted`
const ADMIN_LOGIN_URL = `${ADMIN_ORIGIN}/`
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
let store = null
let lastExportedReportPath = null

protocol.registerSchemesAsPrivileged([{ scheme: 'nexa-media', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true } }])

function driveStatus() { return inspectStorageRoot(PRIMARY_ROOT) }
function requireStore() {
  const status = driveStatus()
  if (!status.ready) throw new Error(status.error || 'PRIVATE_SSD (X:) must be unlocked before continuing.')
  if (!store) {
    store = new DesktopStore(PRIMARY_ROOT, DEMO_MODE ? 'NexaTraining-Development' : 'NexaTraining')
    store.open()
    if (DEMO_MODE) store.seedDemoCandidates()
  }
  return store
}

async function mediaResponse(request) {
  const id = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ''))
  const filePath = requireStore().mediaPath(id)
  if (!filePath || !fs.existsSync(filePath)) return new Response('Media not found', { status: 404 })
  const response = await net.fetch(pathToFileURL(filePath).toString(), { headers: request.headers })
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-store, max-age=0')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

async function fetchContactedCandidates(authSession) {
  try {
    const trainingResponse = await authSession.fetch(CONTACTED_TRAINING_URL, { credentials: 'include', headers: { Accept: 'application/json' } })
    if (trainingResponse.ok && String(trainingResponse.headers.get('content-type')).includes('application/json')) {
      const trainingResult = await trainingResponse.json()
      if (Array.isArray(trainingResult.candidates)) return trainingResult.candidates
    }
    const candidates = []
    let page = 1
    while (page <= 100) {
      const response = await authSession.fetch(`${CONTACTED_APPLICATIONS_URL}&page=${page}`, { credentials: 'include', headers: { Accept: 'application/json' } })
      if (!response.ok || !String(response.headers.get('content-type')).includes('application/json')) return null
      const result = await response.json()
      if (!Array.isArray(result.applications)) return null
      candidates.push(...result.applications.filter((candidate) => candidate.application_status === 'contacted'))
      if (!result.pagination?.has_next) return candidates
      page += 1
    }
    throw new Error('Candidate sync stopped because the Admin result exceeded 100 pages.')
  } catch { return null }
}

async function authenticateAndFetchContactedCandidates() {
  const authSession = electronSession.fromPartition('nexa-admin-sync')
  const existing = await fetchContactedCandidates(authSession)
  if (existing) return existing
  const authWindow = new BrowserWindow({
    width: 1120, height: 820, title: 'Sign in to Nexa Admin',
    webPreferences: { session: authSession, contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  authWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  await authWindow.loadURL(ADMIN_LOGIN_URL)
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (action, value) => {
      if (settled) return
      settled = true; clearInterval(poll); clearTimeout(timeout)
      if (!authWindow.isDestroyed()) authWindow.close()
      action(value)
    }
    const poll = setInterval(async () => {
      const candidates = await fetchContactedCandidates(authSession)
      if (candidates) finish(resolve, candidates)
    }, 1200)
    const timeout = setTimeout(() => finish(reject, new Error('Admin sign-in timed out. Try syncing again.')), 5 * 60 * 1000)
    authWindow.on('closed', async () => {
      if (settled) return
      const candidates = await fetchContactedCandidates(authSession)
      if (candidates) finish(resolve, candidates)
      else finish(reject, new Error('Admin sign-in was closed before candidate sync completed.'))
    })
  })
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1500, height: 980, minWidth: 1050, minHeight: 720,
    backgroundColor: '#11130f', title: 'Nexa Training Evaluation',
    webPreferences: { preload: path.join(moduleDirectory, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  window.removeMenu()
  window.loadFile(path.join(moduleDirectory, '..', 'dist-desktop', 'index.html'))
}

app.whenReady().then(() => {
  protocol.handle('nexa-media', mediaResponse)
  ipcMain.handle('drive:status', () => driveStatus())
  ipcMain.handle('runtime:info', () => ({ demoMode: DEMO_MODE, dataFolder: DEMO_MODE ? 'NexaTraining-Development' : 'NexaTraining' }))
  ipcMain.handle('storage:initialize', () => requireStore().summary())
  ipcMain.handle('candidates:list', () => requireStore().listCandidates())
  ipcMain.handle('candidates:sync-contacted', async () => {
    if (DEMO_MODE) return requireStore().seedDemoCandidates()
    return requireStore().syncContactedCandidates(await authenticateAndFetchContactedCandidates())
  })
  ipcMain.handle('candidates:create', (_event, candidate) => requireStore().createCandidate(candidate))
  ipcMain.handle('workspace:get', (_event, candidateId) => requireStore().getWorkspace(candidateId))
  ipcMain.handle('sessions:ensure', (_event, { candidateId, sessionNumber }) => requireStore().ensureSession(candidateId, sessionNumber))
  ipcMain.handle('media:import', (_event, payload) => requireStore().importMedia(payload))
  ipcMain.handle('media:replace', (_event, payload) => requireStore().replaceMedia(payload))
  ipcMain.handle('media:delete', (_event, mediaId) => requireStore().deleteMedia(mediaId))
  ipcMain.handle('pose-timer:start', (_event, poseId) => requireStore().startPoseTimer(poseId))
  ipcMain.handle('pose-timer:stop', (_event, poseId) => requireStore().stopPoseTimer(poseId))
  ipcMain.handle('pose-timer:reset', (_event, poseId) => requireStore().resetPoseTimer(poseId))
  ipcMain.handle('evaluation:save', (_event, payload) => requireStore().saveEvaluation(payload))
  ipcMain.handle('report:export', async (event, fileName) => {
    const activeStore = requireStore()
    const defaultPath = path.join(activeStore.dataRoot, 'reports', `${String(fileName || 'nexa-evaluation').replace(/[^a-z0-9-_]+/gi, '-')}.pdf`)
    const selection = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), { title: 'Export candidate evaluation PDF', defaultPath, filters: [{ name: 'PDF report', extensions: ['pdf'] }] })
    if (selection.canceled || !selection.filePath) return { canceled: true }
    const pdf = await event.sender.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true })
    fs.writeFileSync(selection.filePath, pdf)
    lastExportedReportPath = path.resolve(selection.filePath)
    return { canceled: false, filePath: selection.filePath }
  })
  ipcMain.handle('report:show-in-folder', () => {
    if (!lastExportedReportPath || !fs.existsSync(lastExportedReportPath)) throw new Error('The exported PDF could not be found. Export the report again.')
    shell.showItemInFolder(lastExportedReportPath)
    return { filePath: lastExportedReportPath }
  })
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => { store?.close(); store = null })
