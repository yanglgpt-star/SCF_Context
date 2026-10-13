const engine = require('../../services/question-engine')
const store = require('../../services/progress-store')
const device = require('../../services/device-profile')

function itemArray(count) { return Array.from({ length: count }, (_, index) => index) }
function newSession() {
  return { version: 2, id: `s_${Date.now()}`, startedAt: Date.now(), currentIndex: 0, questions: engine.createSession(), logs: [], status: 'active' }
}
function isValidSession(session) {
  if (!session || session.version !== 2 || session.status !== 'active' || Date.now() - session.startedAt >= 30 * 60 * 1000) return false
  if (!Array.isArray(session.questions) || session.questions.length !== 5) return false
  return session.questions.every((q) => {
    const calculated = q.operation === 'addition' ? q.left + q.right : q.left - q.right
    return ['addition', 'subtraction'].includes(q.operation) && q.answer === calculated && Array.isArray(q.options) && q.options.includes(q.answer)
  })
}

Page({
  data: {
    question: {}, leftItems: [], rightItems: [], remainingItems: [], removedItems: [], current: 1,
    progressWidth: 20, locked: true, attempts: 0, hintLevel: 0,
    coach: '认真听题目，再选答案', showExit: false, showEquationAnswer: false, deviceType: 'phone'
  },
  onLoad() {
    this.setData({ deviceType: device.current().type })
    this.settings = store.get('settings')
    const active = store.get('active')
    this.session = isValidSession(active) ? active : newSession()
    this.loadQuestion()
  },
  loadQuestion() {
    const question = this.session.questions[this.session.currentIndex]
    if (!question.options.includes(question.answer)) question.options = engine.optionsFor(question.answer)
    this.questionStartedAt = Date.now()
    this.setData({ question, leftItems: itemArray(question.left), rightItems: itemArray(question.right), remainingItems: itemArray(question.answer), removedItems: itemArray(question.right), current: this.session.currentIndex + 1, progressWidth: (this.session.currentIndex + 1) * 20, locked: true, attempts: 0, hintLevel: 0, coach: question.operation === 'addition' ? '看一看，两边合起来有多少？' : '看一看，拿走以后还剩多少？', showEquationAnswer: false, selectedAnswer: null })
    this.loadTimer = setTimeout(() => { this.setData({ locked: false }); this.playPrompt() }, 450)
    store.set('active', this.session)
  },
  playPrompt() {
    if (!this.settings.voiceOn || this.audioDisabled) return
    const q = this.data.question
    if (!this.audio) {
      this.audio = wx.createInnerAudioContext()
      this.audio.onEnded(() => {
        const playId = this.audioPlayId
        this.clipTimer = setTimeout(() => this.playNextClip(playId), 90)
      })
      this.audio.onError(() => {
        this.audioErrors = (this.audioErrors || 0) + 1
        if (this.audioErrors >= 2) {
          if (this.audioDisabled) return
          this.audioDisabled = true
          wx.showToast({ title: '语音暂时不可用，可以看图答题', icon: 'none' })
        } else this.clipTimer = setTimeout(() => this.playNextClip(this.audioPlayId), 120)
      })
    }
    this.audioPlayId = (this.audioPlayId || 0) + 1
    const playId = this.audioPlayId
    this.audioErrors = 0
    clearTimeout(this.clipTimer); this.audio.stop()
    this.audioQueue = [
      `/assets/audio/voice/have_${q.left}.wav`,
      `/assets/audio/voice/${q.operation === 'addition' ? 'add' : 'sub'}_${q.right}.wav`,
      `/assets/audio/voice/${q.operation === 'addition' ? 'add_question' : 'sub_question'}.wav`
    ]
    this.playNextClip(playId)
  },
  playNextClip(playId) {
    if (playId !== this.audioPlayId || !this.audioQueue || !this.audioQueue.length || this.audioDisabled) return
    this.audio.src = this.audioQueue.shift(); this.audio.play()
  },
  replay() { this.playPrompt() },
  chooseAnswer(e) {
    if (this.data.locked) return
    const value = Number(e.currentTarget.dataset.value)
    const attempts = this.data.attempts + 1
    const correct = value === this.data.question.answer
    this.setData({ attempts })
    if (correct) this.handleCorrect(value)
    else this.handleWrong()
  },
  handleCorrect(value) {
    const answer = this.data.question.answer
    this.setData({ locked: true, selectedAnswer: value, showEquationAnswer: true, coach: answer === 0 ? '答对啦！一根也没有，答案是0' : `答对啦！一起数到${answer}` })
    this.finishQuestion(this.data.attempts === 1)
    this.feedbackTimer = setTimeout(() => this.nextQuestion(), 1350)
  },
  handleWrong() {
    const hintLevel = Math.min(2, this.data.hintLevel + 1)
    if (this.data.attempts >= 2) {
      this.setData({ hintLevel: 2, locked: true, showEquationAnswer: true, selectedAnswer: this.data.question.answer, coach: this.data.question.answer === 0 ? '都拿走了，一根也没有，答案是0' : `一起数：答案是${this.data.question.answer}` })
      this.finishQuestion(false)
      this.feedbackTimer = setTimeout(() => this.nextQuestion(), 1700)
    } else {
      this.setData({ hintLevel, coach: this.data.question.operation === 'addition' ? '差一点，把两边放到一起再数一数' : '差一点，把拿走的分开，再数剩下的' })
    }
  },
  useHelp() {
    if (this.data.locked) return
    const hintLevel = Math.min(2, this.data.hintLevel + 1)
    const addition = this.data.question.operation === 'addition'
    this.setData({ hintLevel, coach: addition ? '把两边放在一起，从1开始一个一个数' : '先拿走指定数量，再数一数剩下的' })
    this.playHelp(addition ? 'add_hint' : 'sub_hint')
  },
  playHelp(name) {
    if (!this.settings.voiceOn || this.audioDisabled) return
    if (!this.audio) { this.playPrompt(); return }
    this.audioPlayId = (this.audioPlayId || 0) + 1
    const playId = this.audioPlayId
    this.audioErrors = 0
    clearTimeout(this.clipTimer); this.audio.stop()
    this.audioQueue = [`/assets/audio/voice/${name}.wav`]
    this.playNextClip(playId)
  },
  finishQuestion(firstCorrect) {
    const q = this.data.question
    this.session.logs.push({ id: `${this.session.id}_${this.session.currentIndex}`, sessionId: this.session.id, questionId: q.id, operation: q.operation, left: q.left, right: q.right, answer: q.answer, firstCorrect, attempts: this.data.attempts, hintLevel: this.data.hintLevel, demonstrated: this.data.attempts >= 2, startedAt: this.questionStartedAt, completedAt: Date.now() })
  },
  nextQuestion() {
    if (this.session.currentIndex < 4) { this.session.currentIndex += 1; this.loadQuestion() }
    else {
      this.session.status = 'completed'; this.session.completedAt = Date.now(); store.set('active', this.session)
      wx.redirectTo({ url: `/pages/result/result?sessionId=${this.session.id}` })
    }
  },
  askExit() { this.setData({ showExit: true }) },
  closeExit() { this.setData({ showExit: false }) },
  confirmExit() { store.set('active', this.session); wx.navigateBack() },
  onUnload() { if (this.audio) this.audio.destroy(); clearTimeout(this.loadTimer); clearTimeout(this.feedbackTimer); clearTimeout(this.clipTimer) }
})

module.exports = { isValidSession }
