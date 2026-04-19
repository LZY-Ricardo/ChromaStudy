import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock api.js before importing Login
vi.mock('../../src/services/api.js', () => ({
  login: vi.fn(),
}))

// Mock antd-mobile Toast (it renders outside React tree)
vi.mock('antd-mobile', async () => {
  const actual = await vi.importActual('antd-mobile')
  return {
    ...actual,
    Toast: {
      show: vi.fn(),
    },
  }
})

import Login from '../../src/pages/Login.jsx'
import { login } from '../../src/services/api.js'

function renderLogin(props = {}) {
  return render(
    <MemoryRouter>
      <Login onLoggedIn={props.onLoggedIn ?? vi.fn()} />
    </MemoryRouter>
  )
}

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders username and password inputs', () => {
    renderLogin()
    expect(screen.getByPlaceholderText('用户名')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('密码')).toBeInTheDocument()
  })

  it('renders the submit button', () => {
    renderLogin()
    expect(screen.getByRole('button', { name: '进入' })).toBeInTheDocument()
  })

  it('shows toast when submitting with empty fields', async () => {
    const { Toast } = await import('antd-mobile')
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: '进入' }))
    expect(Toast.show).toHaveBeenCalledWith({ content: '请输入用户名和密码' })
  })

  it('navigates to register page on link click', () => {
    renderLogin()
    fireEvent.click(screen.getByText('去注册'))
    // MemoryRouter doesn't change URL visually, but link exists
    expect(screen.getByText('去注册')).toBeInTheDocument()
  })

  it('calls login and onLoggedIn on successful login', async () => {
    const onLoggedIn = vi.fn()
    login.mockResolvedValue({ user: { id: 1, username: 'test' } })
    renderLogin({ onLoggedIn })

    fireEvent.change(screen.getByPlaceholderText('用户名'), { target: { value: 'testuser' } })
    fireEvent.change(screen.getByPlaceholderText('密码'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: '进入' }))

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('testuser', 'password123')
      expect(onLoggedIn).toHaveBeenCalled()
    })
  })

  it('shows error toast on login failure', async () => {
    const { Toast } = await import('antd-mobile')
    login.mockRejectedValue({ response: { data: { error: '用户不存在' } } })
    renderLogin()

    fireEvent.change(screen.getByPlaceholderText('用户名'), { target: { value: 'testuser' } })
    fireEvent.change(screen.getByPlaceholderText('密码'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: '进入' }))

    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining('用户不存在'),
      }))
    })
  })
})
