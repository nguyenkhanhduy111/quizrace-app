import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { generatePin, formatScore, SHAPES } from '../lib/helpers'
import ShapeIcon from '../components/ShapeIcon'
import HostNav from '../components/HostNav'

export default function HostSession() {
  const { quizId } = useParams()
  const navigate = useNavigate()

  const [phase, setPhase] = useState('creating') // creating | error | ready
  const [errorMsg, setErrorMsg] = useState('')
  const [session, setSession] = useState(null)
  const [sessionQuestions, setSessionQuestions] = useState([])
  const [participants, setParticipants] = useState([])
  const [answers, setAnswers] = useState([])
  const [countdown, setCountdown] = useState(3)

  const createdRef = useRef(false)

  // -------- Create the session (snapshot quiz -> session_questions/options) --------
  useEffect(() => {
    if (createdRef.current) return
    createdRef.current = true
    ;(async () => {
      try {
        const pin = generatePin()
        const { data: sessionId, error } = await supabase.rpc('create_session', { p_quiz_id: quizId, p_pin: pin })
        if (error) throw error

        const { data: sessRow } = await supabase.from('game_sessions').select('*').eq('id', sessionId).single()
        const { data: sqs } = await supabase
          .from('session_questions')
          .select('*, session_options(*)')
          .eq('session_id', sessionId)
          .order('position', { ascending: true })

        setSession(sessRow)
        setSessionQuestions((sqs || []).map((q) => ({ ...q, session_options: (q.session_options || []).sort((a, b) => a.position - b.position) })))
        setPhase('ready')
      } catch (e) {
        setErrorMsg(e.message || 'Không thể tạo phòng.')
        setPhase('error')
      }
    })()
  }, [quizId])

  // -------- Realtime subscriptions --------
  useEffect(() => {
    if (!session?.id) return

    const channel = supabase
      .channel(`host-session-${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `session_id=eq.${session.id}` }, () => {
        refreshParticipants()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers', filter: `session_id=eq.${session.id}` }, () => {
        refreshAnswers()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${session.id}` }, (payload) => {
        setSession(payload.new)
      })
      .subscribe()

    refreshParticipants()

    return () => supabase.removeChannel(channel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id])

  const refreshParticipants = useCallback(async () => {
    if (!session?.id) return
    const { data } = await supabase.from('participants').select('*').eq('session_id', session.id).order('total_score', { ascending: false })
    setParticipants(data || [])
  }, [session?.id])

  const refreshAnswers = useCallback(async () => {
    if (!session?.id) return
    const { data } = await supabase.from('answers').select('*').eq('session_id', session.id)
    setAnswers(data || [])
  }, [session?.id])

  async function patchSession(fields) {
    const { data, error } = await supabase.from('game_sessions').update(fields).eq('id', session.id).select().single()
    if (!error) setSession(data)
  }

  // -------- Flow controls --------
  const currentQuestion = sessionQuestions[session?.current_question_index] ?? null

  function startGame() {
    setCountdown(3)
    patchSession({ status: 'countdown' })
  }

  useEffect(() => {
    if (session?.status !== 'countdown') return
    if (countdown <= 0) {
      openQuestion(0)
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status, countdown])

  function openQuestion(index) {
    setAnswers([])
    patchSession({
      status: 'question',
      current_question_index: index,
      current_question_started_at: new Date().toISOString(),
    })
  }

  function revealAnswer() {
    patchSession({ status: 'reveal' })
  }

  function showLeaderboard() {
    patchSession({ status: 'leaderboard' })
    refreshParticipants()
  }

  function nextQuestion() {
    const nextIndex = (session.current_question_index ?? -1) + 1
    if (nextIndex >= sessionQuestions.length) {
      patchSession({ status: 'finished' })
      refreshParticipants()
    } else {
      openQuestion(nextIndex)
    }
  }

  async function removeParticipant(id) {
    await supabase.from('participants').delete().eq('id', id)
  }

  async function toggleLock() {
    await patchSession({ locked: !session.locked })
  }

  // -------- Auto-close question when timer runs out --------
  const [remaining, setRemaining] = useState(null)
  useEffect(() => {
    if (session?.status !== 'question' || !currentQuestion || !session.current_question_started_at) {
      setRemaining(null)
      return
    }
    const started = new Date(session.current_question_started_at).getTime()
    const limitMs = currentQuestion.time_limit * 1000
    const tick = () => {
      const left = Math.max(0, limitMs - (Date.now() - started))
      setRemaining(left)
      if (left <= 0) revealAnswer()
    }
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status, session?.current_question_started_at, currentQuestion?.id])

  const answeredCount = answers.filter((a) => a.session_question_id === currentQuestion?.id).length

  if (phase === 'creating') {
    return (
      <div className="app-shell" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    )
  }
  if (phase === 'error') {
    return (
      <div className="app-shell" style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div className="card">{errorMsg}</div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <HostNav />
      <div className="container" style={{ padding: '28px 20px 80px' }}>
        {session.status === 'lobby' && (
          <LobbyView
            session={session}
            participants={participants}
            onStart={startGame}
            onRemove={removeParticipant}
            onToggleLock={toggleLock}
          />
        )}

        {session.status === 'countdown' && (
          <div style={{ textAlign: 'center', padding: '100px 0' }}>
            <p style={{ color: 'var(--paper-dim)', fontSize: 18, marginBottom: 12 }}>Bắt đầu sau…</p>
            <div className="display" style={{ fontSize: 120, color: 'var(--yellow)' }}>{countdown > 0 ? countdown : 'Đi!'}</div>
          </div>
        )}

        {session.status === 'question' && currentQuestion && (
          <QuestionView
            question={currentQuestion}
            index={session.current_question_index}
            total={sessionQuestions.length}
            remainingMs={remaining}
            answeredCount={answeredCount}
            totalPlayers={participants.length}
            onCloseNow={revealAnswer}
          />
        )}

        {session.status === 'reveal' && currentQuestion && (
          <RevealView
            question={currentQuestion}
            answers={answers.filter((a) => a.session_question_id === currentQuestion.id)}
            totalPlayers={participants.length}
            onContinue={showLeaderboard}
          />
        )}

        {session.status === 'leaderboard' && (
          <LeaderboardView
            participants={participants}
            index={session.current_question_index}
            total={sessionQuestions.length}
            onNext={nextQuestion}
          />
        )}

        {session.status === 'finished' && (
          <FinishedView
            participants={participants}
            quizId={quizId}
            onBack={() => navigate('/host/bo-cau-hoi')}
          />
        )}
      </div>
    </div>
  )
}

function LobbyView({ session, participants, onStart, onRemove, onToggleLock }) {
  const joinUrl = useMemo(() => `${window.location.origin}/tham-gia?pin=${session.pin}`, [session.pin])
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&color=245-243-255&bgcolor=27-27-82&data=${encodeURIComponent(joinUrl)}`

  return (
    <div>
      <div className="card" style={{ textAlign: 'center', marginBottom: 24 }}>
        <p style={{ color: 'var(--paper-dim)', marginBottom: 8 }}>Vào {window.location.host} và nhập mã, hoặc quét QR</p>
        <div className="pin-display">{session.pin}</div>
        <img src={qrUrl} alt="Mã QR tham gia phòng" style={{ marginTop: 16, borderRadius: 16 }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ fontSize: 20 }}>Người chơi ({participants.length})</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn--ghost btn--sm" onClick={onToggleLock}>
            {session.locked ? 'Mở khóa phòng' : 'Khóa phòng'}
          </button>
          <button className="btn btn--primary" onClick={onStart} disabled={participants.length === 0}>
            Bắt đầu
          </button>
        </div>
      </div>

      {participants.length === 0 ? (
        <p style={{ color: 'var(--paper-dim)' }}>Đang chờ người chơi tham gia…</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {participants.map((p) => (
            <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--ink-panel)', borderRadius: 999, padding: '8px 8px 8px 16px' }}>
              {p.name}
              <button onClick={() => onRemove(p.id)} style={{ background: 'var(--ink-panel-raised)', border: 'none', color: 'var(--coral)', borderRadius: '50%', width: 22, height: 22 }}>✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function QuestionView({ question, index, total, remainingMs, answeredCount, totalPlayers, onCloseNow }) {
  const secondsLeft = remainingMs != null ? Math.ceil(remainingMs / 1000) : question.time_limit
  const pct = remainingMs != null ? Math.max(0, Math.min(100, (remainingMs / (question.time_limit * 1000)) * 100)) : 100

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--paper-dim)', fontSize: 14, marginBottom: 10 }}>
        <span>Câu {index + 1}/{total}</span>
        <span>{answeredCount}/{totalPlayers} đã trả lời</span>
      </div>

      <div className="card" style={{ textAlign: 'center' }}>
        {question.image_url && (
          <img src={question.image_url} alt="" style={{ maxHeight: 240, borderRadius: 16, marginBottom: 16 }} />
        )}
        <h2 style={{ fontSize: 'clamp(22px, 4vw, 32px)' }}>{question.content}</h2>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 42, color: 'var(--yellow)', marginTop: 14 }}>{secondsLeft}s</div>
        <div style={{ height: 8, background: 'var(--ink-panel-raised)', borderRadius: 999, marginTop: 10, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--teal)', transition: 'width 0.2s linear' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 18 }}>
        {question.session_options.map((o, i) => {
          const shape = SHAPES[i % 4]
          return (
            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: shape.color, color: 'var(--ink)', borderRadius: 16, padding: '16px 18px', fontWeight: 600 }}>
              <ShapeIcon shape={shape.key} />
              {o.content}
            </div>
          )
        })}
      </div>

      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <button className="btn btn--ghost" onClick={onCloseNow}>Đóng câu hỏi ngay</button>
      </div>
    </div>
  )
}

function RevealView({ question, answers, totalPlayers, onContinue }) {
  const counts = question.session_options.map((o) => answers.filter((a) => a.option_id === o.id).length)
  const noAnswer = totalPlayers - answers.length
  const max = Math.max(1, ...counts, noAnswer)

  return (
    <div>
      <div className="card">
        <h2 style={{ fontSize: 'clamp(20px, 3.6vw, 28px)', marginBottom: 18 }}>{question.content}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {question.session_options.map((o, i) => {
            const shape = SHAPES[i % 4]
            const count = counts[i]
            return (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 28 }}><ShapeIcon shape={shape.key} size={22} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
                    <span style={{ fontWeight: o.is_correct ? 700 : 400, color: o.is_correct ? 'var(--teal)' : 'var(--paper)' }}>
                      {o.content} {o.is_correct ? '✓' : ''}
                    </span>
                    <span style={{ color: 'var(--paper-dim)' }}>{count}</span>
                  </div>
                  <div style={{ height: 10, borderRadius: 999, background: 'var(--ink-panel-raised)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(count / max) * 100}%`, background: o.is_correct ? 'var(--teal)' : shape.color }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {noAnswer > 0 && <p style={{ marginTop: 12, color: 'var(--paper-dim)', fontSize: 13 }}>{noAnswer} người chưa trả lời</p>}
        {question.explanation && (
          <p style={{ marginTop: 18, background: 'var(--ink-panel-raised)', padding: 14, borderRadius: 12, color: 'var(--paper-dim)' }}>
            {question.explanation}
          </p>
        )}
      </div>
      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <button className="btn btn--primary" onClick={onContinue}>Xem bảng xếp hạng</button>
      </div>
    </div>
  )
}

