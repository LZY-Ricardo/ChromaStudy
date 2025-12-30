import { useMemo, useState } from 'react'
import { Button, Card, Input, List, Selector, Toast } from 'antd-mobile'
import { loadAiConfig, saveAiConfig } from '../utils/storage.js'

const defaultAiConfig = {
  provider: 'ollama',
  ollama: {
    host: 'http://localhost:11434',
    model: 'llama3',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: '',
  },
}

function Settings({ user }) {
  const stored = useMemo(() => loadAiConfig(), [])

  const [provider, setProvider] = useState(stored?.provider ?? defaultAiConfig.provider)
  const [ollamaHost, setOllamaHost] = useState(
    stored?.ollama?.host ?? defaultAiConfig.ollama.host
  )
  const [ollamaModel, setOllamaModel] = useState(
    stored?.ollama?.model ?? defaultAiConfig.ollama.model
  )
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(
    stored?.openai?.baseUrl ?? defaultAiConfig.openai.baseUrl
  )
  const [openaiModel, setOpenaiModel] = useState(
    stored?.openai?.model ?? defaultAiConfig.openai.model
  )
  const [openaiApiKey, setOpenaiApiKey] = useState(stored?.openai?.apiKey ?? '')

  const persist = () => {
    const config = {
      provider,
      ollama: {
        host: ollamaHost.trim(),
        model: ollamaModel.trim(),
      },
      openai: {
        baseUrl: openaiBaseUrl.trim().replace(/\/+$/, ''),
        model: openaiModel.trim(),
        apiKey: openaiApiKey.trim(),
      },
    }

    if (config.provider === 'openai') {
      if (!config.openai.baseUrl || !config.openai.model || !config.openai.apiKey) {
        Toast.show({ content: '请补全 Base URL / Model / API Key' })
        return
      }
    }

    if (config.provider === 'ollama') {
      if (!config.ollama.host || !config.ollama.model) {
        Toast.show({ content: '请补全 Ollama Host / Model' })
        return
      }
    }

    saveAiConfig(config)
    Toast.show({ content: '设置已保存' })
  }

  const requestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      Toast.show({ content: '当前环境不支持通知' })
      return
    }
    const result = await window.Notification.requestPermission()
    Toast.show({ content: result === 'granted' ? '通知已开启' : '通知未授权' })
  }

  const sendTestNotification = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      Toast.show({ content: '当前环境不支持通知' })
      return
    }
    if (window.Notification.permission !== 'granted') {
      Toast.show({ content: '请先开启通知权限' })
      return
    }

    const payload = {
      body: '测试提醒：今天也要稳稳推进。',
      icon: '/icons/icon-192.png',
    }

    try {
      const registration = await navigator.serviceWorker?.getRegistration?.()
      if (registration?.showNotification) {
        await registration.showNotification('ChromaStudy', payload)
        return
      }
    } catch {
      // ignore and fallback
    }

    try {
      new window.Notification('ChromaStudy', payload)
    } catch {
      Toast.show({ content: '通知发送失败' })
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Profile" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <p className="text-sm text-slate-600">用户：{user?.username ?? 'unknown'}</p>
      </Card>

      <Card title="AI Provider" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Provider
          </div>
          <Selector
            options={[
              { label: 'Ollama（本地）', value: 'ollama' },
              { label: '云端（OpenAI兼容）', value: 'openai' },
            ]}
            value={[provider]}
            onChange={(values) => setProvider(values[0] ?? 'ollama')}
          />
        </div>

        <List className="mt-3">
          {provider === 'ollama' ? (
            <>
              <List.Item>
                <Input
                  placeholder="Ollama Host，例如：http://localhost:11434"
                  value={ollamaHost}
                  onChange={setOllamaHost}
                  clearable
                />
              </List.Item>
              <List.Item>
                <Input
                  placeholder="Ollama Model，例如：llama3 / deepseek-r1"
                  value={ollamaModel}
                  onChange={setOllamaModel}
                  clearable
                />
              </List.Item>
            </>
          ) : (
            <>
              <List.Item>
                <Input
                  placeholder="Base URL，例如：https://api.openai.com/v1"
                  value={openaiBaseUrl}
                  onChange={setOpenaiBaseUrl}
                  clearable
                />
              </List.Item>
              <List.Item>
                <Input
                  placeholder="Model，例如：gpt-4o-mini / deepseek-chat"
                  value={openaiModel}
                  onChange={setOpenaiModel}
                  clearable
                />
              </List.Item>
              <List.Item>
                <Input
                  type="password"
                  placeholder="API Key（仅存本地浏览器）"
                  value={openaiApiKey}
                  onChange={setOpenaiApiKey}
                  clearable
                />
              </List.Item>
            </>
          )}
        </List>

        <div className="mt-4">
          <Button block color="primary" onClick={persist}>
            保存 AI 设置
          </Button>
          <p className="mt-2 text-xs text-slate-400">
            云端模式会把 Key 发送到你的后端用于转发请求；请仅在可信环境使用。
          </p>
        </div>
      </Card>

      <Card
        title="Notifications (PWA)"
        className="rounded-2xl border border-slate-100 bg-white shadow-sm"
      >
        <div className="space-y-3">
          <Button block fill="outline" onClick={requestNotificationPermission}>
            开启通知权限
          </Button>
          <Button block onClick={sendTestNotification}>
            发送测试通知
          </Button>
          <p className="text-xs text-slate-400">
            PWA 通知更适合“尽力提醒”；若需要严格定时/重复提醒，后续可升级系统级通知。
          </p>
        </div>
      </Card>
    </div>
  )
}

export default Settings
