import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Button, Card, Dialog, Input, List, Switch, Tag, TextArea, Toast } from 'antd-mobile'
import { checkin, createTask, getStudyLogs, getTasks, updateTask } from '../services/api.js'

function Today({ user }) {
  const todayLabel = dayjs().format('dddd, MMM D')
  const todayKey = dayjs().format('YYYY-MM-DD')
  const [tasks, setTasks] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [checkinOpen, setCheckinOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [duration, setDuration] = useState('')
  const [content, setContent] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [savingCheckin, setSavingCheckin] = useState(false)
  const [savingTask, setSavingTask] = useState(false)
  const [updatingTaskId, setUpdatingTaskId] = useState(null)

  const todayLog = useMemo(
    () => logs.find((log) => log.date === todayKey),
    [logs, todayKey]
  )
  const completedCount = tasks.filter((task) => task.isDone).length

  useEffect(() => {
    if (!user?.id) {
      return
    }
    const load = async () => {
      setLoading(true)
      try {
        const [taskData, logData] = await Promise.all([
          getTasks(user.id),
          getStudyLogs(user.id),
        ])
        setTasks(taskData)
        setLogs(logData)
      } catch {
        Toast.show({ content: '数据加载失败，请稍后重试' })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  const handleCheckin = async () => {
    const minutes = Number.parseInt(duration, 10)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      Toast.show({ content: '请输入学习时长（分钟）' })
      return
    }
    if (!content.trim()) {
      Toast.show({ content: '请输入学习内容' })
      return
    }
    setSavingCheckin(true)
    try {
      const log = await checkin({
        userId: user.id,
        date: todayKey,
        duration: minutes,
        content: content.trim(),
      })
      setLogs((prev) => {
        const exists = prev.find((item) => item.date === log.date)
        if (exists) {
          return prev.map((item) => (item.date === log.date ? log : item))
        }
        return [...prev, log]
      })
      setCheckinOpen(false)
      setDuration('')
      setContent('')
      Toast.show({ content: '打卡完成，AI 点评生成中' })
    } catch {
      Toast.show({ content: '打卡失败，请稍后重试' })
    } finally {
      setSavingCheckin(false)
    }
  }

  const handleCreateTask = async () => {
    const title = taskTitle.trim()
    if (!title) {
      Toast.show({ content: '请输入任务内容' })
      return
    }
    setSavingTask(true)
    try {
      const task = await createTask(user.id, title)
      setTasks((prev) => [...prev, task])
      setTaskOpen(false)
      setTaskTitle('')
      Toast.show({ content: '任务已添加' })
    } catch {
      Toast.show({ content: '新增任务失败' })
    } finally {
      setSavingTask(false)
    }
  }

  const handleToggleTask = async (task, value) => {
    setUpdatingTaskId(task.id)
    try {
      const updated = await updateTask(task.id, { isDone: value })
      setTasks((prev) => prev.map((item) => (item.id === task.id ? updated : item)))
    } catch {
      Toast.show({ content: '更新任务状态失败' })
    } finally {
      setUpdatingTaskId(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Today</p>
            <p className="display-font text-xl font-semibold text-slate-900">{todayLabel}</p>
            <p className="mt-1 text-xs text-slate-500">
              {todayLog
                ? `已学习 ${todayLog.duration} 分钟`
                : loading
                  ? '正在同步打卡状态'
                  : '今日尚未打卡'}
            </p>
          </div>
          <Tag color={todayLog ? 'success' : 'warning'} fill="outline">
            {completedCount}/{tasks.length} done
          </Tag>
        </div>
      </Card>

      <Card title="Task Radar" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-500">还没有任务，先创建一个吧。</p>
        ) : (
          <List>
            {tasks.map((task) => (
              <List.Item
                key={task.id}
                extra={
                  <Switch
                    checked={task.isDone}
                    disabled={updatingTaskId === task.id}
                    onChange={(value) => handleToggleTask(task, value)}
                  />
                }
              >
                <span className={task.isDone ? 'line-through text-slate-400' : 'text-slate-900'}>
                  {task.title}
                </span>
              </List.Item>
            ))}
          </List>
        )}
      </Card>

      <Card title="Check-in" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <p className="text-sm text-slate-500">
          记录学习时长与笔记，AI 会给你 50 字内的专属点评。
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Button block color="primary" size="large" onClick={() => setCheckinOpen(true)}>
            完成学习
          </Button>
          <Button block color="default" size="large" fill="outline" onClick={() => setTaskOpen(true)}>
            添加任务
          </Button>
        </div>
      </Card>

      <Dialog
        visible={checkinOpen}
        title="完成学习"
        closeOnMaskClick={!savingCheckin}
        closeOnAction={false}
        onClose={() => setCheckinOpen(false)}
        actions={[
          { key: 'cancel', text: '取消' },
          {
            key: 'submit',
            text: savingCheckin ? '提交中...' : '提交',
            bold: true,
            disabled: savingCheckin,
          },
        ]}
        onAction={(action) => {
          if (action.key === 'submit') {
            handleCheckin()
          } else {
            setCheckinOpen(false)
          }
        }}
        content={
          <div className="space-y-3">
            <Input
              type="number"
              inputMode="numeric"
              placeholder="学习时长（分钟）"
              value={duration}
              onChange={setDuration}
              clearable
            />
            <TextArea
              placeholder="今天学习了什么？"
              value={content}
              onChange={setContent}
              rows={4}
              showCount
              maxLength={200}
            />
          </div>
        }
      />

      <Dialog
        visible={taskOpen}
        title="新增任务"
        closeOnMaskClick={!savingTask}
        closeOnAction={false}
        onClose={() => setTaskOpen(false)}
        actions={[
          { key: 'cancel', text: '取消' },
          {
            key: 'submit',
            text: savingTask ? '保存中...' : '保存',
            bold: true,
            disabled: savingTask,
          },
        ]}
        onAction={(action) => {
          if (action.key === 'submit') {
            handleCreateTask()
          } else {
            setTaskOpen(false)
          }
        }}
        content={
          <Input
            placeholder="例如：复盘算法笔记"
            value={taskTitle}
            onChange={setTaskTitle}
            clearable
          />
        }
      />
    </div>
  )
}

export default Today
