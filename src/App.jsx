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
    showToast(`Salut BOSS!, ${name}! 🎉`)
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
    <div style={S.root}>
      {/* ── HEADER ── */}
      <header style={S.header}>
        <div style={S.headerInner}>
          <div style={S.logo}>
            <span style={{ fontSize: 26 }}>⚽</span>
            <div>
              <div style={S.logoTitle}>CUPA MONDIALĂ 2026</div>
              <div style={S.logoSub}>Pronosticuri cu prietenii</div>
            </div>
          </div>
          {currentUser && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={S.userBadge}>👤 {currentUser.name}</span>
              <button style={S.btnGhost} onClick={handleLogout}>Ieșire</button>
            </div>
          )}
        </div>
        {currentUser && (
          <nav style={{ display: 'flex', gap: 4, padding: '0 16px 10px' }}>
            {[['predict','🎯 Pronosticuri'],['leaderboard','🏆 Clasament'],['admin','⚙️ Admin']].map(([k,l]) => (
              <button key={k} style={{ ...S.navBtn, ...(view===k ? S.navActive : {}) }} onClick={() => setView(k)}>{l}</button>
            ))}
          </nav>
        )}
      </header>

      {/* ── TOAST ── */}
      {toast && (
        <div style={{ ...S.toast, background: toast.type === 'err' ? '#c0392b' : '#27ae60' }}>
          {toast.msg}
        </div>
      )}

      <main style={S.main}>

        {/* ════ LOGIN ════ */}
        {view === 'login' && (
          <div style={S.center}>
            <div style={S.card}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>🌍</div>
              <h2 style={S.cardTitle}>Intră în joc</h2>

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
                  <p style={S.cardSub}>Salut, <b style={{ color: '#f1c40f' }}>{inputName}</b>! Introdu parola ta.</p>
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
                    Cont nou pentru <b style={{ color: '#f1c40f' }}>{inputName}</b>.<br/>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={S.pageTitle}>Pronosticurile tale</h2>
              <button style={{ ...S.btnPrimary, width: 'auto', padding: '10px 20px', fontSize: 14 }}
                onClick={savePredictions} disabled={saving}>
                {saving ? 'Se salvează...' : '💾 Salvează'}
              </button>
            </div>
            <div style={S.infoBox}>
              🥇 Scor exact = <b>5 pct</b> &nbsp;|&nbsp; 🎯 Diferență goluri = <b>3 pct</b> &nbsp;|&nbsp; ✔️ Câștigător = <b>2 pct</b>
              <br/>🔒 Pronosticurile se blochează automat cu <b>5 minute</b> înainte de fiecare meci
            </div>

            {Object.entries(matchesByDay).map(([day, dayMatches]) => (
              <div key={day} style={{ marginBottom: 24 }}>
                <div style={S.dayLabel}>📅 {day}</div>
                {dayMatches.map(m => {
                  const pred    = localPreds[m.id] || { home: '', away: '' }
                  const res     = results[m.id]
                  const locked  = isLocked(m.kickoff)
                  const hasPred = pred.home !== '' && pred.away !== ''
                  const hasRes  = res && res.home !== '' && res.away !== ''
                  const pts     = hasPred && hasRes ? calcScore(pred, res) : null
                  const minsLeft = m.kickoff ? Math.max(0, Math.ceil((new Date(m.kickoff) - now) / 60000)) : null

                  let cardStyle = { ...S.matchCard }
                  if (pts === 5) cardStyle = { ...cardStyle, ...S.cardGold }
                  else if (pts === 3) cardStyle = { ...cardStyle, ...S.cardBlue }
                  else if (pts === 2) cardStyle = { ...cardStyle, ...S.cardGreen }
                  else if (locked && !hasRes) cardStyle = { ...cardStyle, ...S.cardLocked }

                  return (
                    <div key={m.id} style={cardStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, color: '#95a5a6' }}>
                          🕐 {fmtHour(m.kickoff)} &nbsp;·&nbsp; <span style={{ color: '#7f8c8d' }}>{m.group}</span>
                        </span>
                        {locked
                          ? <span style={S.lockBadge}>🔒 Blocat</span>
                          : minsLeft !== null && minsLeft <= 120
                            ? <span style={S.timerBadge}>⏱ {minsLeft} min</span>
                            : null
                        }
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={S.teamName}>{m.home}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
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
                        <div style={{ marginTop: 8, fontSize: 12, color: '#95a5a6', display: 'flex', alignItems: 'center', gap: 8 }}>
                          Rezultat: <b style={{ color: '#ecf0f1' }}>{res.home} – {res.away}</b>
                          {pts !== null && (
                            <span style={{ ...S.ptsBadge, background: pts===5?'#f39c12':pts===3?'#2980b9':pts===2?'#27ae60':'#636e72' }}>
                              {pts} pct
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}

            <div style={{ textAlign: 'center', marginTop: 8, marginBottom: 32 }}>
              <button style={S.btnPrimary} onClick={savePredictions} disabled={saving}>
                {saving ? 'Se salvează...' : '💾 Salvează toate pronosticurile'}
              </button>
            </div>
          </div>
        )}

        {/* ════ CLASAMENT ════ */}
        {view === 'leaderboard' && (
          <div>
            <h2 style={S.pageTitle}>🏆 Clasament</h2>

            {leaderboard.length === 0
              ? <p style={{ color: '#7f8c8d', fontStyle: 'italic' }}>Niciun jucător înregistrat.</p>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
                  {leaderboard.map((u, i) => (
                    <div key={u.name} style={{
                      ...S.lbRow,
                      ...(i===0?S.lbGold:i===1?S.lbSilver:i===2?S.lbBronze:{}),
                      ...(u.name===currentUser?.name ? { boxShadow: '0 0 0 2px rgba(241,196,15,0.6)' } : {})
                    }}>
                      <span style={{ fontSize: 22, width: 32 }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`}</span>
                      <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>
                        {u.name}{u.name===currentUser?.name?' (tu)':''}
                      </span>
                      <span style={{ fontSize: 22, fontWeight: 800, color: '#f1c40f' }}>
                        {u.total} <small style={{ fontWeight: 400, fontSize: 13 }}>pct</small>
                      </span>
                    </div>
                  ))}
                </div>
              )
            }

            <h3 style={{ ...S.pageTitle, fontSize: 16, marginBottom: 8 }}>Pronosticuri detaliate</h3>
            <div style={S.infoBox}>🔒 Pronosticurile devin vizibile pentru toți după blocarea meciului.</div>
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Meci</th>
                    {Object.keys(users).map(u => (
                      <th key={u} style={{ ...S.th, textAlign: 'center' }}>
                        {u}{u===currentUser?.name?' 👤':''}
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
                      <tr key={m.id}>
                        <td style={{ ...S.td, minWidth: 140 }}>
                          <div style={{ fontWeight: 600, fontSize: 11 }}>{m.home} <span style={{ color: '#7f8c8d' }}>vs</span> {m.away}</div>
                          <div style={{ fontSize: 10, marginTop: 2, color: locked ? '#e74c3c' : '#7f8c8d' }}>
                            {locked ? '🔒' : '⏳'} {m.date} {fmtHour(m.kickoff)}
                          </div>
                        </td>
                        {Object.keys(users).map(u => {
                          const p = predictions[u]?.[m.id]
                          const hasPred = p && p.home !== '' && p.away !== ''
                          const pts = hasPred && hasRes ? calcScore(p, res) : null
                          const isMe = u === currentUser?.name
                          return (
                            <td key={u} style={{ ...S.td, textAlign: 'center',
                              color: pts===5?'#f39c12':pts===3?'#3498db':pts===2?'#27ae60':'inherit',
                              fontWeight: pts ? 'bold' : 'normal' }}>
                              {(locked || isMe)
                                ? hasPred ? `${p.home}–${p.away}` : <span style={{ color: '#4a6572' }}>–</span>
                                : <span style={{ color: '#4a6572' }}>🔒</span>
                              }
                              {pts !== null && (locked || isMe) && (
                                <div style={{ fontSize: 10, opacity: 0.8 }}>({pts}p)</div>
                              )}
                            </td>
                          )
                        })}
                        <td style={{ ...S.td, textAlign: 'center', fontWeight: 'bold' }}>
                          {hasRes ? `${res.home}–${res.away}` : <span style={{ color: '#4a6572' }}>–</span>}
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
            <h2 style={S.pageTitle}>⚙️ Panou Admin</h2>
            {!adminMode ? (
              <div style={{ ...S.card, maxWidth: 400 }}>
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
                  <div key={day} style={{ marginBottom: 20 }}>
                    <div style={S.dayLabel}>📅 {day}</div>
                    {dayMatches.map(m => {
                      const res = localResults[m.id] || { home: '', away: '' }
                      return (
                        <div key={m.id} style={{ ...S.matchCard, padding: '8px 12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 10, color: '#7f8c8d' }}>
                              🕐 {fmtHour(m.kickoff)} · {m.group}
                            </span>
                            {isLocked(m.kickoff) && <span style={S.lockBadge}>🔒</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ ...S.teamName, fontSize: 12 }}>{m.home}</span>
                            <input style={{ ...S.scoreInput, borderColor: '#f39c12', width: 40, height: 34 }}
                              type="number" min="0" max="20" value={res.home} placeholder="–"
                              onChange={e => updateLocalResult(m.id, 'home', e.target.value)} />
                            <span style={S.colon}>:</span>
                            <input style={{ ...S.scoreInput, borderColor: '#f39c12', width: 40, height: 34 }}
                              type="number" min="0" max="20" value={res.away} placeholder="–"
                              onChange={e => updateLocalResult(m.id, 'away', e.target.value)} />
                            <span style={{ ...S.teamName, textAlign: 'right', fontSize: 12 }}>{m.away}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
                <div style={{ textAlign: 'center', marginTop: 8, marginBottom: 32 }}>
                  <button style={{ ...S.btnPrimary, background: '#f39c12' }} onClick={saveResults}>
                    💾 Salvează toate rezultatele
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer style={S.footer}>
        ⚽ World Cup 2026 Pronosticuri &nbsp;•&nbsp; developed by <b>EidrieN</b>
      </footer>
    </div>
  )
}

// ─── STILURI ─────────────────────────────────────────────────────────────────
const S = {
  root: { minHeight: '100vh', background: 'linear-gradient(160deg,#0d2137 0%,#0a3d2e 100%)', fontFamily: "'Segoe UI',system-ui,sans-serif", color: '#ecf0f1' },
  header: { background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, zIndex: 100 },
  headerInner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px' },
  logo: { display: 'flex', alignItems: 'center', gap: 10 },
  logoTitle: { fontSize: 15, fontWeight: 800, letterSpacing: 1, color: '#f1c40f' },
  logoSub: { fontSize: 11, color: '#95a5a6' },
  userBadge: { background: 'rgba(241,196,15,0.15)', color: '#f1c40f', border: '1px solid rgba(241,196,15,0.3)', padding: '4px 10px', borderRadius: 20, fontSize: 13 },
  btnGhost: { background: 'transparent', color: '#95a5a6', border: '1px solid rgba(255,255,255,0.15)', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  navBtn: { background: 'transparent', color: '#bdc3c7', border: 'none', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500 },
  navActive: { background: 'rgba(241,196,15,0.15)', color: '#f1c40f', fontWeight: 700 },
  toast: { position: 'fixed', top: 16, right: 16, zIndex: 999, color: '#fff', padding: '10px 20px', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.4)', fontSize: 14, fontWeight: 600 },
  main: { maxWidth: 820, margin: '0 auto', padding: '24px 16px 60px' },
  center: { display: 'flex', justifyContent: 'center', paddingTop: 40 },
  card: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '32px 28px', textAlign: 'center', width: '100%', maxWidth: 420 },
  cardTitle: { fontSize: 22, fontWeight: 800, marginBottom: 6, color: '#f1c40f' },
  cardSub: { fontSize: 14, color: '#95a5a6', marginBottom: 18 },
  input: { width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)', color: '#ecf0f1', fontSize: 14, outline: 'none', marginBottom: 12, boxSizing: 'border-box' },
  errMsg: { color: '#e74c3c', fontSize: 13, marginBottom: 10, textAlign: 'left' },
  btnPrimary: { background: 'linear-gradient(135deg,#f1c40f,#e67e22)', color: '#0d2137', fontWeight: 800, border: 'none', padding: '12px 28px', borderRadius: 8, cursor: 'pointer', fontSize: 15, width: '100%' },
  pageTitle: { fontSize: 20, fontWeight: 800, color: '#f1c40f', marginBottom: 16 },
  infoBox: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 14px', fontSize: 12, color: '#95a5a6', marginBottom: 16, lineHeight: 1.7 },
  dayLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#f1c40f', textTransform: 'uppercase', borderBottom: '1px solid rgba(241,196,15,0.2)', paddingBottom: 6, marginBottom: 8 },
  matchCard: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 14px', marginBottom: 6 },
  cardGold:   { borderColor: 'rgba(241,196,15,0.6)',  background: 'rgba(241,196,15,0.07)' },
  cardBlue:   { borderColor: 'rgba(52,152,219,0.5)',  background: 'rgba(52,152,219,0.06)' },
  cardGreen:  { borderColor: 'rgba(39,174,96,0.5)',   background: 'rgba(39,174,96,0.06)' },
  cardLocked: { borderColor: 'rgba(231,76,60,0.2)',   background: 'rgba(231,76,60,0.03)' },
  teamName: { flex: 1, fontSize: 13, fontWeight: 600, lineHeight: 1.3 },
  scoreInput: { width: 46, height: 40, textAlign: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, color: '#ecf0f1', fontSize: 17, fontWeight: 700, outline: 'none' },
  scoreDisplay: { width: 46, height: 40, textAlign: 'center', lineHeight: '40px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, fontSize: 17, fontWeight: 700, color: '#bdc3c7' },
  colon: { fontSize: 18, color: '#7f8c8d', flexShrink: 0 },
  ptsBadge: { color: '#fff', fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 10 },
  lockBadge: { fontSize: 11, fontWeight: 700, color: '#e74c3c', background: 'rgba(231,76,60,0.15)', border: '1px solid rgba(231,76,60,0.3)', padding: '2px 8px', borderRadius: 10 },
  timerBadge: { fontSize: 11, fontWeight: 700, color: '#f39c12', background: 'rgba(243,156,18,0.15)', border: '1px solid rgba(243,156,18,0.3)', padding: '2px 8px', borderRadius: 10 },
  lbRow: { display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 16px' },
  lbGold:   { borderColor: 'rgba(241,196,15,0.5)', background: 'rgba(241,196,15,0.08)' },
  lbSilver: { borderColor: 'rgba(189,195,199,0.4)', background: 'rgba(189,195,199,0.05)' },
  lbBronze: { borderColor: 'rgba(205,127,50,0.4)', background: 'rgba(205,127,50,0.05)' },
  table: { width: '100%', borderCollapse: 'collapse', background: 'rgba(255,255,255,0.02)', fontSize: 12 },
  th: { background: 'rgba(0,0,0,0.35)', padding: '8px 8px', textAlign: 'left', color: '#95a5a6', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap' },
  td: { padding: '7px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)', verticalAlign: 'middle' },
  footer: { textAlign: 'center', padding: '16px', fontSize: 12, color: '#4a6572', borderTop: '1px solid rgba(255,255,255,0.05)' },
}
