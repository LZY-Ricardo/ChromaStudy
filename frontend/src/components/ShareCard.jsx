import { forwardRef, useEffect, useRef, useState } from 'react'
import { Button, Dialog } from 'antd-mobile'
import html2canvas from 'html2canvas'
import dayjs from 'dayjs'

// 激励语库
const MOTIVATION_QUOTES = [
  '坚持就是胜利！',
  '每一步都是进步！',
  '积跬步，至千里！',
  '今天也要加油！',
  '专注是最好的态度！',
  '学习改变未来！',
  '保持热情，持续前进！',
  '小步快跑，日积月累！',
]

// 获取随机激励语
const getRandomQuote = () => {
  return MOTIVATION_QUOTES[Math.floor(Math.random() * MOTIVATION_QUOTES.length)]
}

// 格式化时长
const formatDuration = (minutes) => {
  if (!minutes || minutes <= 0) return '0分钟'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0) {
    return `${hours}小时${mins}分钟`
  }
  return `${mins}分钟`
}

// 截断文本
const truncateText = (text, maxLength) => {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

// 卡片风格配置
const CARD_STYLES = [
  {
    id: 'gradient-purple',
    name: '紫霞',
    type: 'preset',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    textColor: '#ffffff',
    cardBg: 'rgba(255, 255, 255, 0.15)',
    quoteBg: 'rgba(255, 255, 255, 0.2)',
    shadow: 'rgba(102, 126, 234, 0.3)',
  },
  {
    id: 'gradient-ocean',
    name: '海蓝',
    type: 'preset',
    background: 'linear-gradient(135deg, #667eea 0%, #06b6d4 100%)',
    textColor: '#ffffff',
    cardBg: 'rgba(255, 255, 255, 0.15)',
    quoteBg: 'rgba(255, 255, 255, 0.2)',
    shadow: 'rgba(6, 182, 212, 0.3)',
  },
  {
    id: 'gradient-sunset',
    name: '落日',
    type: 'preset',
    background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    textColor: '#ffffff',
    cardBg: 'rgba(255, 255, 255, 0.15)',
    quoteBg: 'rgba(255, 255, 255, 0.2)',
    shadow: 'rgba(245, 87, 108, 0.3)',
  },
  {
    id: 'gradient-forest',
    name: '森绿',
    type: 'preset',
    background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
    textColor: '#ffffff',
    cardBg: 'rgba(255, 255, 255, 0.15)',
    quoteBg: 'rgba(255, 255, 255, 0.2)',
    shadow: 'rgba(56, 239, 125, 0.3)',
  },
  {
    id: 'gradient-midnight',
    name: '暗夜',
    type: 'preset',
    background: 'linear-gradient(135deg, #232526 0%, #414345 100%)',
    textColor: '#ffffff',
    cardBg: 'rgba(255, 255, 255, 0.1)',
    quoteBg: 'rgba(255, 255, 255, 0.15)',
    shadow: 'rgba(0, 0, 0, 0.4)',
  },
  {
    id: 'solid-minimal',
    name: '简约白',
    type: 'preset',
    background: '#ffffff',
    textColor: '#1e293b',
    cardBg: '#f1f5f9',
    quoteBg: '#f8fafc',
    shadow: 'rgba(0, 0, 0, 0.1)',
    border: '#e2e8f0',
  },
  {
    id: 'solid-dark',
    name: '深邃黑',
    type: 'preset',
    background: '#0f172a',
    textColor: '#f1f5f9',
    cardBg: 'rgba(255, 255, 255, 0.08)',
    quoteBg: 'rgba(255, 255, 255, 0.12)',
    shadow: 'rgba(0, 0, 0, 0.5)',
  },
  {
    id: 'warm-beige',
    name: '暖米',
    type: 'preset',
    background: 'linear-gradient(135deg, #f5f7fa 0%, #e4d5c2 100%)',
    textColor: '#5c4b37',
    cardBg: 'rgba(255, 255, 255, 0.5)',
    quoteBg: 'rgba(255, 255, 255, 0.7)',
    shadow: 'rgba(92, 75, 55, 0.15)',
  },
]

// 预设颜色选项（用于自定义）
const COLOR_OPTIONS = [
  { name: '紫', start: '#667eea', end: '#764ba2' },
  { name: '蓝', start: '#667eea', end: '#06b6d4' },
  { name: '粉', start: '#f093fb', end: '#f5576c' },
  { name: '绿', start: '#11998e', end: '#38ef7d' },
  { name: '橙', start: '#ff9a9e', end: '#fecfef' },
  { name: '红', start: '#ff6b6b', end: '#ee5a24' },
  { name: '金', start: '#f7971e', end: '#ffd200' },
  { name: '青', start: '#00c6fb', end: '#005bea' },
]

// 卡片内容组件（用于截图）
const CardContent = forwardRef(({ date, duration, streak, completedTasks, content, quote, style }, ref) => {
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const dateStr = dayjs(date).format('YYYY年M月D日')
  const weekDay = weekDays[dayjs(date).day()]

  const cardStyle = style || CARD_STYLES[0]
  const isLight = cardStyle.id === 'solid-minimal' || cardStyle.id === 'warm-beige'

  return (
    <div ref={ref} className="share-card-wrapper">
      <div
        className="share-card"
        style={{
          background: cardStyle.background,
          color: cardStyle.textColor,
          boxShadow: `0 20px 60px ${cardStyle.shadow}`,
          border: cardStyle.border ? `1px solid ${cardStyle.border}` : 'none',
        }}
      >
        {/* 头部 */}
        <div className="share-card-header">
          <h1 className="share-card-title">ChromaStudy</h1>
          <p className="share-card-slogan">Focus. Log. Level up.</p>
        </div>

        {/* 日期 */}
        <div
          className="share-card-date"
          style={{
            background: cardStyle.cardBg,
            border: isLight ? `1px solid ${cardStyle.border || '#e2e8f0'}` : 'none',
          }}
        >
          📅 {dateStr} {weekDay}
        </div>

        {/* 学习时长 */}
        <div
          className="share-card-metric"
          style={{
            background: cardStyle.cardBg,
            border: isLight ? `1px solid ${cardStyle.border || '#e2e8f0'}` : 'none',
          }}
        >
          <span className="share-card-icon">✨</span>
          <span className="share-card-label">今日学习</span>
          <span className="share-card-value">{formatDuration(duration)}</span>
        </div>

        {/* 连续打卡 */}
        <div
          className="share-card-metric"
          style={{
            background: cardStyle.cardBg,
            border: isLight ? `1px solid ${cardStyle.border || '#e2e8f0'}` : 'none',
          }}
        >
          <span className="share-card-icon">🔥</span>
          <span className="share-card-label">已连续打卡</span>
          <span className="share-card-value">{streak} 天</span>
        </div>

        {/* 完成任务 */}
        {completedTasks && completedTasks.length > 0 && (
          <div
            className="share-card-section"
            style={{
              background: cardStyle.cardBg,
              border: isLight ? `1px solid ${cardStyle.border || '#e2e8f0'}` : 'none',
            }}
          >
            <div className="share-card-section-title">
              ✓ 完成任务 {completedTasks.length} 项
            </div>
            <div className="share-card-task-list">
              {completedTasks.slice(0, 3).map((task, index) => (
                <div key={index} className="share-card-task">
                  {task}
                </div>
              ))}
              {completedTasks.length > 3 && (
                <div className="share-card-task share-card-task-more">
                  还有 {completedTasks.length - 3} 项...
                </div>
              )}
            </div>
          </div>
        )}

        {/* 今日笔记 */}
        {content && (
          <div
            className="share-card-section"
            style={{
              background: cardStyle.cardBg,
              border: isLight ? `1px solid ${cardStyle.border || '#e2e8f0'}` : 'none',
            }}
          >
            <div className="share-card-section-title">📝 今日笔记</div>
            <div className="share-card-content">
              "{truncateText(content, 60)}"
            </div>
          </div>
        )}

        {/* 激励语 */}
        <div
          className="share-card-quote"
          style={{
            background: cardStyle.quoteBg,
            border: isLight ? `1px solid ${cardStyle.border || '#e2e8f0'}` : 'none',
          }}
        >
          💪 {quote || getRandomQuote()}
        </div>

        {/* 底部 */}
        <div className="share-card-footer">
          <div className="share-card-footer-line" style={{ background: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.3)' }} />
          <div className="share-card-footer-text">
            <span className="share-card-footer-name">ChromaStudy</span>
            <span className="share-card-footer-slogan">Focus. Log. Level up.</span>
          </div>
        </div>
      </div>

      <style>{`
        .share-card-wrapper {
          padding: 20px;
          background: #f8fafc;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 400px;
        }
        .share-card {
          width: 340px;
          border-radius: 24px;
          padding: 28px 24px;
          line-height: 1.5;
        }
        .share-card-header {
          text-align: center;
          margin-bottom: 24px;
        }
        .share-card-title {
          font-size: 26px;
          font-weight: 700;
          margin: 0;
          letter-spacing: 2px;
          line-height: 1.3;
        }
        .share-card-slogan {
          font-size: 11px;
          margin: 6px 0 0 0;
          opacity: 0.9;
          letter-spacing: 3px;
          text-transform: uppercase;
          line-height: 1.4;
        }
        .share-card-date {
          text-align: center;
          font-size: 14px;
          padding: 14px 16px;
          border-radius: 14px;
          margin-bottom: 18px;
          line-height: 1.5;
          letter-spacing: 0.5px;
        }
        .share-card-metric {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          border-radius: 14px;
          margin-bottom: 12px;
        }
        .share-card-icon {
          font-size: 20px;
          flex-shrink: 0;
        }
        .share-card-label {
          flex: 1;
          font-size: 14px;
          letter-spacing: 0.5px;
        }
        .share-card-value {
          font-size: 17px;
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        .share-card-section {
          margin-top: 18px;
          padding: 16px;
          border-radius: 14px;
        }
        .share-card-section-title {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 12px;
          letter-spacing: 0.5px;
          line-height: 1.5;
        }
        .share-card-task-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .share-card-task {
          font-size: 13px;
          padding-left: 16px;
          position: relative;
          opacity: 0.95;
          line-height: 1.6;
          letter-spacing: 0.3px;
        }
        .share-card-task::before {
          content: '·';
          position: absolute;
          left: 0;
          font-size: 16px;
        }
        .share-card-task-more {
          opacity: 0.7;
          font-style: italic;
        }
        .share-card-content {
          font-size: 13px;
          line-height: 1.8;
          opacity: 0.95;
          font-style: italic;
          letter-spacing: 0.3px;
        }
        .share-card-quote {
          text-align: center;
          font-size: 15px;
          font-weight: 600;
          margin-top: 18px;
          padding: 16px 14px;
          border-radius: 14px;
          line-height: 1.6;
          letter-spacing: 0.5px;
        }
        .share-card-footer {
          margin-top: 24px;
        }
        .share-card-footer-line {
          height: 1px;
          margin-bottom: 14px;
        }
        .share-card-footer-text {
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .share-card-footer-name {
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 1px;
        }
        .share-card-footer-slogan {
          font-size: 10px;
          opacity: 0.8;
          letter-spacing: 2px;
          text-transform: uppercase;
        }
      `}</style>
    </div>
  )
})

CardContent.displayName = 'CardContent'

// 分享弹窗组件
function ShareDialog({ open, onClose, data }) {
  const cardRef = useRef(null)
  const [image, setImage] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [selectedStyle, setSelectedStyle] = useState(CARD_STYLES[0])
  const [showCustom, setShowCustom] = useState(false)
  const [customColors, setCustomColors] = useState({ start: '#667eea', end: '#764ba2' })

  useEffect(() => {
    if (open && data) {
      setImage(null) // 重置图片
    }
  }, [open, selectedStyle, customColors, data])

  useEffect(() => {
    // 当风格改变时重新生成图片
    if (open && data && !generating) {
      generateImage()
    }
  }, [selectedStyle, customColors, open])

  const generateImage = async () => {
    setGenerating(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (!cardRef.current) return

      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
        logging: false,
        useCORS: true,
      })

      setImage(canvas.toDataURL('image/png'))
    } catch (error) {
      console.error('生成图片失败:', error)
    } finally {
      setGenerating(false)
    }
  }

  const downloadImage = () => {
    if (!image) return
    const link = document.createElement('a')
    link.download = `chromastudy-${dayjs().format('YYYY-MM-DD')}.png`
    link.href = image
    link.click()
  }

  const copyImage = async () => {
    if (!image) return
    try {
      const blob = await (await fetch(image)).blob()
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ])
      Dialog.alert({ content: '已复制到剪贴板' })
    } catch (error) {
      console.error('复制失败:', error)
      Dialog.alert({ content: '复制失败，请尝试保存图片' })
    }
  }

  // 获取当前使用的风格
  const getCurrentStyle = () => {
    if (selectedStyle.id === 'custom') {
      return {
        ...selectedStyle,
        background: `linear-gradient(135deg, ${customColors.start} 0%, ${customColors.end} 100%)`,
      }
    }
    return selectedStyle
  }

  return (
    <Dialog
      visible={open}
      title="分享今日成就"
      closeOnMaskClick
      onClose={onClose}
      content={
        <div className="share-dialog-content">
          {/* 风格选择器 */}
          <div className="share-style-selector">
            <div className="share-style-tabs">
              <button
                className={`share-style-tab ${!showCustom ? 'active' : ''}`}
                onClick={() => { setShowCustom(false); setSelectedStyle(CARD_STYLES[0]) }}
              >
                预设风格
              </button>
              <button
                className={`share-style-tab ${showCustom ? 'active' : ''}`}
                onClick={() => {
                  setShowCustom(true)
                  setSelectedStyle({
                    id: 'custom',
                    name: '自定义',
                    type: 'custom',
                    background: `linear-gradient(135deg, ${customColors.start} 0%, ${customColors.end} 100%)`,
                    textColor: '#ffffff',
                    cardBg: 'rgba(255, 255, 255, 0.15)',
                    quoteBg: 'rgba(255, 255, 255, 0.2)',
                    shadow: 'rgba(0, 0, 0, 0.2)',
                  })
                }}
              >
                自定义
              </button>
            </div>

            {!showCustom ? (
              <div className="share-style-grid">
                {CARD_STYLES.map((style) => (
                  <button
                    key={style.id}
                    className={`share-style-item ${selectedStyle.id === style.id ? 'active' : ''}`}
                    onClick={() => setSelectedStyle(style)}
                    style={{
                      background: style.background,
                      border: selectedStyle.id === style.id ? '3px solid #667eea' : '2px solid transparent',
                    }}
                  >
                    <span className="share-style-name">{style.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="share-custom-colors">
                <div className="share-color-section">
                  <span className="share-color-label">起始色</span>
                  <div className="share-color-options">
                    {COLOR_OPTIONS.map((color) => (
                      <button
                        key={color.name}
                        className="share-color-btn"
                        style={{ background: color.start }}
                        onClick={() => setCustomColors({ ...customColors, start: color.start })}
                      />
                    ))}
                  </div>
                  <input
                    type="color"
                    value={customColors.start}
                    onChange={(e) => setCustomColors({ ...customColors, start: e.target.value })}
                    className="share-color-picker"
                  />
                </div>
                <div className="share-color-section">
                  <span className="share-color-label">结束色</span>
                  <div className="share-color-options">
                    {COLOR_OPTIONS.map((color) => (
                      <button
                        key={color.name}
                        className="share-color-btn"
                        style={{ background: color.end }}
                        onClick={() => setCustomColors({ ...customColors, end: color.end })}
                      />
                    ))}
                  </div>
                  <input
                    type="color"
                    value={customColors.end}
                    onChange={(e) => setCustomColors({ ...customColors, end: e.target.value })}
                    className="share-color-picker"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 图片预览 */}
          {generating ? (
            <div className="share-dialog-loading">生成中...</div>
          ) : image ? (
            <div className="share-dialog-image-wrapper">
              <img src={image} alt="分享卡片" className="share-dialog-image" />
            </div>
          ) : (
            <div className="share-dialog-loading">加载中...</div>
          )}

          <div className="share-dialog-actions">
            <Button
              block
              color="primary"
              size="large"
              disabled={!image || generating}
              onClick={downloadImage}
            >
              保存图片
            </Button>
            <Button
              block
              color="default"
              size="large"
              disabled={!image || generating}
              onClick={copyImage}
            >
              复制图片
            </Button>
          </div>

          {/* 隐藏的卡片用于截图 */}
          <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
            <CardContent
              ref={cardRef}
              date={data?.date}
              duration={data?.duration}
              streak={data?.streak}
              completedTasks={data?.completedTasks}
              content={data?.content}
              quote={data?.quote}
              style={getCurrentStyle()}
            />
          </div>
        </div>
      }
    />

  )
}

// 导出 hook 和组件
export { ShareDialog, CardContent, getRandomQuote, formatDuration, truncateText, CARD_STYLES }
export default ShareDialog
