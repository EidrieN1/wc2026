import { useState, useEffect, useCallback } from 'react'
import { ref, onValue, set, get } from 'firebase/database'
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
  const [view, setView]           = useState('login')      // login | predict | leaderboard | admin
  const [loginStep, setLoginStep] = useState('name')       // name | password | register
  const [inputName, setInputName] = useState('')
  const [inputPass, setInputPass] = useState('')
  const [inputPass2, setInputPass2] = useState('')
  const [loginError, setLoginError] = useState('')

  const [currentUser, setCurrentUser] = useState(null)     // { name, isAdmin }
  const [adminMode, setAdminMode]     = useState(false)
  const [adminInput, setAdminInput]   = useState('')

  const [users, setUsers]         = useState({})           // { name: { hash } }
  const [predictions, setPreds]   = useState({})           // { name: { matchId: {home,away} } }
  const [results, setResults]     = useState({})           // { matchId: {home,away} }

  const [localPreds, setLocalPreds] = useState({})         // buffer local înainte de save
  const [localResults, setLocalResults] = useState({})
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
    return () => { unsubUsers(); unsubPreds(); unsubRes() }
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

  // ── Restore session ──
  useEffect(() => {
    const saved = sessionStorage.getItem('wc2026_user')
    if (saved) {
      try {
        const u = JSON.parse(saved)
        setCurrentUser(u)
        setView('predict')
      } catch (_) {}
    }
  }, [])

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

  // ─── CLASAMENT ───────────────────────────────────────────────────────────

  const leaderboard = Object.keys(users).map(name => {
    let total = 0
    MATCHES.forEach(m => {
      const pred = predictions[name]?.[m.id]
      if (!pred || pred.home === '' || pred.away === '') return
      const res = results[m.id]
      if (!res || res.home === '' || res.away === '') return
      const pts = calcScore(pred, res)
      if (pts) total += pts
    })
    return { name, total }
  }).sort((a, b) => b.total - a.total)

  // ─── MECIURI SORTATE ─────────────────────────────────────────────────────

  const sortedMatches = [...MATCHES].sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))

  const matchesByDay = sortedMatches.reduce((acc, m) => {
    if (!acc[m.date]) acc[m.date] = []
    acc[m.date].push(m)
    return acc
  }, {})

  // ─── RENDER ──────────────────────────────────────────────────────────────

  return (
    <div className="wc-app" style={S.root}>
      {/* ── HEADER ── */}
      <header style={S.header}>
        <div style={S.headerTopLine} />
        <div style={S.headerInner}>
          <div style={S.logo}>
            <div style={S.logoMark}>⚽</div>
            <div>
              <div style={S.logoTitle}>CUPA MONDIALĂ <span style={S.logoYear}>2026</span></div>
              <div style={S.logoSub}>Pronosticuri cu prietenii</div>
            </div>
          </div>
          {currentUser && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={S.userBadge}>{currentUser.name}</span>
              <button style={S.btnGhost} onClick={handleLogout}>Ieșire</button>
            </div>
          )}
        </div>
        {currentUser && (
          <nav style={S.navWrap}>
            {[['predict','Pronosticuri'],['leaderboard','Clasament'],['admin','Admin']].map(([k,l]) => (
              <button key={k} style={{ ...S.navBtn, ...(view===k ? S.navActive : {}) }} onClick={() => setView(k)}>{l}</button>
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

      <main style={S.main}>

        {/* ════ LOGIN ════ */}
        {view === 'login' && (
          <div style={S.center}>
            <div style={S.card}>
              <div style={S.cardCrest}>⚽</div>
              <h2 style={S.cardTitle}>Intră în joc</h2>
              <div style={S.cardDivider} />

              {loginStep === 'name' && (
                <>
                  <p style={S.cardSub}>Introdu numele tău de participant</p>
                  <input style={S.input} placeholder="Numele tău (ex: Adrian)"
                    value={inputName} maxLength={20}
                    onChange={e => setInputName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleNameSubmit()} />
                  {loginError && <div style={S.errMsg}>{loginError}</div>}
                  <button style={S.btnPrimary} onClick={handleNameSubmit}>Continuă →</button>
                </>
              )}

              {loginStep === 'password' && (
                <>
                  <p style={S.cardSub}>Salut, <b style={S.cardSubAccent}>{inputName}</b>! Introdu parola ta.</p>
                  <input style={S.input} type="password" placeholder="Parola ta"
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
                  <p style={S.cardSub}>
                    Cont nou pentru <b style={S.cardSubAccent}>{inputName}</b>.<br/>
                    Alege o parolă cu care te vei loga data viitoare.
                  </p>
                  <input style={S.input} type="password" placeholder="Alege o parolă (min. 4 caractere)"
                    value={inputPass}
                    onChange={e => setInputPass(e.target.value)} />
                  <input style={S.input} type="password" placeholder="Confirmă parola"
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
              <h2 style={S.pageTitle}>Pronosticurile tale</h2>
              <button style={{ ...S.btnPrimary, width: 'auto', padding: '10px 20px', fontSize: 13 }}
                onClick={savePredictions} disabled={saving}>
                {saving ? 'Se salvează...' : 'Salvează'}
              </button>
            </div>
            <div style={S.infoBox}>
              <span style={S.infoPt}><b style={S.infoPtGold}>5p</b> scor exact</span>
              <span style={S.infoDot}>·</span>
              <span style={S.infoPt}><b style={S.infoPtBlue}>3p</b> diferență goluri</span>
              <span style={S.infoDot}>·</span>
              <span style={S.infoPt}><b style={S.infoPtGreen}>2p</b> câștigător corect</span>
              <div style={{ marginTop: 6, opacity: 0.8 }}>Pronosticurile se blochează automat cu 5 minute înainte de fiecare meci.</div>
            </div>

            {Object.entries(matchesByDay).map(([day, dayMatches]) => (
              <div key={day} style={{ marginBottom: 26 }}>
                <div style={S.dayLabel}><span style={S.dayLabelLine} />{day}<span style={S.dayLabelLine} /></div>
                {dayMatches.map(m => {
                  const pred    = localPreds[m.id] || { home: '', away: '' }
                  const res     = results[m.id]
                  const locked  = isLocked(m.kickoff)
                  const hasPred = pred.home !== '' && pred.away !== ''
                  const hasRes  = res && res.home !== '' && res.away !== ''
                  const pts     = hasPred && hasRes ? calcScore(pred, res) : null
                  const minsLeft = m.kickoff ? Math.max(0, Math.ceil((new Date(m.kickoff) - now) / 60000)) : null

                  let cardStyle = { ...S.matchCard }
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
                          <span style={S.matchMeta}>
                            {fmtHour(m.kickoff)} <span style={S.matchMetaDot}>•</span> <span style={S.matchGroup}>{m.group}</span>
                          </span>
                          {locked
                            ? <span style={S.lockBadge}>Blocat</span>
                            : minsLeft !== null && minsLeft <= 120
                              ? <span className="wc-pulse-dot" style={S.timerBadge}><span style={{...S.liveDot, animation: 'wcPulse 1.6s ease-in-out infinite'}} />{minsLeft} min</span>
                              : null
                          }
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={S.teamName}>{m.home}</span>
                          <div style={S.scoreboardWrap}>
                            {locked
                              ? <>
                                  <div style={S.scoreDisplay}>{pred.home !== '' ? pred.home : '–'}</div>
                                  <span style={S.colon}>:</span>
                                  <div style={S.scoreDisplay}>{pred.away !== '' ? pred.away : '–'}</div>
                                </>
                              : <>
                                  <input style={S.scoreInput} type="number" min="0" max="20"
                                    value={pred.home} placeholder="–"
                                    onChange={e => updateLocalPred(m.id, 'home', e.target.value)} />
                                  <span style={S.colon}>:</span>
                                  <input style={S.scoreInput} type="number" min="0" max="20"
                                    value={pred.away} placeholder="–"
                                    onChange={e => updateLocalPred(m.id, 'away', e.target.value)} />
                                </>
                            }
                          </div>
                          <span style={{ ...S.teamName, textAlign: 'right' }}>{m.away}</span>
                        </div>
                        {hasRes && (
                          <div style={S.resultRow}>
                            Rezultat final <b style={S.resultScore}>{res.home} – {res.away}</b>
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

        {/* ════ CLASAMENT ════ */}
        {view === 'leaderboard' && (
          <div>
            <h2 style={S.pageTitle}>Clasament</h2>

            {leaderboard.length === 0
              ? <p style={S.emptyMsg}>Niciun jucător înregistrat.</p>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
                  {leaderboard.map((u, i) => (
                    <div key={u.name} style={{
                      ...S.lbRow,
                      ...(i===0?S.lbGold:i===1?S.lbSilver:i===2?S.lbBronze:{}),
                      ...(u.name===currentUser?.name ? S.lbMe : {})
                    }}>
                      <span style={{ ...S.lbRank, ...(i===0?S.lbRankGold:i===1?S.lbRankSilver:i===2?S.lbRankBronze:{}) }}>
                        {i<3 ? i+1 : `${i+1}`}
                      </span>
                      <span style={S.lbName}>
                        {u.name}{u.name===currentUser?.name?<span style={S.lbYou}>tu</span>:null}
                      </span>
                      <span style={S.lbScore}>
                        {u.total}<small style={S.lbScoreUnit}>pct</small>
                      </span>
                    </div>
                  ))}
                </div>
              )
            }

            <h3 style={{ ...S.pageTitle, fontSize: 15, marginBottom: 8 }}>Pronosticuri detaliate</h3>
            <div style={S.infoBox}>Pronosticurile devin vizibile pentru toți după blocarea meciului.</div>
            <div className="wc-scroll" style={{ overflowX: 'auto', marginTop: 12, borderRadius: 10, border: '1px solid rgba(212,175,55,0.18)' }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Meci</th>
                    {Object.keys(users).map(u => (
                      <th key={u} style={{ ...S.th, textAlign: 'center' }}>
                        {u}{u===currentUser?.name?' •':''}
                      </th>
                    ))}
                    <th style={{ ...S.th, textAlign: 'center' }}>Rezultat</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMatches.map(m => {
                    const locked = isLocked(m.kickoff)
                    const res = results[m.id]
                    const hasRes = res && res.home !== '' && res.away !== ''
                    return (
                      <tr key={m.id} style={S.tr}>
                        <td style={{ ...S.td, minWidth: 140 }}>
                          <div style={S.tdMatch}>{m.home} <span style={S.tdVs}>vs</span> {m.away}</div>
                          <div style={{ ...S.tdMeta, color: locked ? '#e0717c' : '#7f9a8a' }}>
                            {locked ? '● blocat' : '○ deschis'} &nbsp;{m.date} {fmtHour(m.kickoff)}
                          </div>
                        </td>
                        {Object.keys(users).map(u => {
                          const p = predictions[u]?.[m.id]
                          const hasPred = p && p.home !== '' && p.away !== ''
                          const pts = hasPred && hasRes ? calcScore(p, res) : null
                          const isMe = u === currentUser?.name
                          return (
                            <td key={u} style={{ ...S.td, textAlign: 'center',
                              color: pts===5?'#d4af37':pts===3?'#5b9bd5':pts===2?'#52b788':'inherit',
                              fontWeight: pts ? 700 : 400 }}>
                              {(locked || isMe)
                                ? hasPred ? `${p.home}–${p.away}` : <span style={S.tdDash}>–</span>
                                : <span style={S.tdDash}>•</span>
                              }
                              {pts !== null && (locked || isMe) && (
                                <div style={S.tdPts}>({pts}p)</div>
                              )}
                            </td>
                          )
                        })}
                        <td style={{ ...S.td, textAlign: 'center', fontWeight: 700, color: '#f5f1e8' }}>
                          {hasRes ? `${res.home}–${res.away}` : <span style={S.tdDash}>–</span>}
                        </td>
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
            <h2 style={S.pageTitle}>Panou Admin</h2>
            {!adminMode ? (
              <div style={{ ...S.card, maxWidth: 400 }}>
                <div style={S.cardCrest}>🔑</div>
                <p style={S.cardSub}>Introdu parola de admin pentru a introduce rezultate.</p>
                <input style={S.input} type="password" placeholder="Parolă admin"
                  value={adminInput} onChange={e => setAdminInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdminLogin()} />
                <button style={S.btnPrimary} onClick={handleAdminLogin}>Intră ca Admin</button>
              </div>
            ) : (
              <div>
                <div style={S.infoBox}>Introdu scorurile finale. Punctajele se calculează automat.</div>
                {Object.entries(matchesByDay).map(([day, dayMatches]) => (
                  <div key={day} style={{ marginBottom: 22 }}>
                    <div style={S.dayLabel}><span style={S.dayLabelLine} />{day}<span style={S.dayLabelLine} /></div>
                    {dayMatches.map(m => {
                      const res = localResults[m.id] || { home: '', away: '' }
                      return (
                        <div key={m.id} style={S.adminMatchCard}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                            <span style={S.matchMeta}>{fmtHour(m.kickoff)} <span style={S.matchMetaDot}>•</span> <span style={S.matchGroup}>{m.group}</span></span>
                            {isLocked(m.kickoff) && <span style={S.lockBadge}>Blocat</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ ...S.teamName, fontSize: 12 }}>{m.home}</span>
                            <div style={S.scoreboardWrap}>
                              <input style={S.scoreInputAdmin}
                                type="number" min="0" max="20" value={res.home} placeholder="–"
                                onChange={e => updateLocalResult(m.id, 'home', e.target.value)} />
                              <span style={S.colon}>:</span>
                              <input style={S.scoreInputAdmin}
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

      <footer style={S.footer}>
        <span style={S.footerBall}>⚽</span> World Cup 2026 Pronosticuri <span style={S.footerDot}>•</span> developed by <b style={S.footerName}>EidrieN</b>
      </footer>
    </div>
  )
}

// ─── STILURI ─────────────────────────────────────────────────────────────────
const S = {
  // ── Bază / fundal de gazon adânc ──
  root: {
    minHeight: '100vh',
    background: `
      repeating-linear-gradient(90deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 60px, transparent 60px, transparent 120px),
      radial-gradient(ellipse 1200px 700px at 50% -10%, rgba(212,175,55,0.07), transparent 60%),
      linear-gradient(165deg, #0a1f14 0%, #0d2818 45%, #0a1f14 100%)
    `,
    fontFamily: "'Inter',system-ui,sans-serif",
    color: '#f5f1e8',
  },

  // ── Header ──
  header: { background: 'linear-gradient(180deg, rgba(8,18,12,0.92), rgba(8,18,12,0.82))', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(212,175,55,0.22)', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 4px 24px rgba(0,0,0,0.35)' },
  headerTopLine: { height: 3, background: 'linear-gradient(90deg, transparent, #d4af37 20%, #f0d878 50%, #d4af37 80%, transparent)' },
  headerInner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 20px' },
  logo: { display: 'flex', alignItems: 'center', gap: 12 },
  logoMark: { fontSize: 22, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 35% 30%, #1a4d33, #0a1f14)', border: '1px solid rgba(212,175,55,0.4)', borderRadius: '50%', boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5), 0 0 0 3px rgba(212,175,55,0.08)' },
  logoTitle: { fontFamily: "'Oswald',sans-serif", fontSize: 16, fontWeight: 600, letterSpacing: 1.5, color: '#f5f1e8', textTransform: 'uppercase' },
  logoYear: { color: '#d4af37' },
  logoSub: { fontSize: 11, color: '#8fae9c', letterSpacing: 0.3 },
  userBadge: { fontFamily: "'Oswald',sans-serif", background: 'rgba(212,175,55,0.12)', color: '#e8c96a', border: '1px solid rgba(212,175,55,0.35)', padding: '5px 14px', borderRadius: 3, fontSize: 12, fontWeight: 500, letterSpacing: 0.8, textTransform: 'uppercase' },
  btnGhost: { background: 'transparent', color: '#8fae9c', border: '1px solid rgba(245,241,232,0.18)', padding: '6px 14px', borderRadius: 3, cursor: 'pointer', fontSize: 12, fontWeight: 500, letterSpacing: 0.4 },
  navWrap: { display: 'flex', gap: 2, padding: '0 16px 0' },
  navBtn: { fontFamily: "'Oswald',sans-serif", background: 'transparent', color: '#8fae9c', border: 'none', borderBottom: '2px solid transparent', padding: '9px 16px', cursor: 'pointer', fontSize: 12.5, fontWeight: 500, letterSpacing: 1, textTransform: 'uppercase' },
  navActive: { color: '#e8c96a', borderBottom: '2px solid #d4af37' },

  // ── Toast ──
  toast: { position: 'fixed', top: 18, right: 18, zIndex: 999, color: '#f5f1e8', padding: '11px 22px', borderRadius: 4, boxShadow: '0 8px 28px rgba(0,0,0,0.5)', fontSize: 13.5, fontWeight: 600, border: '1px solid rgba(255,255,255,0.12)' },

  main: { maxWidth: 820, margin: '0 auto', padding: '28px 16px 60px' },
  center: { display: 'flex', justifyContent: 'center', paddingTop: 40 },

  // ── Card login/admin ──
  card: { background: 'linear-gradient(165deg, rgba(245,241,232,0.05), rgba(245,241,232,0.02))', border: '1px solid rgba(212,175,55,0.22)', borderRadius: 10, padding: '36px 30px', textAlign: 'center', width: '100%', maxWidth: 420, boxShadow: '0 20px 50px rgba(0,0,0,0.35)' },
  cardCrest: { fontSize: 38, width: 64, height: 64, lineHeight: '64px', margin: '0 auto 14px', background: 'radial-gradient(circle at 35% 30%, #1a4d33, #0a1f14)', border: '1px solid rgba(212,175,55,0.4)', borderRadius: '50%', boxShadow: 'inset 0 0 14px rgba(0,0,0,0.5)' },
  cardTitle: { fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 600, marginBottom: 4, color: '#f5f1e8', letterSpacing: 1, textTransform: 'uppercase' },
  cardDivider: { width: 40, height: 2, background: '#d4af37', margin: '10px auto 18px', opacity: 0.7 },
  cardSub: { fontSize: 14, color: '#a9c2b3', marginBottom: 18, lineHeight: 1.5 },
  cardSubAccent: { color: '#e8c96a' },

  input: { width: '100%', padding: '12px 14px', borderRadius: 5, border: '1px solid rgba(245,241,232,0.16)', background: 'rgba(0,0,0,0.22)', color: '#f5f1e8', fontSize: 14, outline: 'none', marginBottom: 12, boxSizing: 'border-box', fontFamily: "'Inter',sans-serif" },
  errMsg: { color: '#e0717c', fontSize: 13, marginBottom: 10, textAlign: 'left' },
  btnPrimary: { fontFamily: "'Oswald',sans-serif", background: 'linear-gradient(135deg,#e8c96a,#c89a2e)', color: '#0a1f14', fontWeight: 600, border: 'none', padding: '13px 28px', borderRadius: 5, cursor: 'pointer', fontSize: 14, width: '100%', letterSpacing: 1, textTransform: 'uppercase', boxShadow: '0 6px 18px rgba(212,175,55,0.25)' },
  btnAdminSave: { fontFamily: "'Oswald',sans-serif", background: 'linear-gradient(135deg,#3a7a57,#1f5238)', color: '#f5f1e8', fontWeight: 600, border: '1px solid rgba(212,175,55,0.3)', padding: '13px 30px', borderRadius: 5, cursor: 'pointer', fontSize: 14, letterSpacing: 1, textTransform: 'uppercase', boxShadow: '0 6px 18px rgba(0,0,0,0.3)' },

  pageTitle: { fontFamily: "'Oswald',sans-serif", fontSize: 19, fontWeight: 600, color: '#f5f1e8', marginBottom: 16, letterSpacing: 0.8, textTransform: 'uppercase' },

  // ── Info box ──
  infoBox: { background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.18)', borderRadius: 6, padding: '10px 16px', fontSize: 12.5, color: '#a9c2b3', marginBottom: 16, lineHeight: 1.7 },
  infoPt: { color: '#a9c2b3' },
  infoPtGold: { color: '#e8c96a' },
  infoPtBlue: { color: '#7fb3e0' },
  infoPtGreen: { color: '#6fcf9c' },
  infoDot: { margin: '0 8px', color: 'rgba(212,175,55,0.4)' },

  // ── Day label ──
  dayLabel: { fontFamily: "'Oswald',sans-serif", display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, fontWeight: 500, letterSpacing: 2.5, color: '#e8c96a', textTransform: 'uppercase', marginBottom: 10 },
  dayLabelLine: { flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(212,175,55,0.35), transparent)' },

  // ── Match card (scoreboard) ──
  matchCard: { position: 'relative', display: 'flex', background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(245,241,232,0.08)', borderRadius: 6, marginBottom: 8, overflow: 'hidden' },
  matchCardBody: { flex: 1, padding: '11px 14px 11px 12px' },
  cardStripeDefault: { width: 4, background: 'rgba(245,241,232,0.08)', flexShrink: 0 },
  cardStripeGold:   { width: 4, background: 'linear-gradient(180deg,#f0d878,#c89a2e)', flexShrink: 0 },
  cardStripeBlue:   { width: 4, background: 'linear-gradient(180deg,#7fb3e0,#3a7ab0)', flexShrink: 0 },
  cardStripeGreen:  { width: 4, background: 'linear-gradient(180deg,#6fcf9c,#2f9e64)', flexShrink: 0 },
  cardStripeLocked: { width: 4, background: 'rgba(224,113,124,0.45)', flexShrink: 0 },
  cardGold:   { background: 'linear-gradient(90deg, rgba(212,175,55,0.09), rgba(0,0,0,0.18) 30%)', borderColor: 'rgba(212,175,55,0.3)' },
  cardBlue:   { background: 'linear-gradient(90deg, rgba(127,179,224,0.08), rgba(0,0,0,0.18) 30%)', borderColor: 'rgba(127,179,224,0.25)' },
  cardGreen:  { background: 'linear-gradient(90deg, rgba(111,207,156,0.08), rgba(0,0,0,0.18) 30%)', borderColor: 'rgba(111,207,156,0.25)' },
  cardLocked: { background: 'rgba(0,0,0,0.28)', borderColor: 'rgba(224,113,124,0.15)' },

  matchMeta: { fontFamily: "'Oswald',sans-serif", fontSize: 11, color: '#7f9a8a', letterSpacing: 0.5 },
  matchMetaDot: { color: 'rgba(212,175,55,0.5)' },
  matchGroup: { color: '#5c7868' },
  teamName: { flex: 1, fontSize: 13.5, fontWeight: 600, lineHeight: 1.3, color: '#f5f1e8' },

  scoreboardWrap: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, background: 'rgba(0,0,0,0.35)', padding: '4px 7px', borderRadius: 4, border: '1px solid rgba(212,175,55,0.15)' },
  scoreInput: { width: 38, height: 36, textAlign: 'center', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 3, color: '#e8c96a', fontSize: 18, fontWeight: 700, outline: 'none', fontFamily: "'Oswald',monospace", padding: 0 },
  scoreInputAdmin: { width: 36, height: 32, textAlign: 'center', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(212,175,55,0.4)', borderRadius: 3, color: '#e8c96a', fontSize: 16, fontWeight: 700, outline: 'none', fontFamily: "'Oswald',monospace", padding: 0 },
  scoreDisplay: { width: 38, height: 36, textAlign: 'center', lineHeight: '36px', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(245,241,232,0.1)', borderRadius: 3, fontSize: 18, fontWeight: 700, color: '#8fae9c', fontFamily: "'Oswald',monospace" },
  colon: { fontSize: 16, color: 'rgba(212,175,55,0.5)', flexShrink: 0, fontFamily: "'Oswald',sans-serif" },

  resultRow: { marginTop: 9, paddingTop: 9, borderTop: '1px solid rgba(245,241,232,0.06)', fontSize: 12, color: '#7f9a8a', display: 'flex', alignItems: 'center', gap: 10 },
  resultScore: { color: '#f5f1e8', fontFamily: "'Oswald',monospace", fontSize: 13 },

  ptsBadge: { fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 11, padding: '2px 9px', borderRadius: 20, letterSpacing: 0.5 },
  ptsBadgeGold:  { color: '#0a1f14', background: 'linear-gradient(135deg,#f0d878,#c89a2e)' },
  ptsBadgeBlue:  { color: '#0a1f14', background: 'linear-gradient(135deg,#a8d0f0,#5b9bd5)' },
  ptsBadgeGreen: { color: '#0a1f14', background: 'linear-gradient(135deg,#9fe6c0,#52b788)' },
  ptsBadgeZero:  { color: '#cdd9d1', background: 'rgba(245,241,232,0.12)' },

  lockBadge: { fontFamily: "'Oswald',sans-serif", fontSize: 10.5, fontWeight: 600, color: '#e0717c', background: 'rgba(224,113,124,0.12)', border: '1px solid rgba(224,113,124,0.3)', padding: '2px 9px', borderRadius: 3, letterSpacing: 0.8, textTransform: 'uppercase' },
  timerBadge: { display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: "'Oswald',sans-serif", fontSize: 10.5, fontWeight: 600, color: '#e8c96a', background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', padding: '2px 9px', borderRadius: 3, letterSpacing: 0.5 },
  liveDot: { width: 6, height: 6, borderRadius: '50%', background: '#e8c96a', display: 'inline-block' },

  emptyMsg: { color: '#7f9a8a', fontStyle: 'italic', fontSize: 13.5 },

  // ── Leaderboard ──
  lbRow: { display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(245,241,232,0.08)', borderRadius: 6, padding: '13px 16px' },
  lbGold:   { borderColor: 'rgba(212,175,55,0.45)', background: 'linear-gradient(90deg, rgba(212,175,55,0.1), rgba(0,0,0,0.18))' },
  lbSilver: { borderColor: 'rgba(192,200,196,0.35)', background: 'linear-gradient(90deg, rgba(192,200,196,0.06), rgba(0,0,0,0.18))' },
  lbBronze: { borderColor: 'rgba(205,140,80,0.35)', background: 'linear-gradient(90deg, rgba(205,140,80,0.07), rgba(0,0,0,0.18))' },
  lbMe: { boxShadow: '0 0 0 1.5px rgba(212,175,55,0.55)' },
  lbRank: { fontFamily: "'Oswald',sans-serif", fontSize: 14, fontWeight: 700, width: 28, height: 28, lineHeight: '28px', textAlign: 'center', borderRadius: '50%', color: '#a9c2b3', background: 'rgba(245,241,232,0.06)', flexShrink: 0 },
  lbRankGold:   { color: '#0a1f14', background: 'linear-gradient(135deg,#f0d878,#c89a2e)' },
  lbRankSilver: { color: '#0a1f14', background: 'linear-gradient(135deg,#e4e8e6,#b7c0bc)' },
  lbRankBronze: { color: '#0a1f14', background: 'linear-gradient(135deg,#dba36e,#a8714a)' },
  lbName: { flex: 1, fontSize: 14.5, fontWeight: 600, color: '#f5f1e8' },
  lbYou: { fontFamily: "'Oswald',sans-serif", fontSize: 9.5, color: '#0a1f14', background: '#e8c96a', padding: '1px 6px', borderRadius: 3, marginLeft: 8, letterSpacing: 0.6, textTransform: 'uppercase', verticalAlign: 'middle' },
  lbScore: { fontFamily: "'Oswald',monospace", fontSize: 21, fontWeight: 700, color: '#e8c96a' },
  lbScoreUnit: { fontWeight: 400, fontSize: 11, color: '#a9c2b3', marginLeft: 3, fontFamily: "'Inter',sans-serif" },

  // ── Tabel detaliat ──
  table: { width: '100%', borderCollapse: 'collapse', background: 'rgba(0,0,0,0.15)', fontSize: 12 },
  th: { fontFamily: "'Oswald',sans-serif", background: 'rgba(0,0,0,0.4)', padding: '9px 10px', textAlign: 'left', color: '#a9c2b3', fontWeight: 500, letterSpacing: 0.6, borderBottom: '1px solid rgba(212,175,55,0.2)', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: 10.5 },
  tr: {},
  td: { padding: '8px 10px', borderBottom: '1px solid rgba(245,241,232,0.05)', verticalAlign: 'middle' },
  tdMatch: { fontWeight: 600, fontSize: 11.5, color: '#f5f1e8' },
  tdVs: { color: '#5c7868', fontWeight: 400 },
  tdMeta: { fontSize: 10, marginTop: 3 },
  tdDash: { color: '#4a6a58' },
  tdPts: { fontSize: 9.5, opacity: 0.85, fontFamily: "'Oswald',sans-serif" },

  // ── Admin match card ──
  adminMatchCard: { background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: 6, padding: '9px 13px', marginBottom: 6 },

  // ── Footer ──
  footer: { textAlign: 'center', padding: '20px', fontSize: 12, color: '#5c7868', borderTop: '1px solid rgba(212,175,55,0.1)' },
  footerBall: { marginRight: 4 },
  footerDot: { margin: '0 8px', color: 'rgba(212,175,55,0.35)' },
  footerName: { color: '#a9c2b3' },
}
