import 'dotenv/config'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FeedStore } from './feed-store.js'
import { loadConfig } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const config = loadConfig()
const distPath = path.resolve(__dirname, '../dist')
const feedStore = new FeedStore(config)

await feedStore.initialize()

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    service: 'yield-agg-server',
    port: config.port,
    ...feedStore.getHealth(),
  })
})

app.get('/api/earn', async (request, response) => {
  try {
    const shouldRefresh =
      request.query.refresh === '1' || request.query.refresh === 'true'

    if (shouldRefresh) {
      await feedStore.triggerSync('manual')
    }

    const snapshot = await feedStore.ensureSnapshot()

    if (!snapshot) {
      response.status(503).json({
        message: '快照尚未准备好，请稍后重试',
      })
      return
    }

    response.json(snapshot)
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : 'Unknown server error',
    })
  }
})

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath))
  app.get('/{*splat}', (_request, response) => {
    response.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(config.port, () => {
  console.log(`yield-agg server listening on http://localhost:${config.port}`)
})
