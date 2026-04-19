import { useCallback, useEffect, useState } from 'react'
import { Button, Dialog, InfiniteScroll, Input, List, SpinLoading, Tag, TextArea, Toast } from 'antd-mobile'
import { LogOut, Plus, Search, Trash2, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { createGroup, getGroups, joinGroup, leaveGroup, removeGroupMember, getGroup } from '../services/forumApi.js'

function Groups({ user }) {
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newTags, setNewTags] = useState('')
  const [creating, setCreating] = useState(false)
  const [joinedGroups, setJoinedGroups] = useState(new Set())

  const loadGroups = useCallback(async (pageNum = 1, search = '') => {
    setLoading(true)
    try {
      const data = await getGroups({ page: pageNum, search })
      const items = data.groups || []
      if (pageNum === 1) setGroups(items)
      else setGroups((prev) => [...prev, ...items])
      setHasMore(pageNum < data.pagination.totalPages)
      setPage(pageNum)
    } catch {
      Toast.show({ content: '加载失败' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadGroups(1) }, [loadGroups])

  const handleSearch = () => {
    loadGroups(1, searchText)
  }

  const handleCreate = async () => {
    if (!newName.trim()) { Toast.show({ content: '请输入小组名称' }); return }
    setCreating(true)
    try {
      const group = await createGroup({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        tags: newTags.trim() ? newTags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      })
      Toast.show({ content: '创建成功' })
      setCreateOpen(false)
      setNewName('')
      setNewDesc('')
      setNewTags('')
      navigate(`/forum/group/${group.id}`)
    } catch {
      Toast.show({ content: '创建失败' })
    } finally {
      setCreating(false)
    }
  }

  const handleJoin = async (groupId) => {
    try {
      await joinGroup(groupId)
      setJoinedGroups((prev) => new Set([...prev, groupId]))
      Toast.show({ content: '已加入' })
    } catch (e) {
      Toast.show({ content: e?.response?.data?.error || '加入失败' })
    }
  }

  return (
    <div className="px-4 py-3 pb-20">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-slate-900">学习小组</h2>
        <button
          type="button"
          className="p-1.5 bg-emerald-500 text-white rounded-full"
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-emerald-400"
          placeholder="搜索小组..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button type="button" className="px-3 py-1.5 text-sm text-emerald-600" onClick={handleSearch}>
          <Search size={16} />
        </button>
      </div>

      {groups.length === 0 && !loading && (
        <div className="text-center py-12 text-slate-400">
          <Users size={40} className="mx-auto mb-2 opacity-30" />
          <p>还没有小组，来创建一个吧</p>
        </div>
      )}

      <List>
        {groups.map((group) => (
          <List.Item key={group.id} onClick={() => navigate(`/forum/group/${group.id}`)}>
            <div className="w-full">
              <h3 className="text-sm font-semibold text-slate-800 mb-1">{group.name}</h3>
              {group.description && <p className="text-xs text-slate-500 line-clamp-1 mb-1">{group.description}</p>}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400"><Users size={10} className="inline mr-0.5" />{group.memberCount}人</span>
                {group.tags?.map((t) => (
                  <Tag key={t} color="emerald" fill="outline" style={{ '--font-size': '10px' }}>{t}</Tag>
                ))}
              </div>
            </div>
          </List.Item>
        ))}
      </List>

      <InfiniteScroll loadMore={() => { if (!loading && hasMore) loadGroups(page + 1, searchText) }} hasMore={hasMore}>
        {loading ? <div className="text-center py-4"><SpinLoading /></div> : null}
      </InfiniteScroll>

      <Dialog
        visible={createOpen}
        title="创建学习小组"
        content={
          <div className="space-y-3">
            <input type="text" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" placeholder="小组名称" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <textarea className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none resize-none" placeholder="简介（可选）" rows={2} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            <input type="text" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" placeholder="标签，逗号分隔（可选）" value={newTags} onChange={(e) => setNewTags(e.target.value)} />
          </div>
        }
        actions={[
          { key: 'cancel', text: '取消', onClick: () => setCreateOpen(false) },
          { key: 'create', text: '创建', bold: true, onClick: handleCreate },
        ]}
      />
    </div>
  )
}

export default Groups