function LeaderboardView({ participants, index, total, onNext }) {
  const top = participants.slice(0, 5)
  return (
    <div>
      <h2 className="display" style={{ textAlign: 'center', fontSize: 28, marginBottom: 22, color: 'var(--yellow)' }}>Bảng xếp hạng</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {top.map((p, i) => (
          <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px' }}>
            <span className="display" style={{ fontSize: 22, color: 'var(--paper-dim)', width: 28 }}>{i + 1}</span>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 17 }}>{p.name}</span>
            <span className="display" style={{ color: 'var(--teal)', fontSize: 18 }}>{formatScore(p.total_score)}</span>
          </div>
        ))}
      </div>
      <div style={{ textAlign: 'center', marginTop: 26 }}>
        <button className="btn btn--primary" onClick={onNext}>
          {index + 1 >= total ? 'Xem kết quả chung cuộc' : 'Câu tiếp theo'}
        </button>
      </div>
    </div>
  )
}

function FinishedView({ participants, quizId, onBack }) {
  const podium = participants.slice(0, 3)
  return (
    <div>
      <h2 className="display" style={{ textAlign: 'center', fontSize: 30, marginBottom: 24, color: 'var(--yellow)' }}>Kết quả chung cuộc 🎉</h2>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, alignItems: 'flex-end', marginBottom: 32, flexWrap: 'wrap' }}>
        {[podium[1], podium[0], podium[2]].map((p, slot) =>
          p ? (
            <div key={p.id} className="card" style={{ textAlign: 'center', width: 140, order: slot === 1 ? 0 : slot === 0 ? -1 : 1, paddingTop: slot === 1 ? 36 : 20 }}>
              <div className="display" style={{ fontSize: 26, color: 'var(--yellow)' }}>{slot === 1 ? '🥇' : slot === 0 ? '🥈' : '🥉'}</div>
              <p style={{ fontWeight: 700, marginTop: 6 }}>{p.name}</p>
              <p style={{ color: 'var(--teal)' }}>{formatScore(p.total_score)}</p>
            </div>
          ) : null
        )}
      </div>

      <h3 style={{ fontSize: 18, marginBottom: 12 }}>Toàn bộ xếp hạng</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 30 }}>
        {participants.map((p, i) => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', background: 'var(--ink-panel)', borderRadius: 12 }}>
            <span>{i + 1}. {p.name}</span>
            <span style={{ color: 'var(--paper-dim)' }}>{formatScore(p.total_score)} điểm</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <Link to={`/host/to-chuc/${quizId}`} className="btn btn--primary">Tổ chức lại</Link>
        <button className="btn btn--ghost" onClick={onBack}>Về thư viện</button>
      </div>
    </div>
  )
}
