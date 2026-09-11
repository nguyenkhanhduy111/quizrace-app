import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import HostNav from '../components/HostNav'

export default function QuizLibrary() {
  const { user } = useAuth()
  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('quizzes')
      .select('id, title, description, status, created_at, questions(count)')
      .order('created_at', { ascending: false })
    if (!error) setQuizzes(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function createQuiz() {
    setCreating(true)
    const { data, error } = await supabase
      .from('quizzes')
      .insert({ owner: user.id, title: 'Bộ câu hỏi chưa đặt tên' })
      .select()
      .single()
    setCreating(false)
    if (!error) navigate(`/host/bo-cau-hoi/${data.id}`)
  }

  async function removeQuiz(id) {
    if (!confirm('Xóa bộ câu hỏi này? Không thể hoàn tác.')) return
    await supabase.from('quizzes').delete().eq('id', id)
    load()
  }

  return (
    <div className="app-shell">
      <HostNav />
      <div className="container" style={{ padding: '40px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <h1 className="display" style={{ fontSize: 30 }}>Thư viện câu hỏi</h1>
          <button className="btn btn--primary" onClick={createQuiz} disabled={creating}>
            {creating ? 'Đang tạo…' : '+ Bộ câu hỏi mới'}
          </button>
        </div>

        {loading ? (
          <div className="spinner" />
        ) : quizzes.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--paper-dim)' }}>
            Chưa có bộ câu hỏi nào. Nhấn “+ Bộ câu hỏi mới” để bắt đầu.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 18 }}>
            {quizzes.map((q) => (
              <div key={q.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3 style={{ fontSize: 19 }}>{q.title}</h3>
                  <span
                    style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                      background: q.status === 'ready' ? 'rgba(47,230,180,0.18)' : 'rgba(255,201,60,0.18)',
                      color: q.status === 'ready' ? 'var(--teal)' : 'var(--yellow)',
                    }}
                  >
                    {q.status === 'ready' ? 'Sẵn sàng' : 'Bản nháp'}
                  </span>
                </div>
                <p style={{ color: 'var(--paper-dim)', fontSize: 14, minHeight: 20 }}>
                  {q.description || 'Chưa có mô tả'}
                </p>
                <p style={{ fontSize: 13, color: 'var(--paper-dim)' }}>{q.questions[0]?.count || 0} câu hỏi</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button className="btn btn--ghost btn--sm" onClick={() => navigate(`/host/bo-cau-hoi/${q.id}`)}>
                    Chỉnh sửa
                  </button>
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={() => navigate(`/host/to-chuc/${q.id}`)}
                  >
                    Tổ chức trò chơi
                  </button>
                  <button
                    className="btn btn--sm"
                    style={{ background: 'transparent', color: 'var(--coral)', marginLeft: 'auto' }}
                    onClick={() => removeQuiz(q.id)}
                  >
                    Xóa
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
