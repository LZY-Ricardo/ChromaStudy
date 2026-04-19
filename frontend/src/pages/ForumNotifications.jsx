import { useCallback, useEffect, useState } from 'react'
import { InfiniteScroll, List, SpinLoading, Toast } from 'antd-mobile'
import { Bell, CheckCheck } from 'lucide-react'
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../services/forumApi.js'

const TYPE_LABELS = {
  comment: '新评论',
  like: '新点赞',
  group_invite: '小组邀请',
}

function ForumNotifications() {
  const [notifs, setNotifs] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)

  const loadNotifs = useCallback(async (pageNum = 1) => {
    setLoading(true)
    try {
      const data = await getNotifications({ page: pageNum })
      const items = data.notifications || []
      if (pageNum === 1) setNotifs(items)
      else setNotifs((prev) => [...prev, ...items])
      setHasMore(pageNum < data.pagination.totalPages)
      setPage(pageNum)
    } catch {
      Toast.show({ content: '加载失败' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadNotifs(1) }, [loadNotifs])

  const handleReadAll = async () => {
    try {
      await markAllNotificationsRead()
      setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })))
      Toast.show({ content: '全部已读' })
    } catch { /* ignore */ }
  }

  const handleRead = async (notifId) => {
    try {
      await markNotificationRead(notifId)
      setNotifs((prev) => prev.map((n) => n.id === notifId ? { ...n, isRead: true } : n))
    } catch { /* ignore */ }
  }

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '刚刚'
    if (mins < 60) return `${mins}分钟前`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}小时前`
    return `${Math.floor(hours / 24)}天前`
  }

  return (
    <div className="px-4 py-3 pb-20">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-slate-900">通知</h2>
        <button type="button" className="text-xs text-emerald-500" onClick={handleReadAll}>
          <CheckCheck size={14} className="inline mr-0.5" />全部已读
        </button>
      </div>

      {notifs.length === 0 && !loading && (
        <div className="text-center py-12 text-slate-400">
          <Bell size={40} className="mx-auto mb-2 opacity-30" />
          <p>暂无通知</p>
        </div>
      )}

      <List>
        {notifs.map((notif) => (
          <List.Item
            key={notif.id}
            onClick={() => !notif.isRead && handleRead(notif.id)}
          >
            <div className={`w-full ${!notif.isRead ? 'bg-emerald-50 -mx-3 px-3 rounded-lg py-1' : ''}`}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-medium text-slate-700">{TYPE_LABELS[notif.type] || notif.type}</span>
                <span className="text-[10px] text-slate-300">{timeAgo(notif.createdAt)}</span>
              </div>
              {!notif.isRead && <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1" />}
            </div>
          </List.Item>
        ))}
      </List>

      <InfiniteScroll loadMore={() => { if (!loading && hasMore) loadNotifs(page + 1) }} hasMore={hasMore}>
        {loading ? <div className="text-center py-4"><SpinLoading /></div> : null}
      </InfiniteScroll>
    </div>
  )
}

export default ForumNotifications
