import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock api.js
vi.mock('../../src/services/api.js', () => ({
  getStudyLogs: vi.fn(),
  generateReport: vi.fn(),
}))

// Mock antd-mobile
vi.mock('antd-mobile', async () => {
  const actual = await vi.importActual('antd-mobile')
  return {
    ...actual,
    Toast: { show: vi.fn() },
    Dialog: { alert: vi.fn() },
  }
})

// Mock utils
vi.mock('../../src/utils/habit.js', () => ({
  loadWeeklyGoal: vi.fn(() => 600),
}))
vi.mock('../../src/utils/storage.js', () => ({
  loadAiConfig: vi.fn(() => ({})),
}))
vi.mock('../../src/components/ShareCard.jsx', () => ({
  default: () => null,
}))

import Stats from '../../src/pages/Stats.jsx'
import { getStudyLogs } from '../../src/services/api.js'

function renderStats(props = {}) {
  return render(
    <MemoryRouter>
      <Stats user={{ id: 1, username: 'test' }} syncTick={0} {...props} />
    </MemoryRouter>
  )
}

describe('Stats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders streak card', async () => {
    getStudyLogs.mockResolvedValue([
      { date: new Date().toISOString().slice(0, 10), duration: 120 },
    ])
    renderStats()
    expect(screen.getByText('天连续打卡')).toBeInTheDocument()
  })

  it('renders week overview section', async () => {
    getStudyLogs.mockResolvedValue([])
    renderStats()
    expect(screen.getByText('本周学习')).toBeInTheDocument()
  })

  it('renders month summary section', async () => {
    getStudyLogs.mockResolvedValue([])
    renderStats()
    expect(screen.getByText('本月概览')).toBeInTheDocument()
  })

  it('renders AI report section', async () => {
    getStudyLogs.mockResolvedValue([])
    renderStats()
    expect(screen.getByText('生成周报')).toBeInTheDocument()
    expect(screen.getByText('生成月报')).toBeInTheDocument()
  })
})
