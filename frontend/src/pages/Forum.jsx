import { useCallback, useEffect, useState } from 'react'
import { InfiniteScroll, List, SpinLoading, Tag, Toast } from 'antd-mobile'
import { Heart, MessageCircle, UserCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getPosts } from '../services/forumApi.js'

function Forum({ user }) {
  const navigate = useNavigate()
  const [posts, setPosts] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)

  const loadPosts = useCallback(async (pageNum = 1) => {
    setLoading(true)
    try {
      const data = await getPosts({ page: pageNum })
      const newPosts = data.posts || []
      if (pageNum === 1) setPosts(newPosts)
      else setPosts((prev) => [...prev, ...newPosts])
      setHasMore(pageNum < data.pagination.totalPages)
      setPage(pageNum)
    } catch {
      Toast.show({ content: '加载失败' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPosts(1) }, [loadPosts])

  const loadMore = async () => {
    if (loading || !hasMore) return
    await loadPosts(page + 1)
  }

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '刚刚'
    if (mins < 60) return `${mins}分钟前`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}小时前`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}天前`
    return new Date(dateStr).toLocaleDateString('zh-CN')
  }

  return (
    <div className="px-4 py-3 space-y-3 pb-20">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">论坛</h2>
        <button
          type="button"
          className="px-3 py-1.5 bg-emerald-500 text-white text-sm rounded-full font-medium"
          onClick={() => navigate('/forum/new')}
        >
          发帖
        </button>
      </div>

      {posts.length === 0 && !loading && (
        <div className="text-center py-12 text-slate-400">
          <MessageCircle size={40} className="mx-auto mb-2 opacity-30" />
          <p>还没有帖子，来发第一帖吧</p>
        </div>
      )}

      <List>
        {posts.map((post) => (
          <List.Item
            key={post.id}
            onClick={() => navigate(`/forum/post/${post.id}`)}
            className="rounded-xl"
          >
            <div className="w-full">
              <div className="flex items-center gap-2 mb-1">
                <UserCircle size={16} className="text-slate-400" />
                <span className="text-xs text-slate-500">
                  {post.isAnonymous && !post.isOwner ? '匿名用户' : post.author.username}
                </span>
                {post.isAnonymous && <Tag color="orange" fill="outline" style={{ '--font-size': '10px' }}>匿名</Tag>}
                <span className="text-xs text-slate-300 ml-auto">{timeAgo(post.createdAt)}</span>
              </div>
              <h3 className="text-sm font-semibold text-slate-800 mb-1 line-clamp-1">{post.title}</h3>
              <p className="text-xs text-slate-500 line-clamp-2 mb-2">{post.content}</p>
              {post.studyCard && (
                <div className="bg-emerald-50 rounded-lg px-2 py-1 mb-2">
                  <span className="text-[10px] text-emerald-600 font-medium">
                    {post.studyCard.totalHours}h · {post.studyCard.streakDays}天连续
                  </span>
                </div>
              )}
              <div className="flex items-center gap-4 text-slate-400">
                <span className="flex items-center gap-1 text-xs">
                  <Heart size={12} /> {post.likeCount}
                </span>
                <span className="flex items-center gap-1 text-xs">
                  <MessageCircle size={12} /> {post.commentCount}
                </span>
              </div>
            </div>
          </List.Item>
        ))}
      </List>

      <InfiniteScroll loadMore={loadMore} hasMore={hasMore}>
        {loading ? (
          <div className="text-center py-4"><SpinLoading /></div>
        ) : null}
      </InfiniteScroll>
    </div>
  )
}

export default Forum
