import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import HostNav from '../components/HostNav'

const TIME_OPTIONS = [10, 20, 30, 60]
const BLANK_OPTION = () => ({ id: `new-${crypto.randomUUID()}`, content: '', is_correct: false, isNew: true })

// --- Nhập câu hỏi hàng loạt từ file CSV (xuất ra từ Excel) ---
// Cột: Cau hoi, Dap an 1, Dap an 2, Dap an 3, Dap an 4, Dap an dung (1-4), Thoi gian (giay), Diem toi da, Giai thich
const CSV_TEMPLATE = [
  ['Cau hoi', 'Dap an 1', 'Dap an 2', 'Dap an 3', 'Dap an 4', 'Dap an dung (1-4)', 'Thoi gian (giay)', 'Diem toi da', 'Giai thich'],
  ['Thu do cua Viet Nam la gi?', 'Ho Chi Minh', 'Da Nang', 'Ha Noi', 'Hue', '3', '20', '1000', 'Ha Noi la thu do tu nam 1010'],
  ['7 x 8 bang bao nhieu?', '54', '56', '58', '64', '2', '10', '500', ''],
]

function csvCell(value) {
  const v = String(value ?? '')
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

function downloadCsvTemplate() {
  const csv = '\uFEFF' + CSV_TEMPLATE.map((row) => row.map(csvCell).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'mau-cau-hoi-quizrace.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Parser CSV đơn giản, hỗ trợ dấu ngoặc kép bao quanh ô có dấu phẩy/xuống dòng
function parseCsvText(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\r') {
      // bỏ qua
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else {
      field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

function nearestTimeOption(value) {
  if (TIME_OPTIONS.includes(value)) return value
  return TIME_OPTIONS.reduce((best, t) => (Math.abs(t - value) < Math.abs(best - value) ? t : best), TIME_OPTIONS[0])
}

function rowsToQuestions(rows, startPosition) {
  // Bỏ qua dòng đầu nếu là header (cột đầu không phải nội dung câu hỏi thật)
  const dataRows = rows[0]?.[0]?.trim().toLowerCase().startsWith('cau hoi') || rows[0]?.[0]?.trim().toLowerCase().startsWith('câu hỏi')
    ? rows.slice(1)
    : rows

  const built = []
  const errors = []
  dataRows.forEach((r, idx) => {
    const lineNo = idx + 2
    const content = (r[0] || '').trim()
    if (!content) { errors.push(`Dòng ${lineNo}: thiếu nội dung câu hỏi, bỏ qua.`); return }

    const rawOptions = [r[1], r[2], r[3], r[4]].map((v) => (v || '').trim())
    const options = rawOptions
      .filter((v) => v !== '')
      .map((v) => ({ id: `new-${crypto.randomUUID()}`, content: v, is_correct: false, isNew: true }))

    if (options.length < 2) { errors.push(`Dòng ${lineNo}: cần ít nhất 2 đáp án, bỏ qua.`); return }

    const correctIdx = parseInt(r[5], 10)
    if (!correctIdx || correctIdx < 1 || correctIdx > options.length) {
      errors.push(`Dòng ${lineNo}: cột "Đáp án đúng" không hợp lệ, bỏ qua.`)
      return
    }
    options[correctIdx - 1].is_correct = true

    const timeVal = parseInt(r[6], 10)
    const time_limit = nearestTimeOption(Number.isFinite(timeVal) ? timeVal : 20)
    const scoreVal = parseInt(r[7], 10)
    const max_score = Number.isFinite(scoreVal) && scoreVal > 0 ? scoreVal : 1000
    const explanation = (r[8] || '').trim()

    built.push({
      id: `new-${crypto.randomUUID()}`,
      isNew: true,
      position: startPosition + built.length,
      content,
      image_url: '',
      time_limit,
      max_score,
      explanation,
      options,
    })
  })
  return { built, errors }
}

function blankQuestion(position) {
  return {
    id: `new-${crypto.randomUUID()}`,
    isNew: true,
    position,
    content: '',
    image_url: '',
    time_limit: 20,
    max_score: 1000,
    explanation: '',
    options: [BLANK_OPTION(), BLANK_OPTION()],
  }
}

export default function QuizEditor() {
  const { quizId } = useParams()
  const navigate = useNavigate()
  const [quiz, setQuiz] = useState(null)
  const [questions, setQuestions] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [importInfo, setImportInfo] = useState('')
  const fileInputRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: qz }, { data: qs }] = await Promise.all([
      supabase.from('quizzes').select('*').eq('id', quizId).single(),
      supabase
        .from('questions')
        .select('*, options(*)')
        .eq('quiz_id', quizId)
        .order('position', { ascending: true }),
    ])
    setQuiz(qz)
    const normalized = (qs || []).map((q) => ({
      ...q,
      options: (q.options || []).sort((a, b) => a.position - b.position),
    }))
    setQuestions(normalized)
    setActiveId(normalized[0]?.id ?? null)
    setLoading(false)
  }, [quizId])

  useEffect(() => { load() }, [load])

  async function saveQuizMeta(field, value) {
    setQuiz((q) => ({ ...q, [field]: value }))
    await supabase.from('quizzes').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', quizId)
  }

  function addQuestion() {
    const q = blankQuestion(questions.length)
    setQuestions((prev) => [...prev, q])
    setActiveId(q.id)
  }

  function updateActive(patch) {
    setQuestions((prev) => prev.map((q) => (q.id === activeId ? { ...q, ...patch } : q)))
  }

  function updateOption(optId, patch) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id !== activeId
          ? q
          : { ...q, options: q.options.map((o) => (o.id === optId ? { ...o, ...patch } : o)) }
      )
    )
  }

  function setCorrect(optId) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id !== activeId
          ? q
          : { ...q, options: q.options.map((o) => ({ ...o, is_correct: o.id === optId })) }
      )
    )
  }

  function addOption() {
    setQuestions((prev) =>
      prev.map((q) => (q.id !== activeId || q.options.length >= 4 ? q : { ...q, options: [...q.options, BLANK_OPTION()] }))
    )
  }

  function removeOption(optId) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id !== activeId || q.options.length <= 2
          ? q
          : { ...q, options: q.options.filter((o) => o.id !== optId) }
      )
    )
  }

  function move(id, dir) {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === id)
      const swapWith = idx + dir
      if (swapWith < 0 || swapWith >= prev.length) return prev
      const copy = [...prev]
      ;[copy[idx], copy[swapWith]] = [copy[swapWith], copy[idx]]
      return copy.map((q, i) => ({ ...q, position: i }))
    })
  }

  async function removeQuestion(id) {
    if (!confirm('Xóa câu hỏi này?')) return
    if (!String(id).startsWith('new-')) {
      await supabase.from('questions').delete().eq('id', id)
    }
    setQuestions((prev) => {
      const rest = prev.filter((q) => q.id !== id).map((q, i) => ({ ...q, position: i }))
      setActiveId(rest[0]?.id ?? null)
      return rest
    })
  }

  function validate(list = questions) {
    if (list.length === 0) return 'Cần ít nhất một câu hỏi.'
    for (const [i, q] of list.entries()) {
      if (!q.content.trim()) return `Câu ${i + 1}: chưa có nội dung.`
      if (q.options.length < 2) return `Câu ${i + 1}: cần ít nhất 2 đáp án.`
      if (q.options.some((o) => !o.content.trim())) return `Câu ${i + 1}: có đáp án còn trống.`
      if (!q.options.some((o) => o.is_correct)) return `Câu ${i + 1}: chưa chọn đáp án đúng.`
    }
    return ''
  }

  async function saveAll(markReady) {
    return persistQuestions(questions, markReady)
  }

  async function persistQuestions(list, markReady) {
    const err = validate(list)
    if (markReady && err) {
      setError(err)
      return false
    }
    setError('')
    setSaving(true)
    try {
      for (const q of list) {
        let questionId = q.id
        const payload = {
          quiz_id: quizId,
          position: q.position,
          content: q.content,
          image_url: q.image_url || null,
          time_limit: q.time_limit,
          max_score: q.max_score,
          explanation: q.explanation || '',
        }
        if (String(q.id).startsWith('new-')) {
          const { data, error: insErr } = await supabase.from('questions').insert(payload).select().single()
          if (insErr) throw insErr
          questionId = data.id
        } else {
          const { error: updErr } = await supabase.from('questions').update(payload).eq('id', questionId)
          if (updErr) throw updErr
        }

        for (const [pos, o] of q.options.entries()) {
          const optPayload = { question_id: questionId, position: pos, content: o.content, is_correct: !!o.is_correct }
          if (String(o.id).startsWith('new-')) {
            const { error: oErr } = await supabase.from('options').insert(optPayload)
            if (oErr) throw oErr
          } else {
            const { error: oErr } = await supabase.from('options').update(optPayload).eq('id', o.id)
            if (oErr) throw oErr
          }
        }
      }
      if (markReady) {
        await supabase.from('quizzes').update({ status: 'ready' }).eq('id', quizId)
      }
      await load()
      return true
    } catch (e) {
      setError(e.message || 'Lưu thất bại, thử lại nhé.')
      return false
    } finally {
      setSaving(false)
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click()
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // cho phép chọn lại cùng file lần sau
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const text = String(reader.result || '')
      const rows = parseCsvText(text)
      const { built, errors } = rowsToQuestions(rows, questions.length)
      if (built.length === 0) {
        setImportInfo('')
        setError(errors.length ? errors.join(' ') : 'Không đọc được câu hỏi nào từ file này.')
        return
      }
      const merged = [...questions, ...built]
      setQuestions(merged)
      setActiveId(built[0].id)
      setError('')
      const ok = await persistQuestions(merged, false)
      if (ok) {
        setImportInfo(
          `Đã nhập ${built.length} câu hỏi thành công.` + (errors.length ? ` (${errors.length} dòng bị bỏ qua: ${errors.join(' ')})` : '')
        )
      }
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function handleOrganize() {
    const ok = await saveAll(true)
    if (ok) navigate(`/host/to-chuc/${quizId}`)
  }

  if (loading) {
    return (
      <div className="app-shell"><HostNav /><div className="container" style={{ padding: 60, textAlign: 'center' }}><div className="spinner" /></div></div>
    )
  }

  if (!quiz) {
    return (
      <div className="app-shell"><HostNav /><div className="container" style={{ padding: 60 }}>Không tìm thấy bộ câu hỏi.</div></div>
    )
  }

  const active = questions.find((q) => q.id === activeId)

  return (
    <div className="app-shell">
      <HostNav />
      <div className="container" style={{ padding: '32px 20px 80px' }}>
        <Link to="/host/bo-cau-hoi" style={{ color: 'var(--paper-dim)', fontSize: 14 }}>&larr; Thư viện</Link>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 14, marginBottom: 24 }}>
          <div className="field" style={{ flex: '2 1 260px', marginBottom: 0 }}>
            <label>Tên bộ câu hỏi</label>
            <input value={quiz.title} onChange={(e) => saveQuizMeta('title', e.target.value)} />
          </div>
          <div className="field" style={{ flex: '3 1 320px', marginBottom: 0 }}>
            <label>Mô tả</label>
            <input value={quiz.description || ''} onChange={(e) => saveQuizMeta('description', e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
          <button type="button" className="btn btn--ghost btn--sm" onClick={downloadCsvTemplate}>
            ⬇ Tải file mẫu Excel/CSV
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={handleImportClick}>
            ⬆ Nhập câu hỏi từ CSV
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleImportFile} />
          <span style={{ fontSize: 12, color: 'var(--paper-dim)' }}>
            Mở file mẫu bằng Excel, điền câu hỏi, rồi lưu lại dạng "CSV UTF-8 (Comma delimited)" trước khi tải lên.
          </span>
        </div>

        {importInfo && <div className="card" style={{ marginBottom: 20, padding: '10px 16px', fontSize: 13 }}>{importInfo}</div>}
        {error && <div className="scrim-error" style={{ marginBottom: 20 }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 22, alignItems: 'start' }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {questions.map((q, i) => (
                <div
                  key={q.id}
                  onClick={() => setActiveId(q.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                    background: q.id === activeId ? 'var(--ink-panel-raised)' : 'transparent',
                    border: q.id === activeId ? '1.5px solid var(--violet)' : '1.5px solid transparent',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-display)', color: 'var(--paper-dim)', fontSize: 13, width: 20 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {q.content || 'Câu hỏi trống'}
                  </span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); move(q.id, -1) }} className="btn btn--sm btn--ghost" style={{ padding: '2px 6px' }} disabled={i === 0}>↑</button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); move(q.id, 1) }} className="btn btn--sm btn--ghost" style={{ padding: '2px 6px' }} disabled={i === questions.length - 1}>↓</button>
                </div>
              ))}
            </div>
            <button className="btn btn--ghost btn--block" onClick={addQuestion}>+ Thêm câu hỏi</button>
          </div>

          {active ? (
            <div className="card">
              <div className="field">
                <label>Nội dung câu hỏi</label>
                <textarea rows={2} value={active.content} onChange={(e) => updateActive({ content: e.target.value })} />
              </div>
              <div className="field">
                <label>Ảnh minh họa (URL, không bắt buộc)</label>
                <input value={active.image_url || ''} onChange={(e) => updateActive({ image_url: e.target.value })} placeholder="https://…" />
              </div>

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div className="field" style={{ minWidth: 160 }}>
                  <label>Thời gian (giây)</label>
                  <select value={active.time_limit} onChange={(e) => updateActive({ time_limit: Number(e.target.value) })}>
                    {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field" style={{ minWidth: 160 }}>
                  <label>Điểm tối đa</label>
                  <input type="number" min={100} step={50} value={active.max_score} onChange={(e) => updateActive({ max_score: Number(e.target.value) })} />
                </div>
              </div>

              <label style={{ fontSize: 13, color: 'var(--paper-dim)', fontWeight: 600 }}>Đáp án (chọn nút tròn cho đáp án đúng)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8, marginBottom: 8 }}>
                {active.options.map((o) => (
                  <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--ink-panel-raised)', borderRadius: 12, padding: '6px 10px' }}>
                    <input type="radio" name="correct" checked={!!o.is_correct} onChange={() => setCorrect(o.id)} />
                    <input
                      value={o.content}
                      onChange={(e) => updateOption(o.id, { content: e.target.value })}
                      placeholder="Nội dung đáp án"
                      style={{ flex: 1, background: 'transparent', color: 'var(--paper)', border: 'none', padding: '6px 4px' }}
                    />
                    {active.options.length > 2 && (
                      <button type="button" onClick={() => removeOption(o.id)} style={{ background: 'none', border: 'none', color: 'var(--coral)' }}>✕</button>
                    )}
                  </div>
                ))}
              </div>
              {active.options.length < 4 && (
                <button className="btn btn--ghost btn--sm" onClick={addOption} style={{ marginBottom: 18 }}>+ Thêm đáp án</button>
              )}

              <div className="field">
                <label>Giải thích (hiện sau khi công bố đáp án, không bắt buộc)</label>
                <textarea rows={2} value={active.explanation || ''} onChange={(e) => updateActive({ explanation: e.target.value })} />
              </div>

              <button className="btn btn--sm" style={{ background: 'transparent', color: 'var(--coral)' }} onClick={() => removeQuestion(active.id)}>
                Xóa câu hỏi này
              </button>
            </div>
          ) : (
            <div className="card" style={{ textAlign: 'center', color: 'var(--paper-dim)' }}>
              Chưa có câu hỏi nào. Nhấn “+ Thêm câu hỏi”.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 28, justifyContent: 'flex-end' }}>
          <button className="btn btn--ghost" onClick={() => saveAll(false)} disabled={saving}>
            {saving ? 'Đang lưu…' : 'Lưu bản nháp'}
          </button>
          <button className="btn btn--primary" onClick={handleOrganize} disabled={saving}>
            Lưu & Tổ chức trò chơi
          </button>
        </div>
      </div>
    </div>
  )
}
