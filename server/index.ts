import 'dotenv/config'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from './config.js'
import { buildEarnFeed } from './feed.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const config = loadConfig()
const distPath = path.resolve(__dirname, '../dist')

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    service: 'yield-agg-server',
    port: config.port,
  })
})

app.get('/api/earn', async (_request, response) => {
  try {
    const feed = await buildEarnFeed(config)
    response.json(feed)
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : 'Unknown server error',
    })
  }
})

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath))
  app.get('*', (_request, response) => {
    response.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(config.port, () => {
  console.log(`yield-agg server listening on http://localhost:${config.port}`)
})
