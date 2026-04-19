import { useCallback, useEffect, useState } from 'react'
import { Switch, Toast } from 'antd-mobile'
import { Eye, EyeOff, Shield } from 'lucide-react'
import { getPrivacySettings, updatePrivacySettings } from '../services/forumApi.js'

const PRESETS = {
  privacy: { label: '隐私模式', desc: '仅展示总时长和连续天数', color: 'text-slate-600' },
  social: { label: '社交模式', desc: '展示更多学习数据', color: 'text-blue-600' },
  open: { label: '开放模式', desc: '展示全部学习数据', color: 'text-emerald-600' },
}

const FIELDS = [
  { key: 'totalHours', label: '总学习时长' },
  { key: 'streakDays', label: '连续打卡天数' },
  { key: 'weeklyHours', label: '本周学习时长' },
  { key: 'subjectDistribution', label: '科目分布' },
  { key: 'studyCalendar', label: '学习日历' },
  { key: 'aiReport', label: 'AI 周报' },
]

function ForumPrivacy() {
  const [settings, setSettings] = useState({ preset: 'privacy', overrides: {} })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getPrivacySettings()
      setSettings(data || { preset: 'privacy', overrides: {} })
    } catch {
      Toast.show({ content: '加载失败' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadSettings() }, [loadSettings])

  const getPresetValues = (preset) => {
    const map = {
      privacy: { totalHours: true, streakDays: true, weeklyHours: false, subjectDistribution: false, studyCalendar: false, aiReport: false },
      social: { totalHours: true, streakDays: true, weeklyHours: true, subjectDistribution: true, studyCalendar: false, aiReport: false },
      open: { totalHours: true, streakDays: true, weeklyHours: true, subjectDistribution: true, studyCalendar: true, aiReport: true },
    }
    return map[preset] || map.privacy
  }

  const isFieldEnabled = (fieldKey) => {
    const presetValues = getPresetValues(settings.preset)
    return settings.overrides?.[fieldKey] ?? presetValues[fieldKey]
  }

  const handlePresetChange = async (preset) => {
    setSaving(true)
    try {
      const newSettings = await updatePrivacySettings({ preset })
      setSettings(newSettings || { preset, overrides: {} })
      Toast.show({ content: '已切换' })
    } catch {
      Toast.show({ content: '更新失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleFieldToggle = async (fieldKey) => {
    const currentVal = isFieldEnabled(fieldKey)
    const presetValues = getPresetValues(settings.preset)
    const newVal = !currentVal

    // If the new value matches the preset default, remove the override
    let overrides
    if (newVal === presetValues[fieldKey]) {
      overrides = { ...settings.overrides }
      delete overrides[fieldKey]
    } else {
      overrides = { ...(settings.overrides || {}), [fieldKey]: newVal }
    }

    setSaving(true)
    try {
      const newSettings = await updatePrivacySettings({ overrides })
      setSettings(newSettings || settings)
    } catch {
      Toast.show({ content: '更新失败' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 py-3 pb-20">
      <h2 className="text-lg font-bold text-slate-900 mb-1">隐私设置</h2>
      <p className="text-xs text-slate-400 mb-4">控制其他用户在论坛中能看到的你的学习数据</p>

      <div className="space-y-3 mb-6">
        <p className="text-sm font-semibold text-slate-700">快捷预设</p>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(PRESETS).map(([key, { label, desc, color }]) => (
            <button
              key={key}
              type="button"
              className={`p-3 rounded-xl border-2 text-center transition-all ${
                settings.preset === key
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-slate-100 bg-white'
              }`}
              onClick={() => handlePresetChange(key)}
            >
              <Shield size={20} className={`mx-auto mb-1 ${color}`} />
              <p className="text-xs font-semibold text-slate-700">{label}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-700">逐项设置</p>
        {FIELDS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between bg-white border border-slate-100 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-2">
              {isFieldEnabled(key) ? (
                <Eye size={14} className="text-emerald-500" />
              ) : (
                <EyeOff size={14} className="text-slate-300" />
              )}
              <span className="text-sm text-slate-700">{label}</span>
            </div>
            <Switch
              checked={isFieldEnabled(key)}
              onChange={() => handleFieldToggle(key)}
              style={{ '--height': '22px', '--width': '40px' }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export default ForumPrivacy
