function percentage(part, total) {
  return total ? Math.round((part / total) * 100) : 0
}

function summarize(logs) {
  const list = Array.isArray(logs) ? logs.slice(-20) : []
  const firstCorrect = list.filter((item) => item.firstCorrect).length
  const hinted = list.filter((item) => item.hintLevel > 0).length
  const accuracy = percentage(firstCorrect, list.length)
  const hintRate = percentage(hinted, list.length)
  let advice = '再完成几道题后，这里会出现学习建议。'
  const addLogs = list.filter((item) => item.operation === 'addition')
  const subLogs = list.filter((item) => item.operation === 'subtraction')
  if (list.length >= 5 && accuracy >= 80 && hintRate <= 30) advice = '已经能独立完成10以内加减法，可以在生活中继续用水果和积木练习。'
  else if (list.length >= 5 && hintRate >= 50) advice = '孩子仍喜欢逐个数，这是正常阶段。建议让孩子移动实物并慢慢点数。'
  else if (list.length >= 5) advice = '已经理解部分“合起来”，可以多问“又来了几个，现在一共几个”。'
  const additionAccuracy = percentage(addLogs.filter((item) => item.firstCorrect).length, addLogs.length)
  const subtractionAccuracy = percentage(subLogs.filter((item) => item.firstCorrect).length, subLogs.length)
  return { count: list.length, accuracy, hintRate, additionAccuracy, subtractionAccuracy, advice }
}

function rewardFor(firstCorrectCount) {
  return 1 + (firstCorrectCount === 5 ? 1 : 0)
}

module.exports = { percentage, summarize, rewardFor }
