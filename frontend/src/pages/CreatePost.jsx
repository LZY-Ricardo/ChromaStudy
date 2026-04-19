import { useState } from 'react'
import { Button, Input, Switch, TextArea, Toast } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'
import { createPost } from '../services/forumApi.js'

function CreatePost() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [attachCard, setAttachCard] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      Toast.show({ content: '标题和内容不能为空' })
      return
    }
    setSubmitting(true)
    try {
      const post = await createPost({
        title: title.trim(),
        content: content.trim(),
        isAnonymous,
        attachStudyCard: attachCard,
      })
      Toast.show({ content: '发布成功' })
      navigate(`/forum/post/${post.id}`, { replace: true })
    } catch {
      Toast.show({ content: '发布失败' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="px-4 py-3 pb-20">
      <div className="flex items-center justify-between mb-4">
        <button type="button" className="text-sm text-slate-400" onClick={() => navigate(-1)}>
          &larr; 返回
        </button>
        <h2 className="text-base font-bold text-slate-900">发帖</h2>
        <div className="w-8" />
      </div>

      <div className="space-y-4">
        <input
          type="text"
          className="w-full text-base font-semibold text-slate-900 border-0 outline-none placeholder:text-slate-300"
          placeholder="标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
        />

        <textarea
          className="w-full text-sm text-slate-700 border-0 outline-none resize-none placeholder:text-slate-300 leading-relaxed"
          placeholder="分享你的想法、经验或问题..."
          rows={8}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />

        <div className="border-t border-slate-100 pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-700">匿名发帖</p>
              <p className="text-xs text-slate-400">其他用户将看到"匿名用户"</p>
            </div>
            <Switch checked={isAnonymous} onChange={setIsAnonymous} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-700">附加学习卡片</p>
              <p className="text-xs text-slate-400">展示你的学习统计数据</p>
            </div>
            <Switch checked={attachCard} onChange={setAttachCard} />
          </div>
        </div>

        <Button
          block
          color="primary"
          size="large"
          loading={submitting}
          disabled={!title.trim() || !content.trim()}
          onClick={handleSubmit}
          style={{ '--adm-button-background-color': '#10b981' }}
        >
          发布
        </Button>
      </div>
    </div>
  )
}

export default CreatePost
