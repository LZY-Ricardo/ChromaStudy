import { useCallback, useEffect, useState } from 'react'
import { Button, Dialog, InfiniteScroll, List, SpinLoading, Tag, Toast } from 'antd-mobile'
import { Heart, LogOut, MessageCircle, Plus, Trash2, Users } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { getGroup, getGroupPosts, joinGroup, leaveGroup, removeGroupMember } from '../services/forumApi.js'

function GroupDetail({ user }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [posts, setPosts] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)

  const loadGroup = useCallback(async () => {
    try {
      const data = await getGroup(id)
      setGroup(data)
      if (data.myRole) loadPosts(1)
    } catch {
      Toast.show({ content: '加载失败' })
    }
  }, [id])

  const loadPosts = useCallback(async (pageNum = 1) => {
    setLoading(true)
    try {
      const data = await getGroupPosts(id, { page: pageNum })
      const items = data.posts || []
      if (pageNum === 1) setPosts(items)
      else setPosts((prev) => [...prev, ...items])
      setHasMore(pageNum < data.pagination.totalPages)
      setPage(pageNum)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { loadGroup() }, [loadGroup])

  const handleJoin = async () => {
    try {
      await joinGroup(id)
      Toast.show({ content: '已加入' })
      loadGroup()
    } catch (e) {
      Toast.show({ content: e?.response?.data?.error || '加入失败' })
    }
  }

  const handleLeave = async () => {
    const confirmed = await Dialog.confirm({ content: '确定退出小组吗？' })
    if (!confirmed) return
    try {
      await leaveGroup(id)
      Toast.show({ content: '已退出' })
      navigate('/forum/groups', { replace: true })
    } catch (e) {
      Toast.show({ content: e?.response?.data?.error || '退出失败' })
    }
  }

  if (!group) return <div className="flex justify-center py-12"><SpinLoading /></div>

  const isMember = !!group.myRole
  const isAdmin = group.myRole === 'admin'

  return (
    <div className="px-4 py-3 pb-20">
      <div className="flex items-center justify-between mb-4">
        <button type="button" className="text-sm text-slate-400" onClick={() => navigate(-1)}>
          &larr; 返回
        </button>
        <h2 className="text-base font-bold text-slate-900">小组详情</h2>
        <div className="w-8" />
      </div>

      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4 mb-4">
        <h3 className="text-lg font-bold text-slate-900 mb-1">{group.name}</h3>
        {group.description && <p className="text-sm text-slate-500 mb-2">{group.description}</p>}
        <div className="flex items-center gap-2 mb-3">
          {group.tags?.map((t) => (
            <Tag key={t} color="emerald" fill="outline" style={{ '--font-size': '10px' }}>{t}</Tag>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500"><Users size={12} className="inline mr-1" />{group.memberCount} 成员 · {group.postCount} 帖子</span>
          {!isMember ? (
            <Button size="small" color="primary" onClick={handleJoin} style={{ '--adm-button-background-color': '#10b981' }}>
              加入
            </Button>
          ) : !isAdmin ? (
            <Button size="small" color="danger" onClick={handleLeave}>
              退出
            </Button>
          ) : null}
        </div>
      </div>

      {isMember && (
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700">小组帖子</h3>
          <button
            type="button"
            className="px-3 py-1 bg-emerald-500 text-white text-xs rounded-full"
            onClick={() => navigate(`/forum/new?groupId=${id}`)}
          >
            <Plus size={12} className="inline mr-0.5" />发帖
          </button>
        </div>
      )}

      {!isMember && (
        <p className="text-sm text-slate-400 text-center py-8">加入小组后即可查看帖子</p>
      )}

      {isMember && (
        <>
          {posts.length === 0 && !loading && <p className="text-sm text-slate-400 text-center py-4">暂无帖子</p>}
          <List>
            {posts.map((post) => (
              <List.Item key={post.id} onClick={() => navigate(`/forum/post/${post.id}`)}>
                <div className="w-full">
                  <h4 className="text-sm font-semibold text-slate-800 mb-1 line-clamp-1">{post.title}</h4>
                  <p className="text-xs text-slate-500 line-clamp-2">{post.content}</p>
                  <div className="flex items-center gap-4 mt-1 text-slate-400">
                    <span className="flex items-center gap-1 text-xs"><Heart size={12} /> {post.likeCount}</span>
                    <span className="flex items-center gap-1 text-xs"><MessageCircle size={12} /> {post.commentCount}</span>
                  </div>
                </div>
              </List.Item>
            ))}
          </List>
          <InfiniteScroll loadMore={() => { if (!loading && hasMore) loadPosts(page + 1) }} hasMore={hasMore}>
            {loading ? <div className="text-center py-4"><SpinLoading /></div> : null}
          </InfiniteScroll>
        </>
      )}
    </div>
  )
}

export default GroupDetail
