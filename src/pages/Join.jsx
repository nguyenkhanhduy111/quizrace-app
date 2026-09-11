import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { savePlayerSession } from '../lib/helpers'

export default function Join() {
  const [params] = useSearchParams()
  const [pin, setPin] = useState(params.get('pin') || '')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (params.get('pin')) setPin(params.get('pin'))
  }, [params])

  async function handleJoin(e) {
    e.preventDefault()
    setError('')
    const cleanPin = pin.trim()
    const cleanName = name.trim()
    if (!/^\d{4,8}$/.test(cleanPin)) { setError('Mã phòng không hợp lệ.'); return }
    if (!cleanName) { setError('Hãy nhập tên hiển thị.'); return }

    setBusy(true)
    try {
      const { data: session, error: sErr } = await supabase
        .from('game_sessions')
        .select('id, status, locked')
        .eq('pin', cleanPin)
        .maybeSingle()

      if (sErr || !session) { setError('Không tìm thấy phòng với mã này.'); setBusy(false); return }
      if (session.locked) { setError('Phòng đã bị khóa, không nhận thêm người chơi.'); setBusy(false); return }
      if (session.status !== 'lobby') { setError('Trận đã bắt đầu, bạn không thể tham gia lúc này.'); setBusy(false); return }

      let finalName = cleanName
      let participant = null
      for (let attempt = 0; attempt < 5 && !participant; attempt++) {
        const { data, error: pErr } = await supabase
          .from('participants')
          .insert({ session_id: session.id, name: finalName })
          .select()
          .single()
        if (!pErr) {
          participant = data
        } else if (pErr.code === '23505') {
          finalName = `${cleanName}${Math.floor(Math.random() * 90 + 10)}`
        } else {
          throw pErr
        }
      }
      if (!participant) throw new Error('Tên đã được dùng, hãy thử tên khác.')

      savePlayerSession({ sessionId: session.id, participantId: participant.id, name: finalName, pin: cleanPin })
      navigate(`/choi/${session.id}`)
    } catch (err) {
      setError(err.message || 'Không thể tham gia, thử lại nhé.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell" style={{ justifyContent: 'center' }}>
      <div className="container container--narrow" style={{ padding: '60px 20px' }}>
        <h1 className="display" style={{ textAlign: 'center', fontSize: 30, color: 'var(--yellow)', marginBottom: 28 }}>
          Tham gia trò chơi
        </h1>
        <form onSubmit={handleJoin} className="card">
          <div className="field">
            <label htmlFor="pin">Mã phòng</label>
            <input
              id="pin"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              maxLength={8}
              style={{ textAlign: 'center', fontSize: 22, letterSpacing: 3, fontFamily: 'var(--font-display)' }}
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="name">Tên hiển thị</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="VD: Minh Anh" />
          </div>
          {error && <div className="scrim-error" style={{ marginBottom: 16 }}>{error}</div>}
          <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
            {busy ? 'Đang vào phòng…' : 'Tham gia'}
          </button>
        </form>
      </div>
    </div>
  )
}
