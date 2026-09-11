import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'

export default function HostNav() {
  const { user } = useAuth()

  return (
    <header style={{ borderBottom: '1px solid rgba(245,243,255,0.08)' }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
        <Link to="/host/bo-cau-hoi" className="display" style={{ color: 'var(--yellow)', fontSize: 22 }}>
          QuizRace
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {user && <span style={{ color: 'var(--paper-dim)', fontSize: 14 }}>{user.email}</span>}
          <button className="btn btn--ghost btn--sm" onClick={() => supabase.auth.signOut()}>
            Đăng xuất
          </button>
        </div>
      </div>
    </header>
  )
}
