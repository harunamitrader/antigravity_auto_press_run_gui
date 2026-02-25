import { BrowserWindow } from 'electron'
import CDP from 'chrome-remote-interface'
import http from 'http'
import fs from 'fs'
import path from 'path'

export interface LogEntry {
    timestamp: string
    type: 'info' | 'action' | 'warn' | 'error'
    message: string
    context?: string
}

export class MonitorEngine {
    private isRunning = false
    private timer: NodeJS.Timeout | null = null
    private win: BrowserWindow | null = null
    private client: any = null
    private ports = [9222, 9000, 9001, 9002, 9003]
    private interval = 5000
    private keywords = ['Run', 'Allow Once']
    private excludeKeywords = ['always', '常に']

    constructor(win: BrowserWindow) {
        this.win = win
    }

    private log(message: string, type: LogEntry['type'] = 'info', context?: string) {
        const entry: LogEntry = {
            timestamp: new Date().toLocaleTimeString(),
            type,
            message,
            context
        }

        const logLine = `[${entry.timestamp}] [${type.toUpperCase()}] ${message}${context ? `\n  Context: ${context}` : ''}\n`
        console.log(logLine.trimEnd())

        // ログファイルへの永続化 (auto_press_run.log)
        try {
            const logPath = path.join(process.cwd(), 'auto_press_run.log')
            fs.appendFileSync(logPath, logLine, 'utf8')
        } catch (e) {
            console.error('Failed to write log to file:', e)
        }

        this.win?.webContents.send('log-update', entry)
    }

    async start() {
        if (this.isRunning) return
        this.isRunning = true
        this.log('Monitoring started.', 'info')
        this.poll()
    }

    stop() {
        this.isRunning = false
        if (this.timer) {
            clearTimeout(this.timer)
            this.timer = null
        }
        this.cleanupClient()
        this.log('Monitoring stopped.', 'info')
    }

    setPollInterval(ms: number) {
        this.interval = ms
        this.log(`監視間隔を ${ms / 1000}秒 に変更しました`, 'info')
        if (this.isRunning && this.timer) {
            clearTimeout(this.timer)
            this.poll() // 新しい間隔でタイマーを再起動
        }
    }

    private async cleanupClient() {
        if (this.client) {
            try {
                await this.client.close()
            } catch (e) {
                // ignore
            }
            this.client = null
        }
    }

    private poll() {
        if (!this.isRunning) return

        this.timer = setTimeout(async () => {
            try {
                await this.tick()
            } catch (e: any) {
                this.log(`Error during check: ${e.message}`, 'error')
            }
            this.poll()
        }, this.interval)
    }

    private async findTarget() {
        for (const port of this.ports) {
            try {
                const list = await new Promise<any[]>((resolve, reject) => {
                    const req = http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
                        let data = ''
                        res.on('data', chunk => data += chunk)
                        res.on('end', () => {
                            try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
                        })
                    })
                    req.on('error', reject)
                    req.setTimeout(500, () => { req.destroy(); reject(new Error('timeout')) })
                })

                const target = list.find(t =>
                    t.type === 'page' &&
                    t.webSocketDebuggerUrl &&
                    t.title.toLowerCase().includes('antigravity') &&
                    !t.title.toLowerCase().includes('launchpad')
                )

                if (target) return { port, target }
            } catch (e) {
                continue
            }
        }
        return null
    }

    private async tick() {
        if (this.client) {
            try {
                await this.checkForButtons()
            } catch (e) {
                this.log('Connection lost, searching for target...', 'warn')
                await this.cleanupClient()
            }
            return
        }

        const found = await this.findTarget()
        if (found) {
            try {
                this.client = await CDP({ target: found.target.webSocketDebuggerUrl })
                const { DOM, Runtime, Input } = this.client
                await DOM.enable()
                await Runtime.enable()
                this.log(`Connected to Antigravity on port ${found.port}: ${found.target.title}`, 'info')
                this.win?.webContents.send('status-update', { connected: true, target: found.target.title })
            } catch (e: any) {
                this.log(`Failed to connect: ${e.message}`, 'error')
                this.client = null
            }
        } else {
            this.win?.webContents.send('status-update', { connected: false, target: null })
        }
    }

    private async checkForButtons() {
        if (!this.client) return
        const { DOM, Runtime, Input } = this.client

        const doc = await DOM.getDocument({ depth: -1 })
        const { nodeIds } = await DOM.querySelectorAll({
            nodeId: doc.root.nodeId,
            selector: 'button, div[role="button"]'
        })

        if (!nodeIds || nodeIds.length === 0) return

        for (const nodeId of nodeIds) {
            const { outerHTML } = await DOM.getOuterHTML({ nodeId })
            const text = outerHTML.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

            if (this.excludeKeywords.some(ex => text.includes(ex.toLowerCase()))) continue

            const matched = this.keywords.find(kw => text === kw.toLowerCase() || text.startsWith(kw.toLowerCase() + ' '))
            if (matched) {
                // Get context (simplified parent search for now)
                let contextText = 'Context unavailable'
                try {
                    const { object } = await DOM.resolveNode({ nodeId })
                    const result = await Runtime.callFunctionOn({
                        objectId: object.objectId,
                        functionDeclaration: `function() {
              let p = this;
              for(let i=0; i<5; i++) { if(p.parentElement) p = p.parentElement; else break; }
              return p.innerText;
            }`
                    })
                    contextText = result.result.value || 'Context empty'
                } catch (e) { }

                this.log(`Auto-clicking "${matched}" button`, 'action', contextText)

                // Click
                try {
                    const { object } = await DOM.resolveNode({ nodeId })
                    await Runtime.callFunctionOn({
                        functionDeclaration: 'function() { this.click(); }',
                        objectId: object.objectId
                    })

                    const { model } = await DOM.getBoxModel({ nodeId })
                    const x = (model.content[0] + model.content[2] + model.content[4] + model.content[6]) / 4
                    const y = (model.content[1] + model.content[3] + model.content[5] + model.content[7]) / 4

                    await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
                    await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
                } catch (e: any) {
                    this.log(`Click failed: ${e.message}`, 'warn')
                }

                return // One click per tick
            }
        }
    }
}
