import { useCallback, useEffect, useState } from 'react'
import { InfiniteScroll, List, SpinLoading, Switch, Toast } from 'antd-mobile'
import { Heart, Clock, Share2 } from 'lucide-react'
import { getCheckinWall } from '../services/forumApi.js'

function CheckinWall() {
  const [entries, setEntries] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)

  const loadEntries = useCallback(async (pageNum = 1) => {
    setLoading(true)
    try {
      const data = await getCheckinWall({ page: pageNum })
      const newEntries = data.entries || []
      if (pageNum === 1) setEntries(newEntries)
      else setEntries((prev) => [...prev, ...newEntries])
      setHasMore(pageNum < data.pagination.totalPages)
      setPage(pageNum)
    } catch {
      Toast.show({ content: '加载失败' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadEntries(1) }, [loadEntries])

  return (
    <div className="px-4 py-3 pb-20">
      <h2 className="text-lg font-bold text-slate-900 mb-3">打卡墙</h2>

      {entries.length === 0 && !loading && (
        <div className="text-center py-12 text-slate-400">
          <Clock size={40} className="mx-auto mb-2 opacity-30" />
          <p>还没有人打卡，来做第一个吧</p>
        </div>
      )}

      <List>
        {entries.map((entry) => (
          <List.Item key={entry.id}>
            <div className="w-full">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-slate-700">{entry.author.username}</span>
                <span className="text-xs text-slate-300">{entry.date}</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {entry.hours}h
                </span>
                {entry.content && (
                  <span className="text-xs text-slate-500 line-clamp-1">{entry.content}</span>
                )}
              </div>
            </div>
          </List.Item>
        ))}
      </List>

      <InfiniteScroll loadMore={() => { if (!loading && hasMore) loadEntries(page + 1) }} hasMore={hasMore}>
        {loading ? <div className="text-center py-4"><SpinLoading /></div> : null}
      </InfiniteScroll>
    </div>
  )
}

export default CheckinWall
