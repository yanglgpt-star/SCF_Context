function buildPools() {
  const addition = []
  const subtraction = []
  for (let left = 1; left <= 9; left += 1) {
    for (let right = 1; left + right <= 10; right += 1) addition.push({ operation: 'addition', left, right })
  }
  for (let left = 1; left <= 10; left += 1) {
    for (let right = 1; right <= left; right += 1) subtraction.push({ operation: 'subtraction', left, right })
  }
  return { addition, subtraction }
}

const POOLS = buildPools()

function shuffle(input, random) {
  const list = input.slice()
  const rand = random || Math.random
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    const temp = list[i]; list[i] = list[j]; list[j] = temp
  }
  return list
}

function optionsFor(answer, random) {
  const candidates = Array.from({ length: 11 }, (_, index) => index).filter((value) => value !== answer)
  const nearby = candidates.sort((a, b) => Math.abs(a - answer) - Math.abs(b - answer) || a - b).slice(0, 2)
  return shuffle([answer].concat(nearby), random)
}

function makeQuestion(source, index, random) {
  const { operation, left, right } = source
  const addition = operation === 'addition'
  const answer = addition ? left + right : left - right
  return {
    id: `${addition ? 'add' : 'sub'}_${left}_${right}_${index}`,
    operation, left, right, answer,
    symbol: addition ? '＋' : '－',
    actionText: addition ? '又送来' : '拿走了',
    resultText: addition ? '现在一共有几根？' : '现在还剩几根？',
    options: optionsFor(answer, random),
    prompt: `小兔有${left}根胡萝卜，${addition ? '又送来' : '拿走了'}${right}根，${addition ? '现在一共有' : '现在还剩'}几根？`
  }
}

function createSession(random) {
  const rand = random || Math.random
  const easyAdd = POOLS.addition.filter((q) => q.left + q.right <= 5)
  const easySub = POOLS.subtraction.filter((q) => q.left <= 5)
  const first = makeQuestion(shuffle(easyAdd.concat(easySub), rand)[0], 0, rand)
  const addCount = rand() < 0.5 ? 2 : 3
  const additions = shuffle(POOLS.addition.filter((q) => `${q.operation}_${q.left}_${q.right}` !== `${first.operation}_${first.left}_${first.right}`), rand).slice(0, addCount)
  const subtractions = shuffle(POOLS.subtraction.filter((q) => `${q.operation}_${q.left}_${q.right}` !== `${first.operation}_${first.left}_${first.right}`), rand).slice(0, 4 - addCount)
  return [first].concat(shuffle(additions.concat(subtractions), rand)).map((q, index) => index === 0 ? q : makeQuestion(q, index, rand))
}

module.exports = { POOLS, shuffle, optionsFor, makeQuestion, createSession }
