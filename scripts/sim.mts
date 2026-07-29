import { Game } from '../src/core/Game.ts'

const g = new Game()
const offer = g.getSnapshot().market[0]!
g.acceptOffer(offer.id)
const emp = g.getSnapshot().employees[0]!
const proj = g.getSnapshot().projects[0]!
g.assignEmployee(emp.id, proj.id)
g.setProjectMode(proj.id, 'speed')
g.setSpeed(2)

for (let i = 0; i < 500; i++) g.tick()

const s = g.getSnapshot()
console.log({
  cash: s.company.cash,
  dp: Math.floor(s.company.dp),
  heat: Math.floor(s.company.heat),
  trust: s.company.trust,
  result: s.projects[0]?.result,
  state: s.projects[0]?.state,
  payout: s.projects[0]?.payout,
  tutorial: s.tutorialStep,
})
