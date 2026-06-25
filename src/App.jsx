import { useState, useEffect, useCallback } from 'react'
import { ref, onValue, set, get, push } from 'firebase/database'
import { db } from './firebase'
import { MATCHES } from './matches'

// ─── CONSTANTE ───────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = 'admin2026'

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function calcScore(pred, result) {
  if (!result || result.home === '' || result.away === '') return null
  const ph = parseInt(pred.home), pa = parseInt(pred.away)
  const rh = parseInt(result.home), ra = parseInt(result.away)
  if (isNaN(ph) || isNaN(pa) || isNaN(rh) || isNaN(ra)) return null
  if (ph === rh && pa === ra) return 5
  const pDiff = ph - pa, rDiff = rh - ra
  const pWin = pDiff > 0 ? 'H' : pDiff < 0 ? 'A' : 'D'
  const rWin = rDiff > 0 ? 'H' : rDiff < 0 ? 'A' : 'D'
  if (pWin === rWin && pDiff === rDiff) return 3
  if (pWin === rWin) return 2
  return 0
}

function isLocked(kickoff) {
  if (!kickoff) return false
  return Date.now() >= new Date(kickoff).getTime() - 5 * 60 * 1000
}

// Calculează punctajul pentru pronosticul de finaliști: 20p ambele corecte, 10p doar una, 0p niciuna
function calcFinalistsScore(picked, actual) {
  if (!picked || !actual) return null
  if (!picked[0] || !picked[1] || !actual[0] || !actual[1]) return null
  const pSet = new Set(picked)
  const aSet = new Set(actual)
  let matches = 0
  pSet.forEach(t => { if (aSet.has(t)) matches += 1 })
  if (matches === 2) return 20
  if (matches === 1) return 10
  return 0
}

function fmtHour(kickoff) {
  if (!kickoff) return ''
  return new Date(kickoff).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })
}

