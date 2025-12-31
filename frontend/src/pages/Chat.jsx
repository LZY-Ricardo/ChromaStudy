import { useRef, useState } from 'react'
import { Button, Card, Input, Toast } from 'antd-mobile'
import { apiBaseUrl } from '../services/api.js'
import { loadAiConfig } from '../utils/storage.js'

function Chat() {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState([
    {
      id: 'assistant-welcome',
      role: 'assistant',
      content: '我是你的学习伙伴。今天想学点什么？',
    },
  ])
  const [streaming, setStreaming] = useState(false)
  const activeAssistantRef = useRef(null)

  const appendAssistant = (id, chunk) => {
    setMessages((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, content: `${item.content}${chunk}` } : item
      )
    )
  }

  const sendMessage = async () => {
    const content = draft.trim()
    if (!content || streaming) {
      return
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
    }
    const assistantId = `assistant-${Date.now()}`
    activeAssistantRef.current = assistantId

    const payloadMessages = [...messages, userMessage].map(({ role, content: text }) => ({
      role,
      content: text,
    }))

    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: 'assistant', content: '' },
    ])
    setDraft('')
    setStreaming(true)

    try {
      console.log('Sending request to:', `${apiBaseUrl}/api/chat`)
      console.log('Payload:', { messages: payloadMessages, ai: loadAiConfig() })

      const response = await fetch(`${apiBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payloadMessages, ai: loadAiConfig() }),
      })

      console.log('Response status:', response.status)
      console.log('Response headers:', Object.fromEntries(response.headers.entries()))
      console.log('Response body exists:', !!response.body)

      if (!response.ok || !response.body) {
        console.error('Response not OK or no body')
        throw new Error('stream_failed')
      }

      console.log('Creating reader from response body')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let chunkCount = 0
      let streamComplete = false
      let lastDataTime = Date.now()

      console.log('Starting to read stream...')
      // 设置一个超时检测，如果30秒没有收到数据就报错
      const timeoutCheck = setInterval(() => {
        const elapsed = Date.now() - lastDataTime
        if (elapsed > 30000 && !streamComplete) {
          console.error('Stream timeout after', elapsed, 'ms of inactivity')
          clearInterval(timeoutCheck)
        }
      }, 5000)

      try {
        while (!streamComplete) {
          const { value, done } = await reader.read()
          if (done) {
            console.log('Stream ended, total chunks:', chunkCount)
            break
          }
          lastDataTime = Date.now()
        chunkCount++
        const chunk = decoder.decode(value, { stream: true })
        console.log('Received chunk:', chunkCount, 'size:', value.length, 'content:', chunk)
        buffer += chunk

        // SSE 格式: 事件以 \n\n 分隔
        const events = buffer.split('\n\n')
        buffer = events.pop() || '' // 保留最后一个不完整的事件

        for (const event of events) {
          if (!event.trim()) continue

          console.log('Processing event:', event)

          // 解析 SSE 事件
          const lines = event.split('\n')
          let eventType = ''
          let data = ''

          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.replace('event:', '').trim()
            } else if (line.startsWith('data:')) {
              data = line.replace('data:', '').trim()
            }
          }

          console.log('Event type:', eventType, 'Data:', data)

          // 处理不同事件类型
          if (eventType === 'error') {
            try {
              const errorData = JSON.parse(data)
              console.error('Server error:', errorData)
              throw new Error(errorData.error || 'Server error')
            } catch (e) {
              throw new Error('Server error: ' + data)
            }
          }

          if (eventType === 'done') {
            console.log('Received done event, exiting stream loop')
            streamComplete = true
            break
          }

          // 处理 content 数据
          if (data && eventType !== 'start') {
            try {
              const parsed = JSON.parse(data)
              if (parsed.content && activeAssistantRef.current) {
                console.log('Appending content:', parsed.content)
                appendAssistant(activeAssistantRef.current, parsed.content)
              }
            } catch (e) {
              console.error('Failed to parse data:', data, e)
            }
          }
        }
        }
      } finally {
        clearInterval(timeoutCheck)
      }
    } catch (e) {
      console.error('Chat error:', e)
      Toast.show({ content: 'AI 连接失败，请稍后重试' })
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Study Mate" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-2xl border p-3 text-sm ${
                message.role === 'user'
                  ? 'border-emerald-100 bg-emerald-50 text-slate-700'
                  : 'border-slate-100 bg-slate-50 text-slate-700'
              }`}
            >
              {message.content || (message.role === 'assistant' && streaming ? '...' : '')}
            </div>
          ))}
        </div>
      </Card>

      <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3">
          <Input
            placeholder="告诉你的学习目标"
            value={draft}
            onChange={setDraft}
            onEnterPress={sendMessage}
            clearable
            disabled={streaming}
          />
          <Button
            color="primary"
            size="large"
            disabled={!draft.trim() || streaming}
            onClick={sendMessage}
          >
            {streaming ? '思考中...' : '发送'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

export default Chat
