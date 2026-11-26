import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } })
try {
  const { Game } = await vite.ssrLoadModule('/src/core/Game.ts')
  const { deserializeGame, serializeGame } = await vite.ssrLoadModule('/src/core/save.ts')

  function start() {
    const game = new Game(undefined, () => 0.99)
    return { game, employee: game.state.employees[0] }
  }

  function master(game, employee, role, level = 5) {
    if (employee.role !== role) assert.equal(game.changeRole(employee.id, role), true)
    employee.roleXp[role] = 32
    for (let current = 1; current < level; current++) {
      assert.equal(game.levelUpRole(employee.id), true)
    }
    assert.equal(employee.roleLevels[role], level)
  }

  await test('Front Lv.5 and Back Lv.4 block Fullstack even when both have 32 XP', () => {
    const { game, employee } = start()
    employee.roleXp.frontend = 32
    employee.roleXp.backend = 32
    assert.equal(game.changeRole(employee.id, 'fullstack'), false)
    master(game, employee, 'frontend')
    master(game, employee, 'backend', 4)
    assert.equal(game.changeRole(employee.id, 'fullstack'), false)
    assert.equal(game.levelUpRole(employee.id), true)
    assert.equal(game.changeRole(employee.id, 'fullstack'), true)
    assert.equal(employee.roleLevels.fullstack, 1)
    assert.deepEqual(employee.roleXp, { frontend: 32, backend: 32 })
  })

  await test('Exact XP boundaries, single step per click, cap, no costs or stat changes', () => {
    const { game, employee } = start()
    const cash = game.state.company.cash
    const stats = structuredClone(employee.stats)
    assert.equal(employee.roleLevels.frontend, 1)
    for (const [index, target] of [5, 12, 21, 32].entries()) {
      employee.roleXp.frontend = target - 0.01
      assert.equal(game.levelUpRole(employee.id), false)
      assert.equal(employee.roleLevels.frontend, index + 1)
      employee.roleXp.frontend = target
      assert.equal(game.levelUpRole(employee.id), true)
      assert.equal(employee.roleLevels.frontend, index + 2)
      assert.equal(employee.roleXp.frontend, target)
    }
    employee.roleXp.frontend = 100
    assert.equal(game.levelUpRole(employee.id), false)
    assert.equal(employee.roleLevels.frontend, 5)
    assert.equal(game.state.company.cash, cash)
    assert.deepEqual(employee.stats, stats)
  })

  await test('Advanced combinations retain every existing AND/OR branch', () => {
    for (const [role, left, right] of [
      ['fullstack', 'frontend', 'backend'], ['platform', 'backend', 'server'], ['consultant', 'server', 'coordinator'],
      ['pm', 'coordinator', 'frontend'], ['pm', 'coordinator', 'backend'],
    ]) {
      for (const [satisfied, missing] of [[left, right], [right, left]]) {
        const { game, employee } = start()
        master(game, employee, satisfied)
        master(game, employee, missing, 4)
        assert.equal(game.changeRole(employee.id, role), false)
        assert.equal(game.levelUpRole(employee.id), true)
        assert.equal(game.changeRole(employee.id, role), true)
        assert.deepEqual(employee.roleLevels, { frontend: 1, [satisfied]: 5, [missing]: 5, [role]: 1 })
        assert.deepEqual(employee.roleXp, { [satisfied]: 32, [missing]: 32 })
      }
    }
    const { game, employee } = start()
    master(game, employee, 'frontend')
    master(game, employee, 'backend')
    assert.equal(game.changeRole(employee.id, 'pm'), false)
  })

  await test('New save rereads cumulative XP and earned levels across transfers', () => {
    const { game, employee } = start()
    master(game, employee, 'frontend', 4)
    assert.equal(game.changeRole(employee.id, 'server'), true)
    assert.equal(employee.roleLevels.server, 1)
    employee.roleXp.server = 7
    assert.equal(game.levelUpRole(employee.id), true)
    const reloaded = deserializeGame(serializeGame(game))
    assert.ok(reloaded)
    const current = reloaded.state.employees[0]
    assert.equal(current.role, 'server')
    assert.equal(reloaded.changeRole(current.id, 'frontend'), true)
    assert.deepEqual(current.roleLevels, { frontend: 4, server: 2 })
    assert.deepEqual(current.roleXp, { frontend: 32, server: 7 })
  })

  await test('Legacy V1 and V2 saves preserve current upper roles, XP and re-entry', () => {
    for (const version of [1, 2]) {
      const { game } = start()
      const raw = JSON.parse(serializeGame(game))
      raw.version = version
      const legacy = raw.employees[0]
      delete legacy.roleLevels
      legacy.role = 'fullstack'
      legacy.roleXp = { frontend: 32, backend: 32, server: 10 }
      const loaded = deserializeGame(JSON.stringify(raw))
      assert.ok(loaded)
      const employee = loaded.state.employees[0]
      assert.equal(employee.role, 'fullstack')
      assert.deepEqual(employee.roleLevels, { fullstack: 1 })
      assert.deepEqual(employee.roleXp, legacy.roleXp)
      assert.equal(loaded.changeRole(employee.id, 'frontend'), true)
      assert.equal(employee.roleLevels.frontend, 1)
      assert.equal(loaded.changeRole(employee.id, 'platform'), false)
      const reloaded = deserializeGame(serializeGame(loaded))
      assert.ok(reloaded)
      assert.equal(reloaded.changeRole(employee.id, 'fullstack'), true)
      assert.deepEqual(reloaded.state.employees[0].roleLevels, { fullstack: 1, frontend: 1 })
      assert.deepEqual(reloaded.state.employees[0].roleXp, legacy.roleXp)
    }
  })

  await test('Previously unlocked upper roles can be resumed without a new prerequisite check', () => {
    for (const previous of ['fullstack', 'platform', 'consultant', 'pm']) {
      const { game } = start()
      const snapshot = game.getSnapshot()
      const employee = snapshot.employees[0]
      employee.role = previous
      delete employee.roleLevels
      employee.roleXp.frontend = 32
      const adopted = deserializeGame(serializeGame(game))
      assert.ok(adopted)
      assert.equal(adopted.changeRole(employee.id, 'frontend'), true)
      const restored = deserializeGame(serializeGame(adopted))
      assert.ok(restored)
      assert.equal(restored.changeRole(employee.id, previous), true)
      assert.deepEqual(restored.state.employees[0].roleLevels, { [previous]: 1, frontend: 1 })
      assert.deepEqual(restored.state.employees[0].roleXp, { frontend: 32 })
    }
  })

  await test('Project XP keeps its original rate and follows the active upper role', () => {
    for (const upper of [false, true]) {
      const { game, employee } = start()
      if (upper) {
        master(game, employee, 'frontend')
        master(game, employee, 'backend')
        assert.equal(game.changeRole(employee.id, 'fullstack'), true)
      } else {
        assert.equal(game.changeRole(employee.id, 'backend'), true)
      }
      const offer = game.state.market[0]
      assert.equal(offer.technology, 'javascript')
      assert.equal(game.acceptOffer(offer.id, employee.id), true)
      game.advance('day')
      game.advance('day')
      const gained = employee.roleXp[upper ? 'fullstack' : 'frontend']
      assert.ok(Math.abs(gained - 4.88) < 1e-8)
      if (upper) assert.equal(employee.roleXp.frontend, 32)
      assert.equal(employee.roleLevels[upper ? 'fullstack' : 'backend'], 1)
    }
  })

  await test('Advanced role gains its own XP in training and keeps it when returning', () => {
    const { game, employee } = start()
    master(game, employee, 'frontend')
    master(game, employee, 'backend')
    assert.equal(game.changeRole(employee.id, 'fullstack'), true)
    assert.equal(game.startTraining(employee.id, 'javascript'), true)
    game.advance('day')
    const gained = employee.roleXp.fullstack
    assert.ok(Math.abs(gained - 0.56) < 1e-8)
    assert.equal(employee.roleXp.frontend, 32)
    assert.equal(employee.roleXp.backend, 32)
    assert.equal(game.changeRole(employee.id, 'backend'), true)
    assert.equal(game.changeRole(employee.id, 'fullstack'), true)
    assert.equal(employee.roleXp.fullstack, gained)
  })
} finally {
  await vite.close()
}
