export function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

const PLAYER_KEY = 'quizrace_player'

// Lưu thông tin người chơi (participantId, sessionId, name) để khôi phục
// khi trình duyệt bị tải lại giữa trận (mục "Player tải lại trang").
export function savePlayerSession(data) {
  sessionStorage.setItem(PLAYER_KEY, JSON.stringify(data))
}

export function loadPlayerSession() {
  try {
    const raw = sessionStorage.getItem(PLAYER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearPlayerSession() {
  sessionStorage.removeItem(PLAYER_KEY)
}

export const SHAPES = [
  { key: 'triangle', color: 'var(--coral)', label: 'Tam giác' },
  { key: 'diamond', color: 'var(--blue)', label: 'Kim cương' },
  { key: 'circle', color: 'var(--yellow)', label: 'Tròn' },
  { key: 'square', color: 'var(--teal)', label: 'Vuông' },
]

export function formatScore(n) {
  return new Intl.NumberFormat('vi-VN').format(n || 0)
}
