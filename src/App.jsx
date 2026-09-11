import { Routes, Route, useLocation } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import RequireHost from './components/RequireHost'
import Home from './pages/Home'
import HostLogin from './pages/HostLogin'
import QuizLibrary from './pages/QuizLibrary'
import QuizEditor from './pages/QuizEditor'
import HostSession from './pages/HostSession'
import Join from './pages/Join'
import Play from './pages/Play'

export default function App() {
  const location = useLocation()

  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/host" element={<HostLogin />} />
        <Route path="/host/bo-cau-hoi" element={<RequireHost><QuizLibrary /></RequireHost>} />
        <Route path="/host/bo-cau-hoi/:quizId" element={<RequireHost><QuizEditor /></RequireHost>} />
        {/* key=location.key forces a fresh session every time this route is (re)entered,
            including "Tổ chức lại" which links back to the same path. */}
        <Route
          path="/host/to-chuc/:quizId"
          element={<RequireHost><HostSession key={location.key} /></RequireHost>}
        />
        <Route path="/tham-gia" element={<Join />} />
        <Route path="/choi/:sessionId" element={<Play />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </AuthProvider>
  )
}
