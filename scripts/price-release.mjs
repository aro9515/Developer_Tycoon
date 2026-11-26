import assert from 'node:assert/strict'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } })
try {
  const { createForcedOffer, rollMarketOffer } = await vite.ssrLoadModule('/src/core/market.ts')
  const { Game } = await vite.ssrLoadModule('/src/core/Game.ts')
  const { serializeGame, deserializeGame } = await vite.ssrLoadModule('/src/core/save.ts')
  assert.equal(createForcedOffer().budget, 150)
  const ranges = [[100, 220], [220, 360], [350, 550]]
  const difficulties = new Set()
  for (const trust of [10, 30, 70]) {
    for (let i = 0; i < 50; i++) {
      const offer = rollMarketOffer(trust)
      const [min, max] = ranges[offer.difficulty - 1]
      assert.ok(offer.budget >= min && offer.budget <= max)
      difficulties.add(offer.difficulty)
    }
  }
  assert.equal(difficulties.size, 3)
  const legacy = new Game()
  legacy.state.market[0].budget = 650
  const saved = deserializeGame(serializeGame(legacy))
  assert.equal(saved.state.market[0].budget, 650)
  assert.ok(saved.acceptOffer(saved.state.market[0].id))
  assert.equal(saved.state.projects[0].budget, 650)
  console.log('PASS new prices and legacy listed/contracted prices')
} finally {
  await vite.close()
}