// hash simplu pentru parolă (nu e crypto-safe, dar e suficient pentru un joc între prieteni)
async function hashPass(pass) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pass))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  // ── State ──
  const [view, setView]           = useState(() => sessionStorage.getItem('wc2026_view') || 'login')      // login | predict | special | leaderboard | mypool | admin
  const [loginStep, setLoginStep] = useState('name')       // name | password | register
  const [inputName, setInputName] = useState('')
  const [inputPass, setInputPass] = useState('')
  const [inputPass2, setInputPass2] = useState('')
  const [loginError, setLoginError] = useState('')

  const [currentUser, setCurrentUser] = useState(null)     // { name, isAdmin }
  const [adminMode, setAdminMode]     = useState(false)
  const [adminInput, setAdminInput]   = useState('')

  const [users, setUsers]         = useState({})           // { name: { hash } }
  const [messages, setMessages]   = useState([])
  const [chatInput, setChatInput] = useState('')
  const [lastSeenTs, setLastSeenTs] = useState(() => Date.now())
  const [chatOpen, setChatOpen]     = useState(false)
  const [theme, setTheme]           = useState(() => localStorage.getItem('wc2026_theme') || 'dark')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const isDark = theme === 'dark'
  const toggleTheme = () => { const t = isDark ? 'light' : 'dark'; setTheme(t); localStorage.setItem('wc2026_theme', t) }
  const [predictions, setPreds]   = useState({})           // { name: { matchId: {home,away} } }
  const [results, setResults]     = useState({})           // { matchId: {home,away} }
  const [specialPreds, setSpecialPreds]     = useState({}) // { name: { finalists: [a,b], finalScore: {home,away} } }
  const [specialResults, setSpecialResults] = useState({}) // { finalists: [a,b] }

  const [localPreds, setLocalPreds] = useState({})         // buffer local înainte de save
  const [localResults, setLocalResults] = useState({})
  const [localSpecial, setLocalSpecial] = useState({ finalists: ['', ''], finalScore: { home: '', away: '' }, champion: '' })
  const [localSpecialResults, setLocalSpecialResults] = useState({ finalists: ['', ''], champion: '' })
  const [savingSpecial, setSavingSpecial] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [toast, setToast]         = useState(null)
  const [now, setNow]             = useState(Date.now())

  // ── Tick ──
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  // ── Fonturi (Oswald pt. display/scor, Inter pt. text) + animații/focus ──
  useEffect(() => {
    if (document.getElementById('wc2026-fonts')) return
    const link = document.createElement('link')
    link.id = 'wc2026-fonts'
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&display=swap'
    document.head.appendChild(link)

    const style = document.createElement('style')
    style.id = 'wc2026-anim'
    style.textContent = `
      @keyframes wcPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
      @keyframes wcRise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes wcPrizeIn { from { opacity: 0; transform: translateY(-12px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes wcPrizePulse { 0%,100% { transform: scale(1); text-shadow: 0 0 24px rgba(212,175,55,0.5); } 50% { transform: scale(1.045); text-shadow: 0 0 44px rgba(244,196,48,0.85), 0 0 80px rgba(212,175,55,0.3); } }
      @keyframes wcShimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
      @keyframes wcGlow { 0%,100% { box-shadow: 0 0 18px rgba(212,175,55,0.18), inset 0 0 18px rgba(212,175,55,0.04); } 50% { box-shadow: 0 0 38px rgba(212,175,55,0.38), inset 0 0 28px rgba(212,175,55,0.09); } }
      @media (prefers-reduced-motion: reduce) {
        .wc-pulse-dot { animation: none !important; }
        .wc-rise { animation: none !important; }
      }
      input[type=number]::-webkit-inner-spin-button,
      input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
      input[type=number] { -moz-appearance: textfield; }
      .wc-app *:focus-visible { outline: 2px solid #d4af37; outline-offset: 2px; }
      .wc-app ::selection { background: rgba(212,175,55,0.35); }
      .wc-scroll::-webkit-scrollbar { height: 8px; width: 8px; }
      .wc-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.04); }
      .wc-scroll::-webkit-scrollbar-thumb { background: rgba(212,175,55,0.35); border-radius: 8px; }
    `
    document.head.appendChild(style)
  }, [])

  // ── Firebase listeners ──
  useEffect(() => {
    const unsubUsers = onValue(ref(db, 'users'), snap => {
      setUsers(snap.val() || {})
    })
    const unsubPreds = onValue(ref(db, 'predictions'), snap => {
      setPreds(snap.val() || {})
    })
    const unsubRes = onValue(ref(db, 'results'), snap => {
      setResults(snap.val() || {})
    })
    const unsubSpecialPreds = onValue(ref(db, 'specialPredictions'), snap => {
      setSpecialPreds(snap.val() || {})
    })
    const unsubSpecialRes = onValue(ref(db, 'specialResults'), snap => {
      setSpecialResults(snap.val() || {})
    })
    const unsubChat = onValue(ref(db, 'chat'), snap => {
      const val = snap.val() || {}
      const msgs = Object.entries(val)
        .map(([id, m]) => ({ id, ...m }))
        .sort((a, b) => a.ts - b.ts)
        .slice(-200)
      setMessages(msgs)
    })
    return () => { unsubUsers(); unsubPreds(); unsubRes(); unsubSpecialPreds(); unsubSpecialRes(); unsubChat() }
  }, [])

  // Sync local predictions when user logs in or remote changes
  useEffect(() => {
    if (currentUser) {
      setLocalPreds(predictions[currentUser.name] || {})
    }
  }, [predictions, currentUser])

  useEffect(() => {
    setLocalResults(results)
  }, [results])

  // Sync local special predictions/results when user logs in or remote changes
  useEffect(() => {
    if (currentUser) {
      const mine = specialPreds[currentUser.name]
      setLocalSpecial({
        finalists: mine?.finalists || ['', ''],
        finalScore: mine?.finalScore || { home: '', away: '' },
        champion: mine?.champion || ''
      })
    }
  }, [specialPreds, currentUser])

  useEffect(() => {
    setLocalSpecialResults({ finalists: specialResults.finalists || ['', ''], champion: specialResults.champion || '' })
  }, [specialResults])

  // ── Restore session ──
  useEffect(() => {
    const saved = sessionStorage.getItem('wc2026_user')
    if (saved) {
      try {
        const u = JSON.parse(saved)
        setCurrentUser(u)
        const savedView = sessionStorage.getItem('wc2026_view')
        setView(savedView && savedView !== 'login' ? savedView : 'predict')
      } catch (_) {}
    }
  }, [])

  const goTo = (v) => { setView(v); sessionStorage.setItem('wc2026_view', v) }

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ─── AUTH ────────────────────────────────────────────────────────────────

  const handleNameSubmit = () => {
    const name = inputName.trim()
    if (!name) return
    if (users[name]) {
      // user există → cere parolă
      setLoginStep('password')
      setLoginError('')
    } else {
      // user nou → înregistrare
      setLoginStep('register')
      setLoginError('')
    }
  }

  const handleLoginPassword = async () => {
    const name = inputName.trim()
    const hash = await hashPass(inputPass)
    if (users[name]?.hash === hash) {
      const u = { name }
      setCurrentUser(u)
      sessionStorage.setItem('wc2026_user', JSON.stringify(u))
      setView('predict')
      setInputPass('')
      setLoginError('')
    } else {
      setLoginError('Parolă incorectă. Mai încearcă.')
    }
  }

  const handleRegister = async () => {
    const name = inputName.trim()
    if (!inputPass) { setLoginError('Introdu o parolă.'); return }
    if (inputPass !== inputPass2) { setLoginError('Parolele nu coincid.'); return }
    if (inputPass.length < 4) { setLoginError('Parola trebuie să aibă minim 4 caractere.'); return }
    const hash = await hashPass(inputPass)
    await set(ref(db, `users/${name}`), { hash })
    const u = { name }
    setCurrentUser(u)
    sessionStorage.setItem('wc2026_user', JSON.stringify(u))
    setView('predict')
    setInputPass('')
    setInputPass2('')
    setLoginError('')
    showToast(`Bun venit, ${name}! 🎉`)
  }

  const handleLogout = () => {
    setCurrentUser(null)
    sessionStorage.removeItem('wc2026_user')
    sessionStorage.removeItem('wc2026_view')
    setView('login')
    setLoginStep('name')
    setInputName('')
    setInputPass('')
    setInputPass2('')
    setAdminMode(false)
  }

  // ─── PRONOSTICURI ────────────────────────────────────────────────────────

  const updateLocalPred = (matchId, side, val) => {
    if (val !== '' && (isNaN(parseInt(val)) || parseInt(val) < 0)) return
    setLocalPreds(prev => ({
      ...prev,
      [matchId]: { ...(prev[matchId] || { home: '', away: '' }), [side]: val }
    }))
  }

  const savePredictions = async () => {
    if (!currentUser) return
    setSaving(true)
    try {
      await set(ref(db, `predictions/${currentUser.name}`), localPreds)
      showToast('Pronosticuri salvate! ✅')
    } catch (e) {
      showToast('Eroare: ' + e.message, 'err')
    }
    setSaving(false)
  }

  // ─── PRONOSTICURI SPECIALE (Finaliști + Scor finală) ────────────────────

  const updateLocalFinalist = (slot, teamName) => {
    setLocalSpecial(prev => {
      const next = [...prev.finalists]
      next[slot] = teamName
      return { ...prev, finalists: next }
    })
  }

  const updateLocalFinalScore = (side, val) => {
    if (val !== '' && (isNaN(parseInt(val)) || parseInt(val) < 0)) return
    setLocalSpecial(prev => ({
      ...prev,
      finalScore: { ...prev.finalScore, [side]: val }
    }))
  }

  const updateLocalChampion = (teamName) => {
    setLocalSpecial(prev => ({ ...prev, champion: teamName }))
  }

  const saveSpecialPrediction = async () => {
    if (!currentUser) return
    setSavingSpecial(true)
    try {
      await set(ref(db, `specialPredictions/${currentUser.name}`), localSpecial)
      showToast('Pronostic special salvat! ✅')
    } catch (e) {
      showToast('Eroare: ' + e.message, 'err')
    }
    setSavingSpecial(false)
  }

  // ─── ADMIN ───────────────────────────────────────────────────────────────

  const handleAdminLogin = () => {
    if (adminInput === ADMIN_PASSWORD) {
      setAdminMode(true)
      setAdminInput('')
    } else {
      showToast('Parolă greșită', 'err')
    }
  }

  const updateLocalResult = (matchId, side, val) => {
    if (val !== '' && (isNaN(parseInt(val)) || parseInt(val) < 0)) return
    setLocalResults(prev => ({
      ...prev,
      [matchId]: { ...(prev[matchId] || { home: '', away: '' }), [side]: val }
    }))
  }

  const saveResults = async () => {
    try {
      await set(ref(db, 'results'), localResults)
      showToast('Rezultate salvate! ✅')
    } catch (e) {
      showToast('Eroare: ' + e.message, 'err')
    }
  }

  const updateLocalSpecialResultFinalist = (slot, teamName) => {
    setLocalSpecialResults(prev => {
      const next = [...prev.finalists]
      next[slot] = teamName
      return { ...prev, finalists: next }
    })
  }

  const updateLocalSpecialResultChampion = (teamName) => {
    setLocalSpecialResults(prev => ({ ...prev, champion: teamName }))
  }

  const saveSpecialResults = async () => {
    try {
      await set(ref(db, 'specialResults'), localSpecialResults)
      showToast('Finaliști salvați! ✅')
    } catch (e) {
      showToast('Eroare: ' + e.message, 'err')
    }
  }

  // ─── CLASAMENT ───────────────────────────────────────────────────────────

  const leaderboard = Object.keys(users).map(name => {
    let total = 0
    let exact = 0
    MATCHES.forEach(m => {
      const pred = predictions[name]?.[m.id]
      if (!pred || pred.home === '' || pred.away === '') return
      const res = results[m.id]
      if (!res || res.home === '' || res.away === '') return
      const pts = calcScore(pred, res)
      if (pts) total += pts
      if (pts === 5) exact += 1
    })

    let specialPts = 0
    const mySpecial = specialPreds[name]
    if (mySpecial?.finalists && specialResults.finalists) {
      const fPts = calcFinalistsScore(mySpecial.finalists, specialResults.finalists)
      if (fPts) specialPts += fPts
    }
    const finalRes = results[63]
    if (mySpecial?.finalScore && finalRes && finalRes.home !== '' && finalRes.away !== '') {
      const sh = parseInt(mySpecial.finalScore.home), sa = parseInt(mySpecial.finalScore.away)
      const rh = parseInt(finalRes.home), ra = parseInt(finalRes.away)
      if (!isNaN(sh) && !isNaN(sa) && sh === rh && sa === ra) specialPts += 10
    }
    if (mySpecial?.champion && specialResults.champion && mySpecial.champion === specialResults.champion) {
      specialPts += 10
    }
    total += specialPts

    return { name, total, exact, specialPts }
  }).sort((a, b) => b.total - a.total)

  // Ordinea coloanelor din tabelul „Pronosticuri detaliate”: userul curent primul, apoi restul după punctaj descrescător
  const orderedUserNames = currentUser
    ? [
        currentUser.name,
        ...leaderboard.filter(u => u.name !== currentUser.name).map(u => u.name)
      ]
    : leaderboard.map(u => u.name)

  // ─── MECIURI SORTATE ─────────────────────────────────────────────────────

  const sortedMatches = [...MATCHES].sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))

  const matchesByDay = sortedMatches.reduce((acc, m) => {
    if (!acc[m.date]) acc[m.date] = []
    acc[m.date].push(m)
    return acc
  }, {})

  // Meciuri vizibile în pronosticuri: viitoare + max 24h după kickoff
  const TWENTY_FOUR_H = 24 * 60 * 60 * 1000
  const visibleMatches = sortedMatches.filter(m =>
    !m.kickoff || Date.now() < new Date(m.kickoff).getTime() + TWENTY_FOUR_H
  )

  // Doar meciurile din faza grupelor vizibile
  const groupMatches = sortedMatches.filter(m => m.group.startsWith('Grupa'))
  const groupMatchesByDay = visibleMatches.filter(m => m.group.startsWith('Grupa')).reduce((acc, m) => {
    if (!acc[m.date]) acc[m.date] = []
    acc[m.date].push(m)
    return acc
  }, {})

  // Toate echipele participante (extrase din meciurile de grupă), sortate alfabetic
  const allTeams = Array.from(
    new Set(groupMatches.flatMap(m => [m.home, m.away]))
  ).sort((a, b) => a.localeCompare(b, 'ro'))

  const specialLocked = isLocked(MATCHES.find(m => m.id === 31)?.kickoff)
  const myFinalists = localSpecial.finalists
  const myFinalScore = localSpecial.finalScore

  // ─── POOL-UL MEU ─────────────────────────────────────────────────────────

  const myPredictedMatches = currentUser
    ? sortedMatches.filter(m => {
        const p = predictions[currentUser.name]?.[m.id]
        return p && p.home !== '' && p.away !== ''
      })
    : []

  const myPlayedMatches = myPredictedMatches.filter(m => {
    const res = results[m.id]
    return res && res.home !== '' && res.away !== ''
  })

  const myUpcomingMatches = myPredictedMatches.filter(m => {
    const res = results[m.id]
    return !(res && res.home !== '' && res.away !== '')
  })

  // ─── CHAT ────────────────────────────────────────────────────────────────
  const unread = messages.filter(m => m.ts > lastSeenTs && m.user !== currentUser?.name).length

  const markChatRead = () => setLastSeenTs(Date.now())
  const toggleChat = () => { setChatOpen(o => !o); if (!chatOpen) markChatRead() }

  const sendMessage = async () => {
    const text = chatInput.trim()
    if (!text || !currentUser) return
    setChatInput('')
    try {
      await push(ref(db, 'chat'), { user: currentUser.name, text, ts: Date.now() })
    } catch (e) { showToast('Eroare la trimitere', 'err') }
  }

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    const close = () => setDropdownOpen(false)
    document.addEventListener('click', close, true)
    return () => document.removeEventListener('click', close, true)
  }, [dropdownOpen])

  // ─── RENDER ──────────────────────────────────────────────────────────────

  const T = isDark ? DARK : LIGHT

  return (
    <div className="wc-app" style={{ ...S.root, ...T.root }}>
      {/* ── HEADER ── */}
      <header style={{ ...S.header, ...T.header, boxShadow: S.header.boxShadow }}>
        <div style={{ ...S.headerTopLine, background: T.headerLine.background }} />
        <div style={S.headerInner}>
          <div style={S.logo}>
            <div style={S.logoMark}>
              <svg width="24" height="24" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="#f5f1e8"/>
                <circle cx="12" cy="12" r="10" fill="none" stroke="#0a0a0c" strokeWidth="1"/>
                <polygon points="12,7.2 15.5,9.7 14.2,13.8 9.8,13.8 8.5,9.7" fill="#0a0a0c"/>
                <path d="M12,7.2 L12,3.2 M15.5,9.7 L19.2,8.4 M14.2,13.8 L16.6,17.2 M9.8,13.8 L7.4,17.2 M8.5,9.7 L4.8,8.4" stroke="#0a0a0c" strokeWidth="1.1" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div style={{ ...S.logoTitle, color: T.text }}>CUPA MONDIALĂ <span style={S.logoYear}>2026</span></div>
              <div style={{ ...S.logoSub, color: T.textSub }}>Pariorii AERO PART EXPERT</div>
            </div>
          </div>
          {currentUser && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
              {/* Theme toggle */}
              <button onClick={toggleTheme} style={{
                background: 'none', border: '1px solid rgba(212,175,55,0.3)',
                borderRadius: 8, width: 34, height: 34, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, flexShrink: 0,
                color: isDark ? '#f0b429' : '#b8922a',
              }} title={isDark ? 'Temă deschisă' : 'Temă închisă'}>
                {isDark ? '☀️' : '🌙'}
              </button>
              {/* User dropdown */}
              <button onClick={() => setDropdownOpen(o => !o)} style={{
                ...S.userBadge,
                cursor: 'pointer', border: '1px solid rgba(212,175,55,0.35)',
                display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(212,175,55,0.12)',
              }}>
                {currentUser.name}
                <span style={{ fontSize: 9, opacity: 0.7 }}>{dropdownOpen ? '▲' : '▼'}</span>
              </button>
              {dropdownOpen && (
                <div style={{
                  position: 'absolute', top: '110%', right: 0, zIndex: 200,
                  background: isDark ? '#1e1e24' : '#fff',
                  border: `1px solid ${isDark ? 'rgba(212,175,55,0.25)' : '#e8e0d0'}`,
                  borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                  minWidth: 160, overflow: 'hidden',
                }}>
                  <div style={{ padding: '10px 16px', fontSize: 11, color: isDark ? '#8a8a93' : '#9a8a6a', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#f0e8d8'}`, fontFamily: "'Oswald',sans-serif", letterSpacing: 0.5 }}>
                    Conectat ca
                  </div>
                  <div style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, color: isDark ? '#f0b429' : '#b8922a' }}>
                    {currentUser.name}
                  </div>
                  <div style={{ borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#f0e8d8'}` }}>
                    <button onClick={() => { setDropdownOpen(false); handleLogout() }} style={{
                      width: '100%', padding: '10px 16px', background: 'none',
                      border: 'none', textAlign: 'left', cursor: 'pointer',
                      fontSize: 13, color: '#e0717c', fontFamily: "'Inter',sans-serif",
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      ⏻ Ieșire
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {currentUser && (
          <nav style={S.navWrap}>
            {[
              ['predict','Pronosticuri'],
              ['special','Speciale'],
              ['mypool','Pool-ul meu'],
              ['leaderboard','Clasament'],
              ['admin','Admin']
            ].map(([k,l]) => (
              <button key={k} style={{ ...S.navBtn, color: view===k ? T.gold : T.textSub, borderBottom: view===k ? `2px solid ${T.gold}` : '2px solid transparent' }}
                onClick={() => goTo(k)}>{l}</button>
            ))}

          </nav>
        )}
      </header>

      {/* ── TOAST ── */}
      {toast && (
        <div className="wc-rise" style={{ ...S.toast, animation: 'wcRise 0.25s ease', background: toast.type === 'err' ? 'linear-gradient(135deg,#c0392b,#922b21)' : 'linear-gradient(135deg,#1a7a4c,#0e5c38)' }}>
          {toast.msg}
        </div>

      )}

      <main style={{ ...S.main, color: T.text }}>

        {/* ════ LOGIN ════ */}
        {view === 'login' && (
          <div style={S.center}>
            <div style={{ ...S.card, ...T.card, boxShadow: S.card.boxShadow }}>
              <div style={S.cardCrest}>
                <svg width="36" height="36" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" fill="#f5f1e8"/>
                  <circle cx="12" cy="12" r="10" fill="none" stroke="#0a0a0c" strokeWidth="1"/>
                  <polygon points="12,7.2 15.5,9.7 14.2,13.8 9.8,13.8 8.5,9.7" fill="#0a0a0c"/>
                  <path d="M12,7.2 L12,3.2 M15.5,9.7 L19.2,8.4 M14.2,13.8 L16.6,17.2 M9.8,13.8 L7.4,17.2 M8.5,9.7 L4.8,8.4" stroke="#0a0a0c" strokeWidth="1.1" strokeLinecap="round"/>
                </svg>
              </div>
              <h2 style={{ ...S.cardTitle, color: T.text }}>Intră în joc</h2>
              <div style={S.cardDivider} />

              {loginStep === 'name' && (
                <>
                  <p style={{ ...S.cardSub, color: T.textSub }}>Introdu numele tău de participant</p>
                  <input style={{ ...S.input, ...T.input }} placeholder="Numele tău (ex: Adrian)"
                    value={inputName} maxLength={20}
                    onChange={e => setInputName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleNameSubmit()} />
                  {loginError && <div style={S.errMsg}>{loginError}</div>}
                  <button style={S.btnPrimary} onClick={handleNameSubmit}>Continuă →</button>
                </>
              )}

              {loginStep === 'password' && (
                <>
                  <p style={{ ...S.cardSub, color: T.textSub }}>Salut, <b style={S.cardSubAccent}>{inputName}</b>! Introdu parola ta.</p>
                  <input style={{ ...S.input, ...T.input }} type="password" placeholder="Parola ta"
                    value={inputPass}
                    onChange={e => setInputPass(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLoginPassword()} />
                  {loginError && <div style={S.errMsg}>{loginError}</div>}
                  <button style={S.btnPrimary} onClick={handleLoginPassword}>Intră →</button>
                  <button style={{ ...S.btnGhost, width: '100%', marginTop: 8, padding: '10px' }}
                    onClick={() => { setLoginStep('name'); setInputPass(''); setLoginError('') }}>
                    ← Înapoi
                  </button>
                </>
              )}

              {loginStep === 'register' && (
                <>
                  <p style={{ ...S.cardSub, color: T.textSub }}>
                    Cont nou pentru <b style={S.cardSubAccent}>{inputName}</b>.<br/>
                    Alege o parolă cu care te vei loga data viitoare.
                  </p>
                  <input style={{ ...S.input, ...T.input }} type="password" placeholder="Alege o parolă (min. 4 caractere)"
                    value={inputPass}
                    onChange={e => setInputPass(e.target.value)} />
                  <input style={{ ...S.input, ...T.input }} type="password" placeholder="Confirmă parola"
                    value={inputPass2}
                    onChange={e => setInputPass2(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleRegister()} />
                  {loginError && <div style={S.errMsg}>{loginError}</div>}
                  <button style={S.btnPrimary} onClick={handleRegister}>Creează cont →</button>
                  <button style={{ ...S.btnGhost, width: '100%', marginTop: 8, padding: '10px' }}
                    onClick={() => { setLoginStep('name'); setInputPass(''); setInputPass2(''); setLoginError('') }}>
                    ← Înapoi
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ════ PRONOSTICURI ════ */}
        {view === 'predict' && currentUser && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ ...S.pageTitle, color: T.text }}>Pronosticurile tale</h2>
              <button style={{ ...S.btnPrimary, width: 'auto', padding: '10px 20px', fontSize: 13 }}
                onClick={savePredictions} disabled={saving}>
                {saving ? 'Se salvează...' : 'Salvează'}
              </button>
            </div>
            <div style={{ ...S.infoBox, ...T.infoBox }}>
              <span style={S.infoPt}><b style={S.infoPtGold}>5p</b> scor exact</span>
              <span style={S.infoDot}>·</span>
              <span style={S.infoPt}><b style={S.infoPtBlue}>3p</b> diferență goluri</span>
              <span style={S.infoDot}>·</span>
              <span style={S.infoPt}><b style={S.infoPtGreen}>2p</b> câștigător corect</span>
              <div style={{ marginTop: 6, opacity: 0.8 }}>Pronosticurile se blochează automat cu 5 minute înainte de fiecare meci.</div>
            </div>

            {Object.entries(groupMatchesByDay).map(([day, dayMatches]) => (
              <div key={day} style={{ marginBottom: 26 }}>
                <div style={{ ...S.dayLabel, color: T.dayLabel.color }}><span style={S.dayLabelLine} />{day}<span style={S.dayLabelLine} /></div>
                {dayMatches.map(m => {
                  const pred    = localPreds[m.id] || { home: '', away: '' }
                  const res     = results[m.id]
                  const locked  = isLocked(m.kickoff)
                  const hasPred = pred.home !== '' && pred.away !== ''
                  const hasRes  = res && res.home !== '' && res.away !== ''
                  const pts     = hasPred && hasRes ? calcScore(pred, res) : null
                  const minsLeft = m.kickoff ? Math.max(0, Math.ceil((new Date(m.kickoff) - now) / 60000)) : null

                  let cardStyle = { ...S.matchCard, ...T.matchCard }
                  let stripeStyle = S.cardStripeDefault
                  if (pts === 5) { cardStyle = { ...cardStyle, ...S.cardGold }; stripeStyle = S.cardStripeGold }
                  else if (pts === 3) { cardStyle = { ...cardStyle, ...S.cardBlue }; stripeStyle = S.cardStripeBlue }
                  else if (pts === 2) { cardStyle = { ...cardStyle, ...S.cardGreen }; stripeStyle = S.cardStripeGreen }
                  else if (locked && !hasRes) { cardStyle = { ...cardStyle, ...S.cardLocked }; stripeStyle = S.cardStripeLocked }

                  return (
                    <div key={m.id} style={cardStyle}>
                      <div style={stripeStyle} />
                      <div style={S.matchCardBody}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                          <span style={{ ...S.matchMeta, color: T.textMeta }}>
                            {fmtHour(m.kickoff)} <span style={S.matchMetaDot}>•</span> <span style={{ ...S.matchGroup, color: T.textGroup }}>{m.group}</span>
                          </span>
                          {locked
                            ? <span style={S.lockBadge}>Blocat</span>
                            : minsLeft !== null && minsLeft <= 120
                              ? <span className="wc-pulse-dot" style={S.timerBadge}><span style={{...S.liveDot, animation: 'wcPulse 1.6s ease-in-out infinite'}} />{minsLeft} min</span>
                              : null
                          }
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ ...S.teamName, color: T.teamName }}>{m.home}</span>
                          <div style={{ ...S.scoreboardWrap, ...T.scoreBoard }}>
                            {locked
                              ? <>
                                  <div style={{ ...S.scoreDisplay, ...T.scoreBox }}>{pred.home !== '' ? pred.home : '–'}</div>
                                  <span style={S.colon}>:</span>
                                  <div style={{ ...S.scoreDisplay, ...T.scoreBox }}>{pred.away !== '' ? pred.away : '–'}</div>
                                </>
                              : <>
                                  <input style={{ ...S.scoreInput, ...T.scoreInput }} type="number" min="0" max="20"
                                    value={pred.home} placeholder="–"
                                    onChange={e => updateLocalPred(m.id, 'home', e.target.value)} />
                                  <span style={S.colon}>:</span>
                                  <input style={{ ...S.scoreInput, ...T.scoreInput }} type="number" min="0" max="20"
                                    value={pred.away} placeholder="–"
                                    onChange={e => updateLocalPred(m.id, 'away', e.target.value)} />
                                </>
                            }
                          </div>
                          <span style={{ ...S.teamName, textAlign: 'right', color: T.teamName }}>{m.away}</span>
                        </div>
                        {hasRes && (
                          <div style={{ ...S.resultRow, ...T.resultRow }}>
                            Rezultat final <b style={{ ...S.resultScore, color: T.textResult }}>{res.home} – {res.away}</b>
                            {pts !== null && (
                              <span style={{ ...S.ptsBadge, ...(pts===5?S.ptsBadgeGold:pts===3?S.ptsBadgeBlue:pts===2?S.ptsBadgeGreen:S.ptsBadgeZero) }}>
                                +{pts}p
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}

            <div style={{ textAlign: 'center', marginTop: 8, marginBottom: 32 }}>
              <button style={S.btnPrimary} onClick={savePredictions} disabled={saving}>
                {saving ? 'Se salvează...' : 'Salvează toate pronosticurile'}
              </button>
            </div>
          </div>
        )}

        {/* ════ SPECIALE ════ */}
        {view === 'special' && currentUser && (
          <div>
            <h2 style={{ ...S.pageTitle, color: T.text }}>Pronosticuri speciale</h2>
            <div style={{ ...S.infoBox, ...T.infoBox }}>
              <span style={S.infoPt}><b style={S.infoPtGold}>20p</b> ambii finaliști corecți</span>
              <span style={S.infoDot}>·</span>
              <span style={S.infoPt}><b style={S.infoPtBlue}>10p</b> un finalist corect</span>
              <span style={S.infoDot}>·</span>
              <span style={S.infoPt}><b style={S.infoPtGreen}>10p</b> scor exact finală</span>
              <span style={S.infoDot}>·</span>
              <span style={S.infoPt}><b style={S.infoPtGold}>10p</b> campioana corectă</span>
              <div style={{ marginTop: 6, opacity: 0.8 }}>
                Se blochează la începutul ultimului meci din faza grupelor (28 Iun, 22:00).
              </div>
            </div>

            <div style={{ ...S.dayLabel, color: T.dayLabel.color }}><span style={S.dayLabelLine} />Cine joacă finala<span style={S.dayLabelLine} /></div>
            <div style={{ ...S.matchCard, ...T.matchCard }}>
              <div style={S.cardStripeGold} />
              <div style={S.matchCardBody}>
                {specialLocked ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                      <span style={{ ...S.matchMeta, color: T.textMeta }}>Pronosticul tău</span>
                      <span style={S.lockBadge}>Blocat</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ ...S.scoreDisplay2, ...T.scoreBox }}>{myFinalists[0] || '–'}</div>
                      <div style={{ ...S.scoreDisplay2, ...T.scoreBox }}>{myFinalists[1] || '–'}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ ...S.matchMeta, color: T.textMeta }}>Alege 2 echipe (fără ordine)</div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 9, flexWrap: 'wrap' }}>
                      <select style={{ ...S.selectInput, ...T.input }} value={myFinalists[0] || ''} onChange={e => updateLocalFinalist(0, e.target.value)}>
                        <option value="">Echipa 1...</option>
                        {allTeams.map(t => <option key={t} value={t} disabled={t === myFinalists[1]}>{t}</option>)}
                      </select>
                      <select style={{ ...S.selectInput, ...T.input }} value={myFinalists[1] || ''} onChange={e => updateLocalFinalist(1, e.target.value)}>
                        <option value="">Echipa 2...</option>
                        {allTeams.map(t => <option key={t} value={t} disabled={t === myFinalists[0]}>{t}</option>)}
                      </select>
                    </div>
                  </>
                )}
                {specialResults.finalists?.[0] && specialResults.finalists?.[1] && (
                  <div style={{ ...S.resultRow, ...T.resultRow }}>
                    Finaliști reali <b style={{ ...S.resultScore, color: T.textResult }}>{specialResults.finalists[0]} – {specialResults.finalists[1]}</b>
                    {(() => {
                      const fPts = calcFinalistsScore(myFinalists, specialResults.finalists)
                      return fPts !== null && (
                        <span style={{ ...S.ptsBadge, ...(fPts===20?S.ptsBadgeGold:fPts===10?S.ptsBadgeBlue:S.ptsBadgeZero) }}>+{fPts}p</span>
                      )
                    })()}
                  </div>
                )}
              </div>
            </div>

            <div style={{ ...S.dayLabel, marginTop: 22 }}><span style={S.dayLabelLine} />Scorul exact al finalei<span style={S.dayLabelLine} /></div>
            <div style={{ ...S.matchCard, ...T.matchCard }}>
              <div style={S.cardStripeGreen} />
              <div style={S.matchCardBody}>
                <div style={{ ...S.matchMeta, color: T.textMeta }}>Indiferent ce echipe joacă</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9 }}>
                  <div style={{ ...S.scoreboardWrap, ...T.scoreBoard }}>
                    {specialLocked ? (
                      <>
                        <div style={{ ...S.scoreDisplay, ...T.scoreBox }}>{myFinalScore.home !== '' ? myFinalScore.home : '–'}</div>
                        <span style={S.colon}>:</span>
                        <div style={{ ...S.scoreDisplay, ...T.scoreBox }}>{myFinalScore.away !== '' ? myFinalScore.away : '–'}</div>
                      </>
                    ) : (
                      <>
                        <input style={{ ...S.scoreInput, ...T.scoreInput }} type="number" min="0" max="20"
                          value={myFinalScore.home} placeholder="–"
                          onChange={e => updateLocalFinalScore('home', e.target.value)} />
                        <span style={S.colon}>:</span>
                        <input style={{ ...S.scoreInput, ...T.scoreInput }} type="number" min="0" max="20"
                          value={myFinalScore.away} placeholder="–"
                          onChange={e => updateLocalFinalScore('away', e.target.value)} />
                      </>
                    )}
                  </div>
                </div>
                {(() => {
                  const finalRes = results[63]
                  const hasFinalRes = finalRes && finalRes.home !== '' && finalRes.away !== ''
                  if (!hasFinalRes) return null
                  const sh = parseInt(myFinalScore.home), sa = parseInt(myFinalScore.away)
                  const rh = parseInt(finalRes.home), ra = parseInt(finalRes.away)
                  const exact = !isNaN(sh) && !isNaN(sa) && sh === rh && sa === ra
                  return (
                    <div style={{ ...S.resultRow, ...T.resultRow }}>
                      Rezultat final <b style={{ ...S.resultScore, color: T.textResult }}>{finalRes.home} – {finalRes.away}</b>
                      <span style={{ ...S.ptsBadge, ...(exact ? S.ptsBadgeGold : S.ptsBadgeZero) }}>+{exact ? 10 : 0}p</span>
                    </div>
                  )
                })()}
              </div>
            </div>

            <div style={{ ...S.dayLabel, marginTop: 22 }}><span style={S.dayLabelLine} />Campioana<span style={S.dayLabelLine} /></div>
            <div style={{ ...S.matchCard, ...T.matchCard }}>
              <div style={S.cardStripeBlue} />
              <div style={S.matchCardBody}>
                {specialLocked ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                      <span style={{ ...S.matchMeta, color: T.textMeta }}>Pronosticul tău</span>
                      <span style={S.lockBadge}>Blocat</span>
                    </div>
                    <div style={{ ...S.scoreDisplay2, ...T.scoreBox }}>{localSpecial.champion || '–'}</div>
                  </>
                ) : (
                  <>
                    <div style={{ ...S.matchMeta, color: T.textMeta }}>Cine câștigă Cupa Mondială</div>
                    <select style={{ ...S.selectInput, width: '100%', marginTop: 9 }} value={localSpecial.champion || ''} onChange={e => updateLocalChampion(e.target.value)}>
                      <option value="">Echipa campioană...</option>
                      {allTeams.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </>
                )}
                {specialResults.champion && (
                  <div style={{ ...S.resultRow, ...T.resultRow }}>
                    Campioana reală <b style={{ ...S.resultScore, color: T.textResult }}>{specialResults.champion}</b>
                    <span style={{ ...S.ptsBadge, ...(localSpecial.champion === specialResults.champion ? S.ptsBadgeGold : S.ptsBadgeZero) }}>
                      +{localSpecial.champion === specialResults.champion ? 10 : 0}p
                    </span>
                  </div>
                )}
              </div>
            </div>

            {!specialLocked && (
              <div style={{ textAlign: 'center', marginTop: 18, marginBottom: 32 }}>
                <button style={S.btnPrimary} onClick={saveSpecialPrediction} disabled={savingSpecial}>
                  {savingSpecial ? 'Se salvează...' : 'Salvează pronosticurile speciale'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ════ POOL-UL MEU ════ */}
        {view === 'mypool' && currentUser && (
          <div>
            <h2 style={{ ...S.pageTitle, color: T.text }}>Pool-ul meu</h2>
            <div style={{ ...S.infoBox, ...T.infoBox }}>Aici vezi doar meciurile la care ai pus deja un pronostic.</div>

            <div style={{ ...S.dayLabel, color: T.dayLabel.color }}><span style={S.dayLabelLine} />Jucate<span style={S.dayLabelLine} /></div>
            {myPlayedMatches.length === 0
              ? <p style={{ ...S.emptyMsg, marginBottom: 22 }}>Niciun meci jucat din pronosticurile tale încă.</p>
              : myPlayedMatches.map(m => {
                  const pred = predictions[currentUser.name][m.id]
                  const res  = results[m.id]
                  const pts  = calcScore(pred, res)
                  let cardStyle = { ...S.matchCard, ...T.matchCard }
                  let stripeStyle = S.cardStripeDefault
                  if (pts === 5) { cardStyle = { ...cardStyle, ...S.cardGold }; stripeStyle = S.cardStripeGold }
                  else if (pts === 3) { cardStyle = { ...cardStyle, ...S.cardBlue }; stripeStyle = S.cardStripeBlue }
                  else if (pts === 2) { cardStyle = { ...cardStyle, ...S.cardGreen }; stripeStyle = S.cardStripeGreen }
                  return (
                    <div key={m.id} style={cardStyle}>
                      <div style={stripeStyle} />
                      <div style={S.matchCardBody}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                          <span style={{ ...S.matchMeta, color: T.textMeta }}>{m.date} · {fmtHour(m.kickoff)} <span style={S.matchMetaDot}>•</span> <span style={{ ...S.matchGroup, color: T.textGroup }}>{m.group}</span></span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ ...S.teamName, color: T.teamName }}>{m.home}</span>
                          <div style={{ ...S.scoreboardWrap, ...T.scoreBoard }}>
                            <div style={{ ...S.scoreDisplay, ...T.scoreBox }}>{pred.home}</div>
                            <span style={S.colon}>:</span>
                            <div style={{ ...S.scoreDisplay, ...T.scoreBox }}>{pred.away}</div>
                          </div>
                          <span style={{ ...S.teamName, textAlign: 'right', color: T.teamName }}>{m.away}</span>
                        </div>
                        <div style={{ ...S.resultRow, ...T.resultRow }}>
                          Rezultat final <b style={{ ...S.resultScore, color: T.textResult }}>{res.home} – {res.away}</b>
                          <span style={{ ...S.ptsBadge, ...(pts===5?S.ptsBadgeGold:pts===3?S.ptsBadgeBlue:pts===2?S.ptsBadgeGreen:S.ptsBadgeZero) }}>
                            +{pts}p
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })
            }

            <div style={{ ...S.dayLabel, marginTop: 22 }}><span style={S.dayLabelLine} />Următoare<span style={S.dayLabelLine} /></div>
            {myUpcomingMatches.length === 0
              ? <p style={{ ...S.emptyMsg, color: T.textMeta }}>Niciun pronostic activ pentru meciurile viitoare.</p>
              : (
                <>
                  {myUpcomingMatches.map(m => {
                    const pred = localPreds[m.id] || { home: '', away: '' }
                    const locked = isLocked(m.kickoff)
                    return (
                      <div key={m.id} style={{ ...S.matchCard, ...T.matchCard, ...(locked ? S.cardLocked : {}) }}>
                        <div style={locked ? S.cardStripeLocked : S.cardStripeDefault} />
                        <div style={S.matchCardBody}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                            <span style={{ ...S.matchMeta, color: T.textMeta }}>{m.date} · {fmtHour(m.kickoff)} <span style={S.matchMetaDot}>•</span> <span style={{ ...S.matchGroup, color: T.textGroup }}>{m.group}</span></span>
                            {locked && <span style={S.lockBadge}>Blocat</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ ...S.teamName, color: T.teamName }}>{m.home}</span>
                            <div style={{ ...S.scoreboardWrap, ...T.scoreBoard }}>
                              {locked
                                ? <>
                                    <div style={{ ...S.scoreDisplay, ...T.scoreBox }}>{pred.home !== '' ? pred.home : '–'}</div>
                                    <span style={S.colon}>:</span>
                                    <div style={{ ...S.scoreDisplay, ...T.scoreBox }}>{pred.away !== '' ? pred.away : '–'}</div>
                                  </>
                                : <>
                                    <input style={{ ...S.scoreInput, ...T.scoreInput }} type="number" min="0" max="20"
                                      value={pred.home} placeholder="–"
                                      onChange={e => updateLocalPred(m.id, 'home', e.target.value)} />
                                    <span style={S.colon}>:</span>
                                    <input style={{ ...S.scoreInput, ...T.scoreInput }} type="number" min="0" max="20"
                                      value={pred.away} placeholder="–"
                                      onChange={e => updateLocalPred(m.id, 'away', e.target.value)} />
                                  </>
                              }
                            </div>
                            <span style={{ ...S.teamName, textAlign: 'right', color: T.teamName }}>{m.away}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div style={{ textAlign: 'center', marginTop: 14, marginBottom: 8 }}>
                    <button style={S.btnPrimary} onClick={savePredictions} disabled={saving}>
                      {saving ? 'Se salvează...' : 'Salvează modificările'}
                    </button>
                  </div>
                </>
              )
            }
          </div>
        )}

        {/* ════ CLASAMENT ════ */}
        {view === 'leaderboard' && (
          <div>
            <h2 style={{ ...S.pageTitle, color: T.text }}>Clasament</h2>

            {leaderboard.length === 0
              ? <p style={{ ...S.emptyMsg, color: T.textMeta }}>Niciun jucător înregistrat.</p>
              : (
                <>
                  {/* ── Jackpot Banner ── */}
                  <div className="wc-rise" style={{
                    animation: 'wcPrizeIn 0.5s cubic-bezier(0.22,1,0.36,1) both, wcGlow 3s ease-in-out 0.5s infinite',
                    background: 'linear-gradient(135deg, #17151a 0%, #1e1a10 50%, #17151a 100%)',
                    border: '1px solid rgba(212,175,55,0.45)',
                    borderRadius: 20,
                    padding: '22px 24px 18px',
                    textAlign: 'center',
                    marginBottom: 22,
                    position: 'relative',
                    overflow: 'hidden',
                  }}>
                    {/* shimmer line top */}
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                      background: 'linear-gradient(90deg, transparent 0%, #f4c430 30%, #fff8dc 50%, #f4c430 70%, transparent 100%)',
                      backgroundSize: '200% auto',
                      animation: 'wcShimmer 2.4s linear infinite',
                    }} />
                    {/* shimmer line bottom */}
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
                      background: 'linear-gradient(90deg, transparent 0%, #f4c430 30%, #fff8dc 50%, #f4c430 70%, transparent 100%)',
                      backgroundSize: '200% auto',
                      animation: 'wcShimmer 2.4s linear infinite reverse',
                    }} />

                    <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 3, color: '#9b8a3a', textTransform: 'uppercase', marginBottom: 10 }}>
                      🏆 &nbsp;JACKPOT
                    </div>

                    <div style={{
                      fontFamily: "'Oswald',sans-serif",
                      fontSize: 58,
                      fontWeight: 700,
                      letterSpacing: 1,
                      lineHeight: 1,
                      background: 'linear-gradient(180deg, #fff5b0 0%, #f4c430 40%, #c89a2e 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      animation: 'wcPrizePulse 2.8s ease-in-out infinite',
                      display: 'inline-block',
                      marginBottom: 8,
                    }}>
                      {(Object.keys(users).length * 50).toLocaleString('ro-RO')} <span style={{ fontSize: 32 }}>RON</span>
                    </div>

                    <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: '#7d7060', marginTop: 4, letterSpacing: 0.3 }}>
                      {Object.keys(users).length} participanți &nbsp;×&nbsp; 50 RON
                    </div>
                  </div>

                  {/* ── Podium top 3 ── */}
                  {leaderboard.length >= 1 && (() => {
                    const top = [leaderboard[1], leaderboard[0], leaderboard[2]].filter(Boolean)
                    const order = [1, 0, 2] // silver, gold, bronze display order
                    const heights = [80, 110, 60] // step heights px
                    const medals = ['🥈','🥇','🥉']
                    const avatarStyles = [S.avatarSilver, S.avatarGold, S.avatarBronze]
                    const ranks = [2, 1, 3]
                    return (
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 24, padding: '0 4px' }}>
                        {top.map((u, displayIdx) => {
                          const realIdx = leaderboard.indexOf(u)
                          const isGold = realIdx === 0
                          const isSilver = realIdx === 1
                          const stepH = isGold ? 110 : isSilver ? 80 : 60
                          const avatarSize = isGold ? 68 : 56
                          const isMe = u.name === currentUser?.name
                          return (
                            <div key={u.name} style={{
                              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                            }}>
                              {/* Avatar + name above platform */}
                              <div style={{ fontSize: isGold ? 22 : 18, marginBottom: 4 }}>
                                {isGold ? '🥇' : isSilver ? '🥈' : '🥉'}
                              </div>
                              <div style={{
                                width: avatarSize, height: avatarSize, lineHeight: `${avatarSize}px`,
                                borderRadius: '50%', margin: '0 auto 6px',
                                fontFamily: "'Oswald',sans-serif", fontWeight: 700,
                                fontSize: isGold ? 20 : 16,
                                textAlign: 'center',
                                boxShadow: isMe ? `0 0 0 3px ${T.gold}, 0 0 16px rgba(212,175,55,0.4)` : isGold ? '0 4px 16px rgba(212,175,55,0.35)' : '0 2px 8px rgba(0,0,0,0.3)',
                                ...(isGold ? S.avatarGold : isSilver ? S.avatarSilver : S.avatarBronze),
                              }}>
                                {u.name.slice(0,2).toUpperCase()}
                              </div>
                              <div style={{
                                fontSize: isGold ? 13.5 : 12, fontWeight: 700,
                                color: T.podiumName, textAlign: 'center',
                                maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                marginBottom: 2,
                              }}>
                                {u.name}{isMe ? ' 👤' : ''}
                              </div>
                              <div style={{
                                fontFamily: "'Oswald',sans-serif", fontSize: isGold ? 18 : 15,
                                fontWeight: 700, color: T.gold, marginBottom: 6,
                              }}>
                                {u.total}<small style={{ fontSize: 10, fontWeight: 400, marginLeft: 2, opacity: 0.7 }}>p</small>
                              </div>
                              {/* Platform / step */}
                              <div style={{
                                width: '100%', height: stepH,
                                borderRadius: '10px 10px 0 0',
                                background: isGold
                                  ? 'linear-gradient(180deg, #3a3020 0%, #252010 100%)'
                                  : isDark
                                    ? 'linear-gradient(180deg, #26262e 0%, #1c1c22 100%)'
                                    : 'linear-gradient(180deg, #ede5d0 0%, #e0d4b8 100%)',
                                border: isGold
                                  ? '1px solid rgba(212,175,55,0.45)'
                                  : isDark ? '1px solid rgba(245,241,232,0.1)' : '1px solid #d4c4a0',
                                borderBottom: 'none',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: isGold ? '0 -2px 12px rgba(212,175,55,0.15)' : 'none',
                              }}>
                                <span style={{
                                  fontFamily: "'Oswald',sans-serif",
                                  fontSize: isGold ? 32 : 24,
                                  fontWeight: 700,
                                  color: isGold ? 'rgba(212,175,55,0.25)' : isDark ? 'rgba(245,241,232,0.06)' : 'rgba(0,0,0,0.06)',
                                }}>
                                  {isGold ? '1' : isSilver ? '2' : '3'}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}

                  {/* ── Tabel clasament complet ── */}
                  <div style={S.lbTableWrap}>
                    <div style={{ ...S.lbTableHead, ...T.lbTableHead }}>
                      <span style={S.lbColRank}>#</span>
                      <span style={S.lbColName}>Jucător</span>
                      <span style={S.lbColExact}>Exacte</span>
                      <span style={S.lbColPts}>Puncte</span>
                    </div>
                    {leaderboard.map((u, i) => (
                      <div key={u.name} style={{ ...S.lbTableRow, ...(u.name===currentUser?.name ? S.lbRowMe : {}) }}>
                        <span style={S.lbValRank}>{i+1}</span>
                        <span style={S.lbValName}>
                          <span style={{ ...S.lbAvatarSm, ...(i===0?S.avatarGold:i===1?S.avatarSilver:i===2?S.avatarBronze:S.avatarDefault) }}>
                            {u.name.slice(0,2).toUpperCase()}
                          </span>
                          <span style={{ color: '#f5f1e8', fontWeight: u.name===currentUser?.name ? 700 : 600 }}>
                            {u.name}{u.name===currentUser?.name?<span style={S.lbYou}>tu</span>:null}
                          </span>
                        </span>
                        <span style={S.lbValExact}>{u.exact}</span>
                        <span style={S.lbValPts}>{u.total}</span>
                      </div>
                    ))}
                  </div>
                </>
              )
            }

            <h3 style={{ ...S.pageTitle, fontSize: 15, marginBottom: 8, marginTop: 28 }}>Pronosticuri detaliate</h3>
            <div style={{ ...S.infoBox, ...T.infoBox }}>Pronosticurile devin vizibile pentru toți după blocarea meciului.</div>
            <div className="wc-scroll" style={{ overflowX: 'auto', marginTop: 12, borderRadius: 16, border: '1px solid rgba(212,175,55,0.18)', maxHeight: '60vh', overflowY: 'auto' }}>
              <table style={S.table}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    <th style={{ ...S.th, ...T.th, ...T.th }}>Meci</th>
                    <th style={{ ...S.th, ...T.th, textAlign: 'center', color: '#d4af37' }}>Rezultat</th>
                    {orderedUserNames.map(u => (
                      <th key={u} style={{ ...S.th, ...T.th, textAlign: 'center', ...(u===currentUser?.name ? S.thMe : {}) }}>
                        {u}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedMatches.map(m => {
                    const locked = isLocked(m.kickoff)
                    const res = results[m.id]
                    const hasRes = res && res.home !== '' && res.away !== ''
                    return (
                      <tr key={m.id} style={S.tr}>
                        <td style={{ ...S.td, ...T.td, minWidth: 140 }}>
                          <div style={S.tdMatch}>{m.home} <span style={S.tdVs}>vs</span> {m.away}</div>
                          <div style={{ ...S.tdMeta, color: locked ? '#e0717c' : '#7d7d86' }}>
                            {locked ? '● blocat' : '○ deschis'} &nbsp;{m.date} {fmtHour(m.kickoff)}
                          </div>
                        </td>
                        <td style={{ ...S.td, ...T.td, textAlign: 'center', fontWeight: 700, color: '#d4af37' }}>
                          {hasRes ? `${res.home}–${res.away}` : <span style={S.tdDash}>–</span>}
                        </td>
                        {orderedUserNames.map(u => {
                          const p = predictions[u]?.[m.id]
                          const hasPred = p && p.home !== '' && p.away !== ''
                          const pts = hasPred && hasRes ? calcScore(p, res) : null
                          const isMe = u === currentUser?.name
                          return (
                            <td key={u} style={{ ...S.td, ...T.td, textAlign: 'center',
                              ...(isMe ? S.tdMe : {}),
                              color: pts===5?'#d4af37':pts===3?'#5b9bd5':pts===2?'#52b788':'inherit',
                              fontWeight: pts ? 700 : 400 }}>
                              {(locked || isMe)
                                ? hasPred ? `${p.home}–${p.away}` : <span style={S.tdDash}>–</span>
                                : hasPred ? <span style={S.tdLockIcon} title="Pronostic pus, ascuns până la blocare">🔒</span> : <span style={S.tdDash}>–</span>
                              }
                              {pts !== null && (locked || isMe) && (
                                <div style={S.tdPts}>({pts}p)</div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ════ ADMIN ════ */}
        {view === 'admin' && (
          <div>
            <h2 style={{ ...S.pageTitle, color: T.text }}>Panou Admin</h2>
            {!adminMode ? (
              <div style={{ ...S.card, maxWidth: 400 }}>
                <div style={S.cardCrest}>🔑</div>
                <p style={{ ...S.cardSub, color: T.textSub }}>Introdu parola de admin pentru a introduce rezultate.</p>
                <input style={{ ...S.input, ...T.input }} type="password" placeholder="Parolă admin"
                  value={adminInput} onChange={e => setAdminInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdminLogin()} />
                <button style={S.btnPrimary} onClick={handleAdminLogin}>Intră ca Admin</button>
              </div>
            ) : (
              <div>
                <div style={{ ...S.dayLabel, color: T.dayLabel.color }}><span style={S.dayLabelLine} />Finaliști și campioană (pronosticuri speciale)<span style={S.dayLabelLine} /></div>
                <div style={S.adminMatchCard}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <select style={{ ...S.selectInput, ...T.input }} value={localSpecialResults.finalists[0] || ''} onChange={e => updateLocalSpecialResultFinalist(0, e.target.value)}>
                      <option value="">Finalista 1...</option>
                      {allTeams.map(t => <option key={t} value={t} disabled={t === localSpecialResults.finalists[1]}>{t}</option>)}
                    </select>
                    <select style={{ ...S.selectInput, ...T.input }} value={localSpecialResults.finalists[1] || ''} onChange={e => updateLocalSpecialResultFinalist(1, e.target.value)}>
                      <option value="">Finalista 2...</option>
                      {allTeams.map(t => <option key={t} value={t} disabled={t === localSpecialResults.finalists[0]}>{t}</option>)}
                    </select>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <select style={{ ...S.selectInput, width: '100%' }} value={localSpecialResults.champion || ''} onChange={e => updateLocalSpecialResultChampion(e.target.value)}>
                      <option value="">Campioana...</option>
                      {allTeams.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div style={{ textAlign: 'center', marginTop: 14 }}>
                    <button style={S.btnAdminSave} onClick={saveSpecialResults}>Salvează finaliștii și campioana</button>
                  </div>
                </div>

                <div style={{ ...S.infoBox, marginTop: 22 }}>Introdu scorurile finale. Punctajele se calculează automat.</div>
                {Object.entries(matchesByDay).map(([day, dayMatches]) => (
                  <div key={day} style={{ marginBottom: 22 }}>
                    <div style={{ ...S.dayLabel, color: T.dayLabel.color }}><span style={S.dayLabelLine} />{day}<span style={S.dayLabelLine} /></div>
                    {dayMatches.map(m => {
                      const res = localResults[m.id] || { home: '', away: '' }
                      return (
                        <div key={m.id} style={S.adminMatchCard}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                            <span style={{ ...S.matchMeta, color: T.textMeta }}>{fmtHour(m.kickoff)} <span style={S.matchMetaDot}>•</span> <span style={{ ...S.matchGroup, color: T.textGroup }}>{m.group}</span></span>
                            {isLocked(m.kickoff) && <span style={S.lockBadge}>Blocat</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ ...S.teamName, fontSize: 12 }}>{m.home}</span>
                            <div style={{ ...S.scoreboardWrap, ...T.scoreBoard }}>
                              <input style={{ ...S.scoreInputAdmin, ...T.scoreInput }}
                                type="number" min="0" max="20" value={res.home} placeholder="–"
                                onChange={e => updateLocalResult(m.id, 'home', e.target.value)} />
                              <span style={S.colon}>:</span>
                              <input style={{ ...S.scoreInputAdmin, ...T.scoreInput }}
                                type="number" min="0" max="20" value={res.away} placeholder="–"
                                onChange={e => updateLocalResult(m.id, 'away', e.target.value)} />
                            </div>
                            <span style={{ ...S.teamName, textAlign: 'right', fontSize: 12 }}>{m.away}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
                <div style={{ textAlign: 'center', marginTop: 8, marginBottom: 32 }}>
                  <button style={S.btnAdminSave} onClick={saveResults}>
                    Salvează toate rezultatele
                  </button>
                </div>
              </div>
            )}
          </div>
        )}


      </main>


      {/* ── FLOATING CHAT ── */}
      {currentUser && (
        <>
          {/* Chat window */}
          {chatOpen && (
            <div style={{
              position: 'fixed', bottom: 80, right: 16, zIndex: 300,
              width: 'min(360px, calc(100vw - 32px))',
              height: 'min(480px, calc(100vh - 120px))',
              background: '#17171c',
              border: '1px solid rgba(212,175,55,0.3)',
              borderRadius: 20,
              boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,175,55,0.1)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
              animation: 'wcPrizeIn 0.25s cubic-bezier(0.22,1,0.36,1) both',
            }}>
              {/* Header */}
              <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(212,175,55,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#1e1e24',
                flexShrink: 0,
              }}>
                <span style={{ fontFamily: "'Oswald',sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: 1, color: '#f0b429', textTransform: 'uppercase' }}>
                  💬 Chat — Pariorii de la APE
                </span>
                <button onClick={() => setChatOpen(false)} style={{
                  background: 'rgba(245,241,232,0.06)', border: 'none',
                  color: '#9b9ba3', fontSize: 16, width: 28, height: 28,
                  borderRadius: 8, cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                }}>✕</button>
              </div>

              {/* Messages */}
              <div className="wc-scroll" style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: 3 }}
                ref={el => { if (el) el.scrollTop = el.scrollHeight }}>
                {messages.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#46464d', marginTop: 40, fontSize: 13 }}>
                    Niciun mesaj încă. Fii primul! 👋
                  </div>
                )}
                {messages.map((msg, i) => {
                  const isMe = msg.user === currentUser.name
                  const showName = i === 0 || messages[i-1].user !== msg.user
                  const time = msg.ts ? new Date(msg.ts).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }) : ''
                  return (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', marginBottom: 2 }}>
                      {showName && (
                        <div style={{ fontSize: 10, color: '#5a5a62', marginBottom: 2, marginLeft: isMe ? 0 : 4, marginRight: isMe ? 4 : 0, fontFamily: "'Oswald',sans-serif", letterSpacing: 0.5 }}>
                          {isMe ? 'Tu' : msg.user} · {time}
                        </div>
                      )}
                      <div style={{
                        maxWidth: '80%', padding: '7px 12px',
                        borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: isMe ? 'linear-gradient(135deg,#d4af37,#b8922a)' : '#26262e',
                        border: isMe ? 'none' : '1px solid rgba(245,241,232,0.06)',
                        color: isMe ? '#0a0a0c' : '#f5f1e8',
                        fontSize: 13, fontWeight: isMe ? 600 : 400,
                        lineHeight: 1.45, wordBreak: 'break-word',
                      }}>
                        {msg.text}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Input */}
              <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(212,175,55,0.1)', display: 'flex', gap: 8, flexShrink: 0, background: '#1a1a20' }}>
                <input
                  style={{ flex: 1, padding: '9px 13px', borderRadius: 10, border: '1px solid rgba(212,175,55,0.25)', background: '#15151a', color: '#f5f1e8', fontSize: 13, outline: 'none', fontFamily: "'Inter',sans-serif" }}
                  placeholder="Scrie un mesaj..."
                  value={chatInput}
                  maxLength={500}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  autoFocus
                />
                <button onClick={sendMessage} style={{
                  background: 'linear-gradient(135deg,#d4af37,#b8922a)',
                  border: 'none', borderRadius: 10, padding: '9px 14px',
                  color: '#0a0a0c', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', flexShrink: 0, fontFamily: "'Oswald',sans-serif",
                  letterSpacing: 0.5,
                }}>↑</button>
              </div>
            </div>
          )}

          {/* FAB button */}
          <button
            onClick={toggleChat}
            style={{
              position: 'fixed', bottom: 16, right: 16, zIndex: 301,
              width: 52, height: 52, borderRadius: '50%',
              background: chatOpen
                ? '#26262e'
                : 'linear-gradient(135deg,#d4af37,#b8922a)',
              border: chatOpen ? '1px solid rgba(212,175,55,0.3)' : 'none',
              boxShadow: chatOpen
                ? '0 4px 16px rgba(0,0,0,0.4)'
                : '0 4px 20px rgba(212,175,55,0.4), 0 2px 8px rgba(0,0,0,0.3)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22,
              transition: 'all 0.2s ease',
            }}
          >
            {chatOpen ? '✕' : '💬'}
            {!chatOpen && unread > 0 && (
              <span className="wc-pulse-dot" style={{
                position: 'absolute', top: 2, right: 2,
                width: 10, height: 10, borderRadius: '50%',
                background: '#e0717c',
                border: '2px solid #17171c',
                animation: 'wcPulse 1.2s ease-in-out infinite',
              }} />
            )}
          </button>
        </>
      )}
      <footer style={{ ...S.footer, ...T.footer }}>
        <span style={S.footerBall}>⚽</span> World Cup 2026 Pronosticuri <span style={S.footerDot}>•</span> developed by <b style={S.footerName}>Adrian Barbos</b>
      </footer>
    </div>
  )
}

// ─── TEME ────────────────────────────────────────────────────────────────────
const DARK = {
  root:       { background: 'radial-gradient(ellipse 1000px 600px at 50% -10%, rgba(212,175,55,0.05), transparent 60%), linear-gradient(180deg, #17171c 0%, #1c1c22 100%)', color: '#f5f1e8' },
  header:     { background: 'rgba(23,23,28,0.92)', borderBottom: '1px solid rgba(212,175,55,0.18)' },
  headerLine: { background: 'linear-gradient(90deg, transparent, #d4af37 20%, #f0d878 50%, #d4af37 80%, transparent)' },
  card:       { background: '#1e1e24', border: '1px solid rgba(212,175,55,0.2)' },
  input:      { background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(245,241,232,0.14)', color: '#f5f1e8' },
  matchCard:  { background: '#1e1e24', border: '1px solid rgba(245,241,232,0.06)' },
  infoBox:    { background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.16)', color: '#9b9ba3' },
  text:       '#f5f1e8',
  textSub:    '#8a8a93',
  textMuted:  '#5a5a62',
  gold:       '#f0b429',
  navBg:      'transparent',
  lbRow:      { background: '#1e1e24', border: '1px solid rgba(245,241,232,0.07)' },
  lbRowMe:    { background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.22)' },
  th:         { background: '#17171c', color: '#8a8a93', borderBottom: '1px solid rgba(212,175,55,0.18)' },
  td:         { borderBottom: '1px solid rgba(245,241,232,0.05)' },
  dayLabel:   { color: '#f0b429' },
  footer:     { borderTop: '1px solid rgba(212,175,55,0.1)', color: '#5a5a62' },
  adminCard:  { background: '#1a1a1f', border: '1px solid rgba(245,241,232,0.07)' },
  teamName:   '#f5f1e8',
  textCard:   '#f5f1e8',
  textMeta:   '#7d7d86',
  textGroup:  '#5a5a62',
  textResult: '#f5f1e8',
  scoreBoard: { background: '#15151a', border: '1px solid rgba(212,175,55,0.15)' },
  scoreBox:   { background: '#15151a', border: '1px solid rgba(245,241,232,0.08)', color: '#8a8a93' },
  scoreInput: { background: '#15151a', border: '1px solid rgba(212,175,55,0.3)', color: '#f0b429' },
  resultRow:  { borderTop: '1px solid rgba(245,241,232,0.05)', color: '#7d7d86' },
  podiumCard: { background: '#1e1e24', border: '1px solid rgba(245,241,232,0.07)' },
  podiumName: '#f5f1e8',
  lbTableHead:{ background: '#15151a', borderBottom: '1px solid rgba(245,241,232,0.06)' },
  lbTableRow: { borderBottom: '1px solid rgba(245,241,232,0.05)' },
  lbRowName:  '#f5f1e8',
}

const LIGHT = {
  root:       { background: 'linear-gradient(160deg, #faf6ef 0%, #f0ead8 100%)', color: '#1a1208' },
  header:     { background: 'rgba(255,252,245,0.96)', borderBottom: '1px solid rgba(184,146,42,0.25)' },
  headerLine: { background: 'linear-gradient(90deg, transparent, #b8922a 20%, #d4af37 50%, #b8922a 80%, transparent)' },
  card:       { background: '#fffdf7', border: '1px solid rgba(184,146,42,0.22)' },
  input:      { background: '#fff', border: '1px solid #e0d4b8', color: '#1a1208' },
  matchCard:  { background: '#fffdf7', border: '1px solid #ece3d0' },
  infoBox:    { background: 'rgba(184,146,42,0.06)', border: '1px solid rgba(184,146,42,0.2)', color: '#7a6a4a' },
  text:       '#1a1208',
  textSub:    '#7a6a4a',
  textMuted:  '#a08a5a',
  gold:       '#b8922a',
  navBg:      'transparent',
  lbRow:      { background: '#fffdf7', border: '1px solid #ece3d0' },
  lbRowMe:    { background: 'rgba(184,146,42,0.08)', border: '1px solid rgba(184,146,42,0.3)' },
  th:         { background: '#f5ede0', color: '#7a6a4a', borderBottom: '1px solid rgba(184,146,42,0.2)' },
  td:         { borderBottom: '1px solid #f0e8d8' },
  dayLabel:   { color: '#b8922a' },
  footer:     { borderTop: '1px solid #e8dcc8', color: '#a08a5a' },
  adminCard:  { background: '#faf5ec', border: '1px solid #ece3d0' },
  teamName:   '#1a1208',
  textCard:   '#1a1208',
  textMeta:   '#9a8a6a',
  textGroup:  '#b09060',
  textResult: '#1a1208',
  scoreBoard: { background: '#f5ede0', border: '1px solid rgba(184,146,42,0.2)' },
  scoreBox:   { background: '#f5ede0', border: '1px solid #e0d0b0', color: '#7a6a4a' },
  scoreInput: { background: '#fff', border: '1px solid rgba(184,146,42,0.4)', color: '#b8922a' },
  resultRow:  { borderTop: '1px solid #e8dcc8', color: '#9a8a6a' },
  podiumCard: { background: '#fffdf7', border: '1px solid #ece3d0' },
  podiumName: '#1a1208',
  lbTableHead:{ background: '#f5ede0', borderBottom: '1px solid #e8dcc8' },
  lbTableRow: { borderBottom: '1px solid #f0e8d8' },
  lbRowName:  '#1a1208',
}

// ─── STILURI ─────────────────────────────────────────────────────────────────
const S = {
  // ── Bază / fundal negru, odihnitor (ca în model) ──
  root: {
    minHeight: '100vh',
    background: `
      radial-gradient(ellipse 1000px 600px at 50% -10%, rgba(212,175,55,0.05), transparent 60%),
      linear-gradient(180deg, #17171c 0%, #1c1c22 100%)
    `,
    fontFamily: "'Inter',system-ui,sans-serif",
    color: '#f5f1e8',
  },

  // ── Header ──
  header: { background: 'rgba(23,23,28,0.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(212,175,55,0.18)', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 4px 24px rgba(0,0,0,0.35)' },
  headerTopLine: { height: 3, background: 'linear-gradient(90deg, transparent, #d4af37 20%, #f0d878 50%, #d4af37 80%, transparent)' },
  headerInner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 20px' },
  logo: { display: 'flex', alignItems: 'center', gap: 12 },
  logoMark: { width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#22222a', border: '1px solid rgba(212,175,55,0.4)', borderRadius: '50%', boxShadow: 'inset 0 0 10px rgba(0,0,0,0.4)' },
  logoTitle: { fontFamily: "'Oswald',sans-serif", fontSize: 16, fontWeight: 600, letterSpacing: 1.5, color: '#f5f1e8', textTransform: 'uppercase' },
  logoYear: { color: '#d4af37' },
  logoSub: { fontSize: 11, color: '#8a8a93', letterSpacing: 0.3 },
  userBadge: { fontFamily: "'Oswald',sans-serif", background: 'rgba(212,175,55,0.12)', color: '#f0b429', border: '1px solid rgba(212,175,55,0.35)', padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, letterSpacing: 0.8, textTransform: 'uppercase' },
  btnGhost: { background: 'transparent', color: '#8a8a93', border: '1px solid rgba(245,241,232,0.16)', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 500, letterSpacing: 0.4 },
  navWrap: { display: 'flex', gap: 2, padding: '0 16px 0', overflowX: 'auto' },
  navBtn: { fontFamily: "'Oswald',sans-serif", background: 'transparent', color: '#8a8a93', border: 'none', borderBottom: '2px solid transparent', padding: '9px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 500, letterSpacing: 0.8, textTransform: 'uppercase', whiteSpace: 'nowrap' },
  navActive: { color: '#f0b429', borderBottom: '2px solid #f0b429' },

  // ── Toast ──
  toast: { position: 'fixed', top: 18, right: 18, zIndex: 999, color: '#f5f1e8', padding: '11px 22px', borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.6)', fontSize: 13.5, fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)' },

  main: { maxWidth: 820, margin: '0 auto', padding: '28px 16px 60px' },
  center: { display: 'flex', justifyContent: 'center', paddingTop: 40 },

  // ── Card login/admin ──
  card: { background: '#1e1e24', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 20, padding: '36px 30px', textAlign: 'center', width: '100%', maxWidth: 420, boxShadow: '0 20px 50px rgba(0,0,0,0.5)' },
  cardCrest: { width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', background: '#22222a', border: '1px solid rgba(212,175,55,0.4)', borderRadius: '50%', boxShadow: 'inset 0 0 14px rgba(0,0,0,0.5)' },
  cardTitle: { fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 600, marginBottom: 4, color: '#f5f1e8', letterSpacing: 1, textTransform: 'uppercase' },
  cardDivider: { width: 40, height: 2, background: '#f0b429', margin: '10px auto 18px', opacity: 0.8 },
  cardSub: { fontSize: 14, color: '#9b9ba3', marginBottom: 18, lineHeight: 1.5 },
  cardSubAccent: { color: '#f0b429' },

  input: { width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(245,241,232,0.14)', background: 'rgba(0,0,0,0.3)', color: '#f5f1e8', fontSize: 14, outline: 'none', marginBottom: 12, boxSizing: 'border-box', fontFamily: "'Inter',sans-serif" },
  errMsg: { color: '#e0717c', fontSize: 13, marginBottom: 10, textAlign: 'left' },
  btnPrimary: { fontFamily: "'Oswald',sans-serif", background: 'linear-gradient(135deg,#f4c430,#d49a1f)', color: '#0a0a0c', fontWeight: 600, border: 'none', padding: '13px 28px', borderRadius: 10, cursor: 'pointer', fontSize: 14, width: '100%', letterSpacing: 1, textTransform: 'uppercase', boxShadow: '0 6px 18px rgba(240,180,41,0.22)' },
  btnAdminSave: { fontFamily: "'Oswald',sans-serif", background: '#22222a', color: '#f5f1e8', fontWeight: 600, border: '1px solid rgba(212,175,55,0.3)', padding: '13px 30px', borderRadius: 10, cursor: 'pointer', fontSize: 14, letterSpacing: 1, textTransform: 'uppercase', boxShadow: '0 6px 18px rgba(0,0,0,0.4)' },

  pageTitle: { fontFamily: "'Oswald',sans-serif", fontSize: 19, fontWeight: 600, color: '#f5f1e8', marginBottom: 16, letterSpacing: 0.8, textTransform: 'uppercase' },

  // ── Info box ──
  infoBox: { background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.16)', borderRadius: 12, padding: '10px 16px', fontSize: 12.5, color: '#9b9ba3', marginBottom: 16, lineHeight: 1.7 },
  infoPt: { color: '#9b9ba3' },
  infoPtGold: { color: '#f0b429' },
  infoPtBlue: { color: '#7fb3e0' },
  infoPtGreen: { color: '#6fcf9c' },
  infoDot: { margin: '0 8px', color: 'rgba(212,175,55,0.4)' },

  // ── Day label ──
  dayLabel: { fontFamily: "'Oswald',sans-serif", display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, fontWeight: 500, letterSpacing: 2.5, color: '#f0b429', textTransform: 'uppercase', marginBottom: 10 },
  dayLabelLine: { flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(212,175,55,0.3), transparent)' },

  // ── Match card (scoreboard) ──
  matchCard: { position: 'relative', display: 'flex', background: '#1e1e24', border: '1px solid rgba(245,241,232,0.06)', borderRadius: 16, marginBottom: 8, overflow: 'hidden' },
  matchCardBody: { flex: 1, padding: '11px 14px 11px 12px' },
  cardStripeDefault: { width: 4, background: 'rgba(245,241,232,0.07)', flexShrink: 0 },
  cardStripeGold:   { width: 4, background: 'linear-gradient(180deg,#f4c430,#c89a2e)', flexShrink: 0 },
  cardStripeBlue:   { width: 4, background: 'linear-gradient(180deg,#7fb3e0,#3a7ab0)', flexShrink: 0 },
  cardStripeGreen:  { width: 4, background: 'linear-gradient(180deg,#6fcf9c,#2f9e64)', flexShrink: 0 },
  cardStripeLocked: { width: 4, background: 'rgba(224,113,124,0.4)', flexShrink: 0 },
  cardGold:   { background: 'rgba(212,175,55,0.06)', borderColor: 'rgba(212,175,55,0.35)' },
  cardBlue:   { background: 'rgba(127,179,224,0.06)', borderColor: 'rgba(127,179,224,0.28)' },
  cardGreen:  { background: 'rgba(111,207,156,0.06)', borderColor: 'rgba(111,207,156,0.28)' },
  cardLocked: { background: '#1a1a1f', borderColor: 'rgba(224,113,124,0.14)' },

  matchMeta: { fontFamily: "'Oswald',sans-serif", fontSize: 11, letterSpacing: 0.5 },
  matchMetaDot: { color: 'rgba(212,175,55,0.5)' },
  matchGroup: {},
  teamName: { flex: 1, fontSize: 13.5, fontWeight: 600, lineHeight: 1.3 },

  scoreboardWrap: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: '4px 7px', borderRadius: 10 },
  scoreInput: { width: 38, height: 36, textAlign: 'center', borderRadius: 8, fontSize: 18, fontWeight: 700, outline: 'none', fontFamily: "'Oswald',monospace", padding: 0 },
  scoreInputAdmin: { width: 36, height: 32, textAlign: 'center', borderRadius: 8, fontSize: 16, fontWeight: 700, outline: 'none', fontFamily: "'Oswald',monospace", padding: 0 },
  scoreDisplay: { width: 38, height: 36, textAlign: 'center', lineHeight: '36px', borderRadius: 8, fontSize: 18, fontWeight: 700, fontFamily: "'Oswald',monospace" },
  scoreDisplay2: { flex: 1, padding: '10px 14px', textAlign: 'center', borderRadius: 8, fontSize: 13.5, fontWeight: 600 },
  selectInput: { flex: 1, minWidth: 150, padding: '11px 12px', borderRadius: 8, fontSize: 13.5, outline: 'none', fontFamily: "'Inter',sans-serif" },
  colon: { fontSize: 16, color: 'rgba(212,175,55,0.5)', flexShrink: 0, fontFamily: "'Oswald',sans-serif" },

  resultRow: { marginTop: 9, paddingTop: 9, fontSize: 12, display: 'flex', alignItems: 'center', gap: 10 },
  resultScore: { fontFamily: "'Oswald',monospace", fontSize: 13 },

  ptsBadge: { fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 11, padding: '2px 9px', borderRadius: 20, letterSpacing: 0.5 },
  ptsBadgeGold:  { color: '#0a0a0c', background: 'linear-gradient(135deg,#f4c430,#c89a2e)' },
  ptsBadgeBlue:  { color: '#0a0a0c', background: 'linear-gradient(135deg,#a8d0f0,#5b9bd5)' },
  ptsBadgeGreen: { color: '#0a0a0c', background: 'linear-gradient(135deg,#9fe6c0,#52b788)' },
  ptsBadgeZero:  { color: '#cdd0d6', background: 'rgba(245,241,232,0.1)' },

  lockBadge: { fontFamily: "'Oswald',sans-serif", fontSize: 10.5, fontWeight: 600, color: '#e0717c', background: 'rgba(224,113,124,0.12)', border: '1px solid rgba(224,113,124,0.3)', padding: '2px 9px', borderRadius: 8, letterSpacing: 0.8, textTransform: 'uppercase' },
  timerBadge: { display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: "'Oswald',sans-serif", fontSize: 10.5, fontWeight: 600, color: '#f0b429', background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', padding: '2px 9px', borderRadius: 8, letterSpacing: 0.5 },
  liveDot: { width: 6, height: 6, borderRadius: '50%', background: '#f0b429', display: 'inline-block' },

  emptyMsg: { fontStyle: 'italic', fontSize: 13.5 },

  // ── Podium top 3 (ca în model) ──
  podiumWrap: { display: 'flex', gap: 10, marginBottom: 22 },
  podiumCard: { flex: 1, borderRadius: 18, padding: '18px 10px 14px', textAlign: 'center', position: 'relative' },
  podiumMe: { border: '1px solid rgba(240,180,41,0.55)', boxShadow: '0 0 0 1px rgba(240,180,41,0.25), 0 10px 24px rgba(240,180,41,0.08)' },
  podiumAvatar: { width: 52, height: 52, lineHeight: '52px', borderRadius: '50%', margin: '0 auto 10px', fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 16, border: '2px solid rgba(245,241,232,0.1)' },
  avatarGold:   { background: 'linear-gradient(135deg,#f4c430,#c89a2e)', color: '#0a0a0c', borderColor: 'rgba(244,196,48,0.5)' },
  avatarSilver: { background: 'linear-gradient(135deg,#e4e8e6,#aab2af)', color: '#0a0a0c', borderColor: 'rgba(200,205,202,0.5)' },
  avatarBronze: { background: 'linear-gradient(135deg,#dba36e,#a06a3e)', color: '#0a0a0c', borderColor: 'rgba(219,163,110,0.5)' },
  avatarDefault: { background: '#26262e', color: '#cdd0d6', borderColor: 'rgba(245,241,232,0.08)' },
  podiumName: { fontSize: 13, fontWeight: 600, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  podiumScore: { fontFamily: "'Oswald',monospace", fontSize: 20, fontWeight: 700, color: '#f0b429' },
  podiumScoreUnit: { fontSize: 11, fontWeight: 400, color: '#9b9ba3', marginLeft: 2, fontFamily: "'Inter',sans-serif" },
  podiumRank: { position: 'absolute', top: 8, left: 10, fontFamily: "'Oswald',sans-serif", fontSize: 10.5, fontWeight: 700, color: '#5a5a62' },

  // ── Tabel clasament (ca în model: # / Jucător / Exacte / Puncte) ──
  lbTableWrap: { border: '1px solid rgba(245,241,232,0.07)', borderRadius: 16, overflow: 'hidden', marginBottom: 28 },
  lbTableHead: { display: 'flex', alignItems: 'center', padding: '11px 16px' },
  lbColRank: { width: 28, fontFamily: "'Oswald',sans-serif", fontSize: 10.5, fontWeight: 600, color: '#7d7d86', letterSpacing: 0.6, textTransform: 'uppercase' },
  lbColName: { flex: 1, display: 'flex', alignItems: 'center', gap: 10, fontFamily: "'Oswald',sans-serif", fontSize: 10.5, fontWeight: 600, color: '#7d7d86', letterSpacing: 0.6, textTransform: 'uppercase' },
  lbColExact: { width: 64, textAlign: 'center', fontFamily: "'Oswald',sans-serif", fontSize: 10.5, fontWeight: 600, color: '#7d7d86', letterSpacing: 0.6, textTransform: 'uppercase' },
  lbColPts: { width: 70, textAlign: 'right', fontFamily: "'Oswald',sans-serif", fontSize: 12, fontWeight: 700, color: '#f0b429', letterSpacing: 0.6, textTransform: 'uppercase' },
  lbValRank: { width: 28, fontFamily: "'Oswald',monospace", fontSize: 14, fontWeight: 700, color: '#f0b429' },
  lbValName: { flex: 1, display: 'flex', alignItems: 'center', gap: 10 },
  lbValExact: { width: 64, textAlign: 'center', fontFamily: "'Oswald',monospace", fontSize: 13, fontWeight: 600, color: '#9b9ba3' },
  lbValPts: { width: 70, textAlign: 'right', fontFamily: "'Oswald',monospace", fontSize: 18, fontWeight: 700, color: '#f0b429' },
  lbTableRow: { display: 'flex', alignItems: 'center', padding: '13px 16px', background: '#1e1e24', borderBottom: '1px solid rgba(245,241,232,0.05)' },
  lbRowMe: { background: '#23211a', boxShadow: 'inset 0 0 0 1.5px #f0b429' },
  lbAvatarSm: { width: 28, height: 28, lineHeight: '28px', borderRadius: '50%', textAlign: 'center', fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 10.5, flexShrink: 0 },
  lbYou: { fontFamily: "'Oswald',sans-serif", fontSize: 9, color: '#f0b429', background: 'rgba(10,10,12,0.15)', padding: '1px 6px', borderRadius: 6, marginLeft: 8, letterSpacing: 0.6, textTransform: 'uppercase', verticalAlign: 'middle' },

  // ── Tabel detaliat (Pronosticuri) ──
  table: { width: '100%', borderCollapse: 'collapse', background: '#1e1e24', fontSize: 12 },
  th: { fontFamily: "'Oswald',sans-serif", background: '#15151a', padding: '9px 10px', textAlign: 'left', color: '#9b9ba3', fontWeight: 500, letterSpacing: 0.6, borderBottom: '1px solid rgba(212,175,55,0.18)', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: 10.5 },
  thMe: { boxShadow: 'inset 0 2px 0 0 #f0b429, inset 2px 0 0 0 rgba(240,180,41,0.4), inset -2px 0 0 0 rgba(240,180,41,0.4)', color: '#f0b429' },
  tdMe: { boxShadow: 'inset 2px 0 0 0 rgba(240,180,41,0.4), inset -2px 0 0 0 rgba(240,180,41,0.4)' },
  tr: {},
  td: { padding: '8px 10px', borderBottom: '1px solid rgba(245,241,232,0.04)', verticalAlign: 'middle' },
  tdMatch: { fontWeight: 600, fontSize: 11.5, color: '#f5f1e8' },
  tdVs: { color: '#5a5a62', fontWeight: 400 },
  tdMeta: { fontSize: 10, marginTop: 3 },
  tdDash: { color: '#46464d' },
  tdLockIcon: { fontSize: 11, opacity: 0.75, filter: 'grayscale(0.3)' },
  tdPts: { fontSize: 9.5, opacity: 0.85, fontFamily: "'Oswald',sans-serif" },

  // ── Admin match card ──
  adminMatchCard: { background: '#1e1e24', border: '1px solid rgba(212,175,55,0.14)', borderRadius: 14, padding: '9px 13px', marginBottom: 6 },

  // ── Footer ──
  chatBox: { flex: 1, overflowY: 'auto', background: '#15151a', borderRadius: 14, padding: '14px', marginBottom: 4, display: 'flex', flexDirection: 'column', gap: 2, border: '1px solid rgba(212,175,55,0.14)' },
  footer: { textAlign: 'center', padding: '20px', fontSize: 12, color: '#5a5a62', borderTop: '1px solid rgba(212,175,55,0.1)' },
  footerBall: { marginRight: 4 },
  footerDot: { margin: '0 8px', color: 'rgba(212,175,55,0.3)' },
  footerName: { color: '#9b9ba3' },
}
