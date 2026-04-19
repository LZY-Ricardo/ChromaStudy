import { useCallback, useEffect, useState } from 'react'
import { Button, Dialog, Empty, InfiniteScroll, SpinLoading, Tag, TextArea, Toast } from 'antd-mobile'
import { Heart, MessageCircle, MoreHorizontal, Send, Trash2, UserCircle } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { createComment, deleteComment, getPost, toggleCommentLike, togglePostLike, deletePost } from '../services/forumApi.js'

function PostDetail({ user }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [commentText, setCommentText] = useState('')
  const [isAnon, setIsAnon] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [liked, setLiked] = useState(false)

  const loadPost = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getPost(id)
      setPost(data)
      setLiked(data.viewerLiked)
    } catch {
      Toast.show({ content: '加载失败' })
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadPost() }, [loadPost])

  const handleLike = async () => {
    try {
      const result = await togglePostLike(id)
      setLiked(result.liked)
      setPost((prev) => ({ ...prev, likeCount: prev.likeCount + (result.liked ? 1 : -1) }))
    } catch { /* ignore */ }
  }

  const handleCommentLike = async (commentId) => {
    try {
      await toggleCommentLike(commentId)
      setPost((prev) => ({
        ...prev,
        comments: prev.comments.map((c) =>
          c.id === commentId
            ? { ...c, viewerLiked: !c.viewerLiked, likeCount: c.likeCount + (c.viewerLiked ? -1 : 1) }
            : c
        ),
      }))
    } catch { /* ignore */ }
  }

  const handleSubmitComment = async () => {
    if (!commentText.trim()) return
    setSubmitting(true)
    try {
      const comment = await createComment(id, { content: commentText.trim(), isAnonymous: isAnon })
      setPost((prev) => ({
        ...prev,
        comments: [...prev.comments, { ...comment, viewerLiked: false }],
        commentCount: prev.commentCount + 1,
      }))
      setCommentText('')
      Toast.show({ content: '评论成功' })
    } catch {
      Toast.show({ content: '评论失败' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeletePost = async () => {
    const confirmed = await Dialog.confirm({ content: '确定删除这篇帖子吗？' })
    if (!confirmed) return
    try {
      await deletePost(id)
      Toast.show({ content: '已删除' })
      navigate('/forum', { replace: true })
    } catch {
      Toast.show({ content: '删除失败' })
    }
  }

  const handleDeleteComment = async (commentId) => {
    const confirmed = await Dialog.confirm({ content: '确定删除这条评论吗？' })
    if (!confirmed) return
    try {
      await deleteComment(commentId)
      setPost((prev) => ({
        ...prev,
        comments: prev.comments.filter((c) => c.id !== commentId),
        commentCount: prev.commentCount - 1,
      }))
    } catch { /* ignore */ }
  }

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '刚刚'
    if (mins < 60) return `${mins}分钟前`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}小时前`
    const days = Math.floor(hours / 24)
    return `${days}天前`
  }

  if (loading) {
    return <div className="flex justify-center py-12"><SpinLoading /></div>
  }

  if (!post) {
    return <Empty description="帖子不存在" />
  }

  return (
    <div className="px-4 py-3 pb-20">
      {/* Post header */}
      <div className="flex items-center justify-between mb-3">
        <button type="button" className="text-sm text-slate-400" onClick={() => navigate(-1)}>
          &larr; 返回
        </button>
        {post.isOwner && (
          <button type="button" className="text-rose-400" onClick={handleDeletePost}>
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* Post content */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <UserCircle size={18} className="text-slate-400" />
          <span className="text-sm font-medium text-slate-700">
            {post.isAnonymous && !post.isOwner ? '匿名用户' : post.author.username}
          </span>
          {post.isAnonymous && <Tag color="orange" fill="outline" style={{ '--font-size': '10px' }}>匿名</Tag>}
          <span className="text-xs text-slate-300 ml-auto">{timeAgo(post.createdAt)}</span>
        </div>
        <h1 className="text-base font-bold text-slate-900 mb-2">{post.title}</h1>
        <div className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{post.content}</div>

        {post.studyCard && (
          <div className="mt-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-3">
            <p className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wider mb-2">学习卡片</p>
            <div className="flex gap-4">
              <div>
                <p className="text-lg font-bold text-emerald-700">{post.studyCard.totalHours}h</p>
                <p className="text-[10px] text-emerald-500">总学习时长</p>
              </div>
              <div>
                <p className="text-lg font-bold text-emerald-700">{post.studyCard.streakDays}天</p>
                <p className="text-[10px] text-emerald-500">连续打卡</p>
              </div>
              {post.studyCard.weeklyHours != null && (
                <div>
                  <p className="text-lg font-bold text-emerald-700">{post.studyCard.weeklyHours}h</p>
                  <p className="text-[10px] text-emerald-500">本周</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 mt-3">
          <button
            type="button"
            className={`flex items-center gap-1 text-sm ${liked ? 'text-rose-500' : 'text-slate-400'}`}
            onClick={handleLike}
          >
            <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
            {post.likeCount}
          </button>
          <span className="flex items-center gap-1 text-sm text-slate-400">
            <MessageCircle size={16} />
            {post.commentCount}
          </span>
        </div>
      </div>

      {/* Comments */}
      <div className="border-t border-slate-100 pt-3">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">评论 ({post.commentCount})</h3>

        {post.comments.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-4">暂无评论，来说两句</p>
        )}

        <div className="space-y-3">
          {post.comments.map((c) => (
            <div key={c.id} className="bg-slate-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <UserCircle size={14} className="text-slate-400" />
                  <span className="text-xs font-medium text-slate-600">
                    {c.isAnonymous && !c.isOwner ? '匿名用户' : c.author.username}
                  </span>
                  {c.isAnonymous && <Tag color="orange" fill="outline" style={{ '--font-size': '10px' }}>匿名</Tag>}
                  <span className="text-[10px] text-slate-300">{timeAgo(c.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={`text-xs flex items-center gap-0.5 ${c.viewerLiked ? 'text-rose-500' : 'text-slate-400'}`}
                    onClick={() => handleCommentLike(c.id)}
                  >
                    <Heart size={12} fill={c.viewerLiked ? 'currentColor' : 'none'} />
                    {c.likeCount}
                  </button>
                  {c.isOwner && (
                    <button type="button" className="text-slate-300" onClick={() => handleDeleteComment(c.id)}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Comment input */}
      <div className="fixed bottom-14 left-0 right-0 bg-white border-t border-slate-100 px-4 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2 max-w-[430px] mx-auto">
          <button
            type="button"
            className={`text-xs px-2 py-1 rounded-full border ${isAnon ? 'bg-orange-50 border-orange-300 text-orange-500' : 'border-slate-200 text-slate-400'}`}
            onClick={() => setIsAnon(!isAnon)}
          >
            匿名
          </button>
          <input
            type="text"
            className="flex-1 text-sm border border-slate-200 rounded-full px-3 py-1.5 outline-none focus:border-emerald-400"
            placeholder="写评论..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
          />
          <button
            type="button"
            className="text-emerald-500 disabled:text-slate-300"
            disabled={!commentText.trim() || submitting}
            onClick={handleSubmitComment}
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default PostDetail
