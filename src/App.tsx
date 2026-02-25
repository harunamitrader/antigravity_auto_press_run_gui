import { useState, useEffect, useRef } from 'react'

interface LogEntry {
  timestamp: string
  type: 'info' | 'action' | 'warn' | 'error'
  message: string
  context?: string
}

interface Status {
  connected: boolean
  target: string | null
}

declare global {
  interface Window {
    ipcRenderer: {
      on: (channel: string, listener: (event: any, ...args: any[]) => void) => void
      off: (channel: string, listener: (...args: any[]) => void) => void
      removeAllListeners: (channel: string) => void
      send: (channel: string, ...args: any[]) => void
      invoke: (channel: string, ...args: any[]) => Promise<any>
    }
  }
}

function App() {
  const [isActive, setIsActive] = useState(false)
  const [intervalOption, setIntervalOption] = useState<number>(5000)
  const [status, setStatus] = useState<Status>({ connected: false, target: null })
  const [logs, setLogs] = useState<LogEntry[]>([])
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const logListener = (_event: any, log: LogEntry) => {
      setLogs(prev => [...prev.slice(-99), log])
    }
    const statusListener = (_event: any, newStatus: Status) => {
      setStatus(newStatus)
    }

    window.ipcRenderer.on('log-update', logListener)
    window.ipcRenderer.on('status-update', statusListener)

    return () => {
      window.ipcRenderer.removeAllListeners('log-update')
      window.ipcRenderer.removeAllListeners('status-update')
    }
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const toggleMonitor = async () => {
    if (isActive) {
      await window.ipcRenderer.invoke('monitor-stop')
    } else {
      await window.ipcRenderer.invoke('monitor-start')
    }
    setIsActive(!isActive)
  }

  const handleIntervalChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = parseInt(e.target.value, 10);
    setIntervalOption(val);
    await window.ipcRenderer.invoke('set-interval', val);
  }

  const handleClose = () => window.ipcRenderer.invoke('window-close')
  const handleMinimize = () => window.ipcRenderer.invoke('window-minimize')

  return (
    <div className="app-container">
      {/* タイトルバー */}
      <div className="title-bar">
        <div className="title">
          <span style={{ color: '#00d2ff', fontWeight: 'bold', fontSize: '1.1rem' }}>ANTIGRAVITY</span>
          <span style={{ color: '#00d2ff', fontWeight: 'bold', marginLeft: 6, fontSize: '1.1rem' }}>AUTO PRESS RUN</span>
        </div>
        <div className="title-bar-buttons">
          <button className="window-btn btn-minimize" onClick={handleMinimize} title="最小化">
            ─
          </button>
          <button className="window-btn btn-close" onClick={handleClose} title="閉じる">
            ✕
          </button>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="main-content">
        <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
          {/* 電源ボタン */}
          <div className="power-section" style={{ flex: '0 0 auto', paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <button
              className={`power-btn ${isActive ? 'active' : ''}`}
              onClick={toggleMonitor}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" />
              </svg>
            </button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: isActive ? '#00d2ff' : 'rgba(255,255,255,0.3)' }}>
                {isActive ? '監視中（自動承認）' : '停止中'}
              </div>
              <div style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: 2 }}>
                {isActive ? 'CDP接続先を監視しています...' : 'クリックで自動実行を開始'}
              </div>
            </div>
          </div>

          {/* ログ表示 */}
          <div className="log-container">
            {logs.length === 0 && (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.2, fontSize: '0.75rem' }}>
                ログ待機中...
              </div>
            )}
            {logs.map((log, i) => (
              <div key={i} className={`log-entry ${log.type}`}>
                <div className="log-header">
                  <span>{log.type.toUpperCase()}</span>
                  <span>{log.timestamp}</span>
                </div>
                <div className="log-msg">{log.message}</div>
                {log.context && (
                  <div className="log-context">{log.context}</div>
                )}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* サイドバー */}
        <div className="sidebar" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="stat-card">
            <div className="stat-label">接続状態</div>
            <div className={`stat-value ${status.connected ? '' : 'inactive'}`} style={{ color: status.connected ? '#50fa7b' : '#ff5555', fontSize: '0.85rem' }}>
              {status.connected ? '接続済み' : '未接続'}
            </div>
            <div className="stat-sub">
              {status.target || 'Antigravity UI を待機中...'}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">自動クリック数</div>
            <div className="stat-value">{logs.filter(l => l.type === 'action').length}</div>
            <div className="stat-sub">今回のセッション</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">監視間隔</div>
            <select
              value={intervalOption}
              onChange={handleIntervalChange}
              className="interval-select"
              style={{ width: '100%', marginTop: 4 }}
            >
              <option value={1000}>1秒</option>
              <option value={3000}>3秒</option>
              <option value={5000}>5秒 (標準)</option>
              <option value={10000}>10秒</option>
              <option value={30000}>30秒</option>
              <option value={60000}>1分</option>
              <option value={300000}>5分</option>
              <option value={900000}>15分</option>
              <option value={1800000}>30分</option>
              <option value={3600000}>60分</option>
            </select>
          </div>

          <div className="stat-card" style={{ flex: 1, opacity: 0.3, display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ fontSize: '0.6rem' }}>
              v1.0.0-gui <br />
              Harunami Trader
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
