import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function HostLogin() {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) throw err
        navigate('/host/bo-cau-hoi')
      } else {
        const { error: err } = await supabase.auth.signUp({ email, password })
        if (err) throw err
        setInfo('Đã tạo tài khoản. Nếu dự án bật xác nhận email, hãy kiểm tra hộp thư trước khi đăng nhập.')
        setMode('login')
      }
    } catch (err) {
      setError(err.message || 'Có lỗi xảy ra, thử lại nhé.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell" style={{ justifyContent: 'center' }}>
      <div className="container container--narrow" style={{ padding: '60px 20px' }}>
        <Link to="/" style={{ color: 'var(--paper-dim)', fontSize: 14 }}>&larr; Trang chủ</Link>
        <h1 className="display" style={{ fontSize: 32, marginTop: 16, marginBottom: 24 }}>
          {mode === 'login' ? 'Đăng nhập Host' : 'Tạo tài khoản Host'}
        </h1>

        <form onSubmit={handleSubmit} className="card">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Mật khẩu</label>
            <input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {error && <div className="scrim-error" style={{ marginBottom: 16 }}>{error}</div>}
          {info && <div className="scrim-error" style={{ marginBottom: 16, borderColor: 'var(--teal)', background: 'rgba(47,230,180,0.12)', color: '#CFFdEA' }}>{info}</div>}

          <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
            {busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
          </button>
        </form>

        <p style={{ marginTop: 20, textAlign: 'center', color: 'var(--paper-dim)' }}>
          {mode === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}{' '}
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 600, padding: 0 }}
          >
            {mode === 'login' ? 'Đăng ký ngay' : 'Đăng nhập'}
          </button>
        </p>
      </div>
    </div>
  )
}
