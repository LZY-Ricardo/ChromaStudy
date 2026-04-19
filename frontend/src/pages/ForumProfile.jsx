import { useCallback, useEffect, useState } from 'react'
import { InfiniteScroll, List, SpinLoading, Toast } from 'antd-mobile'
import { useNavigate, useParams } from 'react-router-dom'
import { getUserProfile, getPosts } from '../services/forumApi.js'

function ForumProfile({ user }) {
  const { userId } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)

  const targetId = Number(userId) || user?.id

  const loadProfile = useCallback(async () => {
    try {
      const data = await getUserProfile(targetId)
      setProfile(data)
    } catch {
      Toast.show({ content: '加载失败' })
    }
  }, [targetId])

  // FIX: use backend authorId filter instead of client-side filtering
  const loadPosts = useCallback(async (pageNum = 1) => {
    setLoading(true)
    try {
      const data = await getPosts({ page: pageNum, authorId: targetId })
      const newPosts = data.posts || []
      if (pageNum === 1) setPosts(newPosts)
      else setPosts((prev) => [...prev, ...newPosts])
      setHasMore(pageNum < data.pagination.totalPages)
      setPage(pageNum)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [targetId])

  useEffect(() => { loadProfile(); loadPosts(1) }, [loadProfile, loadPosts])

  if (!profile) return <div className="flex justify-center py-12"><SpinLoading /></div>

  return (
    <div className="px-4 py-3 pb-20">
      <div className="flex items-center justify-between mb-4">
        <button type="button" className="text-sm text-slate-400" onClick={() => navigate(-1)}>
          &larr; 返回
        </button>
        <h2 className="text-base font-bold text-slate-900">个人主页</h2>
        <div className="w-8" />
      </div>

      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4 mb-4 text-center">
        <div className="text-3xl font-bold text-emerald-600 mb-2">{profile.username}</div>

        <div className="flex justify-center gap-6 mt-3">
          {profile.totalHours != null && (
            <div>
              <p className="text-lg font-bold text-emerald-700">{profile.totalHours}h</p>
              <p className="text-[10px] text-emerald-500">总时长</p>
            </div>
          )}
          {profile.streakDays != null && (
            <div>
              <p className="text-lg font-bold text-emerald-700">{profile.streakDays}天</p>
              <p className="text-[10px] text-emerald-500">连续打卡</p>
            </div>
          )}
          {profile.weeklyHours != null && (
            <div>
              <p className="text-lg font-bold text-emerald-700">{profile.weeklyHours}h</p>
              <p className="text-[10px] text-emerald-500">本周</p>
            </div>
          )}
        </div>

        <div className="flex justify-center gap-4 mt-2 text-slate-500">
          <span className="text-xs">{profile.postCount} 帖子</span>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-slate-700 mb-2">TA 的帖子</h3>
      {posts.length === 0 && !loading && (
        <p className="text-sm text-slate-400 text-center py-4">暂无帖子</p>
      )}
      <List>
        {posts.map((post) => (
          <List.Item key={post.id} onClick={() => navigate(`/forum/post/${post.id}`)}>
            <div className="w-full">
              <div className="flex items-center gap-2 mb-1">
                {post.isAnonymous && !post.isOwner ? (
                  <span className="text-xs text-slate-500">匿名用户</span>
                ) : (
                  <span className="text-xs text-slate-500">{post.author.username}</span>
                )}
                <span className="text-xs text-slate-300 ml-auto">{new Date(post.createdAt).toLocaleDateString('zh-CN')}</span>
              </div>
              <h4 className="text-sm font-semibold text-slate-800 mb-1 line-clamp-1">{post.title}</h4>
              <p className="text-xs text-slate-500 line-clamp-2">{post.content}</p>
              <div className="flex items-center gap-4 mt-1 text-slate-400">
                <span className="flex items-center gap-1 text-xs">{post.likeCount} 赞</span>
                <span className="flex items-center gap-1 text-xs">{post.commentCount} 评</span>
              </div>
            </div>
          </List.Item>
        ))}
      </List>

      <InfiniteScroll loadMore={() => { if (!loading && hasMore) loadPosts(page + 1) }} hasMore={hasMore}>
        {loading ? <div className="text-center py-4"><SpinLoading /></div> : null}
      </InfiniteScroll>
    </div>
  )
}

export default ForumProfile
