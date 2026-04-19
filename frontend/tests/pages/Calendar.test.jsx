import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock api.js
vi.mock('../../src/services/api.js', () => ({
  getStudyLogs: vi.fn(),
  getTaskOccurrences: vi.fn(),
}))

// Mock antd-mobile
vi.mock('antd-mobile', async () => {
  const actual = await vi.importActual('antd-mobile')
  return {
    ...actual,
    Toast: { show: vi.fn() },
  }
})

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ChevronLeft: () => <span>‹</span>,
  ChevronRight: () => <span>›</span>,
}))

import Calendar from '../../src/pages/Calendar.jsx'
import { getStudyLogs } from '../../src/services/api.js'

function renderCalendar(props = {}) {
  return render(
    <MemoryRouter>
      <Calendar user={{ id: 1, username: 'test' }} syncTick={0} {...props} />
    </MemoryRouter>
  )
}

describe('Calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders weekday headers', async () => {
    getStudyLogs.mockResolvedValue([])
    renderCalendar()
    await waitFor(() => {
      expect(screen.getByText('Sun')).toBeInTheDocument()
      expect(screen.getByText('Mon')).toBeInTheDocument()
      expect(screen.getByText('Sat')).toBeInTheDocument()
    })
  })

  it('renders navigation controls', async () => {
    getStudyLogs.mockResolvedValue([])
    renderCalendar()
    // ChevronLeft renders ‹, ChevronRight renders ›
    expect(screen.getByText('‹')).toBeInTheDocument()
    expect(screen.getByText('›')).toBeInTheDocument()
  })
})
