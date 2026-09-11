import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Home() {
  const [pin, setPin] = useState('')
  const navigate = useNavigate()

  function goJoin(e) {
    e.preventDefault()
    const clean = pin.trim()
    navigate(clean ? `/tham-gia?pin=${clean}` : '/tham-gia')
  }

  return (
    <div className="app-shell" style={{ justifyContent: 'center' }}>
      <div className="container container--narrow" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <h1 className="display" style={{ fontSize: 'clamp(38px, 9vw, 64px)', color: 'var(--yellow)' }}>
          QuizRace
        </h1>
        <p style={{ marginTop: 12, color: 'var(--paper-dim)', fontSize: 18 }}>
          Đố vui trực tiếp cho cả lớp, cả phòng, cả team — mở trên điện thoại, chơi cùng lúc.
        </p>

        <form onSubmit={goJoin} className="card" style={{ marginTop: 40 }}>
          <div className="field">
            <label htmlFor="pin">Mã phòng</label>
            <input
              id="pin"
              inputMode="numeric"
              placeholder="583921"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              style={{ textAlign: 'center', fontSize: 24, letterSpacing: 4, fontFamily: 'var(--font-display)' }}
              maxLength={6}
            />
          </div>
          <button className="btn btn--primary btn--block" type="submit">Tham gia trò chơi</button>
        </form>

        <div style={{ marginTop: 28 }}>
          <p style={{ color: 'var(--paper-dim)', marginBottom: 10 }}>Bạn là người tổ chức?</p>
          <a href="/host" className="btn btn--ghost">Đăng nhập Host</a>
        </div>
      </div>
    </div>
  )
}
