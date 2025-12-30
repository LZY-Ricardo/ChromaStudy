import { useRef, useState } from 'react'
import { Button, Card, Input, Toast } from 'antd-mobile'
import { apiBaseUrl } from '../services/api.js'

function Chat() {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState([
    {
      id: 'assistant-welcome',
      role: 'assistant',
      content: '我是你的学习教练。今天想冲刺哪一块？',
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
      const response = await fetch(`${apiBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payloadMessages }),
      })

      if (!response.ok || !response.body) {
        throw new Error('stream_failed')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          break
        }
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''

        parts.forEach((part) => {
          const line = part
            .split('\n')
            .find((item) => item.startsWith('data:'))
          if (!line) {
            return
          }
          const payload = line.replace(/^data:\s*/, '').trim()
          if (!payload) {
            return
          }
          try {
            const data = JSON.parse(payload)
            if (data.content && activeAssistantRef.current) {
              appendAssistant(activeAssistantRef.current, data.content)
            }
          } catch {
            // ignore malformed chunks
          }
        })
      }
    } catch {
      Toast.show({ content: 'AI 连接失败，请稍后重试' })
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card title="AI Coach" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
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
            placeholder="告诉教练你的学习目标"
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
            {streaming ? '教练思考中...' : '发送'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

export default Chat
