const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const axios = require('axios')

// 使用 Microsoft Edge TTS (免费, 国内可访问, 高质量神经网络语音)
async function fetchTtsAudio(text) {
  // Edge TTS 使用 SSML 格式请求
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
    <voice name="zh-CN-XiaoxiaoNeural">
      <mstts:express-as type="affectionate" styledegree="2">${text}</mstts:express-as>
    </voice>
  </speak>`

  const trustedHost = 'southeastasia.tts.speech.microsoft.com'
  const hosts = [
    'eastasia.tts.speech.microsoft.com',
    'southeastasia.tts.speech.microsoft.com',
    'chinaeast2.tts.speech.microsoft.com',
    'japaneast.tts.speech.microsoft.com'
  ]

  const errors = []
  // 先尝试可靠的东南亚节点，再试其他
  const orderedHosts = [trustedHost, ...hosts.filter(h => h !== trustedHost)]

  for (const host of orderedHosts) {
    try {
      const url = `https://${host}/cognitiveservices/v1`
      const res = await axios({
        method: 'post',
        url,
        headers: {
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
          'User-Agent': 'WeApp'
        },
        data: ssml,
        responseType: 'arraybuffer',
        timeout: 10000
      })
      const buf = Buffer.from(res.data)
      if (buf && buf.length > 1000) return buf
    } catch (e) {
      errors.push(`${host}: ${e.message}`)
    }
  }

  // 最后的兜底：使用一个简单的 HTTP TTS
  try {
    const res = await axios({
      method: 'get',
      url: 'https://dict.youdao.com/dictvoice',
      params: { audio: text, type: 2 },
      responseType: 'arraybuffer',
      timeout: 5000
    })
    const buf = Buffer.from(res.data)
    if (buf && buf.length > 200) return buf
  } catch (e) {
    errors.push(`youdao: ${e.message}`)
  }

  console.error('所有 TTS 源失败:', errors.join('; '))
  throw new Error('所有 TTS 源都不可用')
}

exports.main = async (event) => {
  const { taskId, text, batch } = event

  if (batch) {
    const taskRes = await db.collection('tasks').where({ status: 'active' }).get()
    const tasks = taskRes.data || []
    let success = 0
    for (const task of tasks) {
      try {
        const voiceText = task.title + '。' + task.description
        const audioBuf = await fetchTtsAudio(voiceText)
        const fileName = `voices/task_${task._id}.mp3`
        const uploadRes = await cloud.uploadFile({
          cloudPath: fileName,
          fileContent: audioBuf
        })
        await db.collection('tasks').doc(task._id).update({
          data: { voiceUrl: uploadRes.fileID }
        })
        success++
      } catch (err) {
        console.error(`任务 ${task._id} 语音生成失败`, err)
      }
    }
    return { success: true, total: tasks.length, generated: success }
  }

  if (!taskId || !text) {
    return { success: false, message: '需要 taskId 和 text 参数，或使用 batch: true 批量生成' }
  }

  try {
    const audioBuf = await fetchTtsAudio(text)
    const fileName = `voices/task_${taskId}.mp3`
    const uploadRes = await cloud.uploadFile({
      cloudPath: fileName,
      fileContent: audioBuf
    })
    await db.collection('tasks').doc(taskId).update({
      data: { voiceUrl: uploadRes.fileID }
    })
    return { success: true, voiceUrl: uploadRes.fileID }
  } catch (err) {
    return { success: false, message: err.message }
  }
}
