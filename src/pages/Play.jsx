import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { loadPlayerSession, clearPlayerSession, formatScore, SHAPES } from '../lib/helpers'
import ShapeIcon from '../components/ShapeIcon'

export default function Play() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const playerInfo = useRef(loadPlayerSession())

  const [session, setSession] = useState(null)
  const [question, setQuestion] = useState(null)
  const [options, setOptions] = useState([])
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState(null) // { is_correct, score, correct_option_id }
  const [myTotal, setMyTotal] = useState(0)
  const [rank, setRank] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const loadedQuestionIndex = useRef(null)

  useEffect(() => {
    if (!playerInfo.current || playerInfo.current.sessionId !== sessionId) {
      navigate('/tham-gia')
      return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  async function load() {
    const { data } = await supabase.from('game_sessions').select('*').eq('id', sessionId).single()
    setSession(data)
    const { data: p } = await supabase.from('participants').select('total_score').eq('id', playerInfo.current.participantId).single()
    if (p) setMyTotal(p.total_score)
    setLoading(false)
  }

  useEffect(() => {
    const channel = supabase
      .channel(`play-${sessionId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` }, (payload) => {
        setSession(payload.new)
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [sessionId])

  // Load question content when status enters 'question' for a new index
  useEffect(() => {
    if (!session) return
    if (session.status === 'question' && loadedQuestionIndex.current !== session.current_question_index) {
      loadedQuestionIndex.current = session.current_question_index
      setSubmitted(false)
      setResult(null)
      setError('')
      ;(async () => {
        const { data: q } = await supabase
          .from('session_questions_public')
          .select('*')
          .eq('session_id', sessionId)
          .eq('position', session.current_question_index)
          .single()
        setQuestion(q)
        const { data: opts } = await supabase
          .from('session_options_public')
          .select('*')
          .eq('session_question_id', q.id)
          .order('position', { ascending: true })
        setOptions(opts || [])
      })()
    }
    if (session.status === 'leaderboard' || session.status === 'finished') {
      refreshRank()
    }
  }, [session, sessionId])

  const refreshRank = useCallback(async () => {
    const { data } = await supabase.from('participants').select('id, total_score').eq('session_id', sessionId).order('total_score', { ascending: false })
    if (!data) return
    const idx = data.findIndex((p) => p.id === playerInfo.current.participantId)
    setRank({ position: idx + 1, of: data.length })
    const me = data.find((p) => p.id === playerInfo.current.participantId)
    if (me) setMyTotal(me.total_score)
  }, [sessionId])

  async function submitAnswer(optionId) {
    if (submitted) return
    setSubmitted(true)
    setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('submit_answer', {
        p_participant_id: playerInfo.current.participantId,
        p_session_question_id: question.id,
        p_option_id: optionId,
      })
      if (rpcErr) throw rpcErr
      const row = Array.isArray(data) ? data[0] : data
      setResult(row)
      setMyTotal((t) => t + (row?.score || 0))
    } catch (err) {
      setError('Không gửi được câu trả lời (có thể đã hết giờ). ' + (err.message || ''))
    }
  }

  if (loading || !session) {
    return <div className="app-shell" style={{ alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  }

  return (
    <div className="app-shell">
      <div className="container container--narrow" style={{ padding: '24px 16px 60px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--paper-dim)', fontSize: 13, marginBottom: 14 }}>
          <span>{playerInfo.current.name}</span>
          <span>{formatScore(myTotal)} điểm</span>
        </div>

        {session.status === 'lobby' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 14 }}>
            <div className="spinner" />
            <h2 className="display" style={{ fontSize: 24 }}>Đã vào phòng!</h2>
            <p style={{ color: 'var(--paper-dim)' }}>Đang chờ người tổ chức bắt đầu…</p>
          </div>
        )}

        {session.status === 'countdown' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <h2 className="display" style={{ fontSize: 28 }}>Chuẩn bị…</h2>
          </div>
        )}

        {session.status === 'question' && question && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {!submitted ? (
              <>
                <p style={{ textAlign: 'center', color: 'var(--paper-dim)', marginBottom: 16 }}>Chọn đáp án của bạn</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: 1 }}>
                  {options.map((o, i) => {
                    const shape = SHAPES[i % 4]
                    return (
                      <button
                        key={o.id}
                        onClick={() => submitAnswer(o.id)}
                        style={{
                          background: shape.color, color: 'var(--ink)', border: 'none', borderRadius: 18,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
                          fontWeight: 700, fontSize: 16, minHeight: 110, padding: 14,
                        }}
                      >
                        <ShapeIcon shape={shape.key} size={30} />
                        {o.content}
                      </button>
                    )
                  })}
                </div>
              </>
            ) : !result ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <div className="spinner" />
                <p>Đã ghi nhận câu trả lời, đang chờ…</p>
                {error && <div className="scrim-error">{error}</div>}
              </div>
            ) : (
              <ResultBlock result={result} />
            )}
          </div>
        )}

        {session.status === 'reveal' && (
          submitted && result ? <ResultBlock result={result} /> : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <div>
                <h2 className="display" style={{ fontSize: 26, color: 'var(--paper-dim)' }}>Chưa trả lời</h2>
                <p style={{ color: 'var(--paper-dim)', marginTop: 8 }}>0 điểm cho câu này</p>
              </div>
            </div>
          )
        )}

        {session.status === 'leaderboard' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 10 }}>
            <h2 className="display" style={{ fontSize: 26, color: 'var(--yellow)' }}>
              Hạng {rank?.position ?? '…'}/{rank?.of ?? '…'}
            </h2>
            <p style={{ color: 'var(--paper-dim)' }}>{formatScore(myTotal)} điểm — chờ câu tiếp theo</p>
          </div>
        )}

        {session.status === 'finished' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 12 }}>
            <h2 className="display" style={{ fontSize: 28, color: 'var(--yellow)' }}>Kết thúc trận! 🎉</h2>
            <p style={{ fontSize: 18 }}>
              Bạn đứng thứ {rank?.position ?? '…'}/{rank?.of ?? '…'}, đạt {formatScore(myTotal)} điểm.
            </p>
            <button className="btn btn--primary" onClick={() => { clearPlayerSession(); navigate('/') }}>Về trang chủ</button>
          </div>
        )}
      </div>
    </div>
  )
}

function ResultBlock({ result }) {
  const ok = result?.is_correct
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 10 }}>
      <div
        style={{
          width: 90, height: 90, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: ok ? 'var(--teal)' : 'var(--coral)', fontSize: 42, color: 'var(--ink)',
        }}
      >
        {ok ? '✓' : '✕'}
      </div>
      <h2 className="display" style={{ fontSize: 24 }}>{ok ? 'Chính xác!' : 'Chưa đúng'}</h2>
      <p style={{ color: 'var(--paper-dim)' }}>+{formatScore(result?.score || 0)} điểm</p>
    </div>
  )
}
