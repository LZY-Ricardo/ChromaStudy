import axios from 'axios'
import { apiBaseUrl } from './api.js'
import { loadAccessToken } from '../utils/authStorage.js'

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000,
})

api.interceptors.request.use(
  (config) => {
    const token = loadAccessToken()
    if (token) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ── Posts ──

export async function createPost({ title, content, isAnonymous, attachStudyCard, groupId }) {
  const { data } = await api.post('/api/forum/posts', { title, content, isAnonymous, attachStudyCard, groupId })
  return data
}

export async function getPosts({ page = 1, pageSize = 20, groupId } = {}) {
  const params = { page, pageSize }
  if (groupId) params.groupId = groupId
  const { data } = await api.get('/api/forum/posts', { params })
  return data
}

export async function getPost(id) {
  const { data } = await api.get(`/api/forum/posts/${id}`)
  return data
}

export async function updatePost(id, { title, content }) {
  const { data } = await api.put(`/api/forum/posts/${id}`, { title, content })
  return data
}

export async function deletePost(id) {
  const { data } = await api.delete(`/api/forum/posts/${id}`)
  return data
}

// ── Comments ──

export async function createComment(postId, { content, isAnonymous }) {
  const { data } = await api.post(`/api/forum/posts/${postId}/comments`, { content, isAnonymous })
  return data
}

export async function deleteComment(id) {
  const { data } = await api.delete(`/api/forum/comments/${id}`)
  return data
}

// ── Likes ──

export async function togglePostLike(postId) {
  const { data } = await api.post(`/api/forum/posts/${postId}/like`)
  return data
}

export async function toggleCommentLike(commentId) {
  const { data } = await api.post(`/api/forum/comments/${commentId}/like`)
  return data
}

// ── Privacy & Study Card ──

export async function getPrivacySettings() {
  const { data } = await api.get('/api/forum/privacy')
  return data.settings
}

export async function updatePrivacySettings({ preset, overrides }) {
  const { data } = await api.put('/api/forum/privacy', { preset, overrides })
  return data.settings
}

export async function getStudyCard() {
  const { data } = await api.get('/api/forum/study-card')
  return data
}

// ── Check-in Wall ──

export async function getCheckinWall({ page = 1, pageSize = 20 } = {}) {
  const { data } = await api.get('/api/forum/checkin-wall', { params: { page, pageSize } })
  return data
}

export async function toggleShareStudyLog(logId, sharedToWall) {
  const { data } = await api.patch(`/api/forum/study-logs/${logId}/share`, { sharedToWall })
  return data
}

// ── Study Groups ──

export async function createGroup({ name, description, tags }) {
  const { data } = await api.post('/api/forum/groups', { name, description, tags })
  return data
}

export async function getGroups({ page = 1, pageSize = 20, search } = {}) {
  const params = { page, pageSize }
  if (search) params.search = search
  const { data } = await api.get('/api/forum/groups', { params })
  return data
}

export async function getGroup(id) {
  const { data } = await api.get(`/api/forum/groups/${id}`)
  return data
}

export async function joinGroup(id) {
  const { data } = await api.post(`/api/forum/groups/${id}/join`)
  return data
}

export async function leaveGroup(id) {
  const { data } = await api.post(`/api/forum/groups/${id}/leave`)
  return data
}

export async function removeGroupMember(groupId, userId) {
  const { data } = await api.delete(`/api/forum/groups/${groupId}/members/${userId}`)
  return data
}

export async function getGroupPosts(groupId, { page = 1, pageSize = 20 } = {}) {
  const { data } = await api.get(`/api/forum/groups/${groupId}/posts`, { params: { page, pageSize } })
  return data
}

// ── Notifications ──

export async function getNotifications({ page = 1, pageSize = 20, unread } = {}) {
  const params = { page, pageSize }
  if (unread) params.unread = 'true'
  const { data } = await api.get('/api/forum/notifications', { params })
  return data
}

export async function getUnreadNotificationCount() {
  const { data } = await api.get('/api/forum/notifications/unread-count')
  return data.count
}

export async function markNotificationRead(id) {
  const { data } = await api.patch(`/api/forum/notifications/${id}/read`)
  return data
}

export async function markAllNotificationsRead() {
  const { data } = await api.patch('/api/forum/notifications/read-all')
  return data
}

// ── User Profile ──

export async function getUserProfile(userId) {
  const { data } = await api.get(`/api/forum/users/${userId}/profile`)
  return data
}
