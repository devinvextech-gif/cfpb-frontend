import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const API = '/api';

const STATUS_LABELS = {
  idle: 'Idle',
  launching: 'Launching browser & logging in…',
  waiting_verify: 'Waiting for verification code',
  verifying: 'Verifying code…',
  scraping: 'Navigating to active complaint & scraping details…',
  done: 'Done',
  error: 'Error',
};

export default function App() {
  const [sessionStatus, setSessionStatus] = useState('idle');
  const [sessionActive, setSessionActive] = useState(false);
  const [error, setError] = useState(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifySubmitting, setVerifySubmitting] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [showJson, setShowJson] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState(null);
  const pollRef = useRef(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${API}/status`);
      const data = await res.json();
      setSessionStatus(data.status);
      setSessionActive(data.active);
      setTimeLeft(data.keepAliveSecondsLeft);
      if (data.error) setError(data.error);
      if (data.verifyError) {
        setVerifyError(data.verifyError);
        setVerifySubmitting(false);
      } else if (data.status !== 'verifying') {
        setVerifyError('');
      }
      if (data.dashboardData) setDashboardData(data.dashboardData);
      if (data.status === 'done' || data.status === 'error') stopPolling();
    } catch (e) {
      console.error('Poll error:', e);
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(poll, 3000);
    poll();
  }, [poll]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => { poll(); return () => stopPolling(); }, [poll, stopPolling]);

  const handleReady = async () => {
    if (sessionActive) return;
    setError(null); setDashboardData(null); setVerifyCode(''); setVerifyError('');
    try {
      const res = await fetch(`${API}/start`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to start session'); return; }
      setSessionActive(true); setSessionStatus('launching'); startPolling();
    } catch (e) { setError('Cannot reach backend. Is it running on port 3001?'); }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!verifyCode.trim()) { setVerifyError('Please enter the verification code.'); return; }
    setVerifyError(''); setVerifySubmitting(true);
    try {
      const res = await fetch(`${API}/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verifyCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) setVerifyError(data.error || 'Verification failed');
    } catch (e) { setVerifyError('Cannot reach backend.'); }
    finally { setVerifySubmitting(false); }
  };

  const handleReset = async () => {
    stopPolling();
    await fetch(`${API}/reset`, { method: 'POST' }).catch(() => { });
    setSessionStatus('idle'); setSessionActive(false); setError(null);
    setDashboardData(null); setVerifyCode(''); setVerifyError(''); setTimeLeft(null);
  };

  const isIdle = sessionStatus === 'idle';
  const isWaitingVerify = sessionStatus === 'waiting_verify';
  const isDone = sessionStatus === 'done';
  const isError = sessionStatus === 'error';
  const isTerminal = isDone || isError;
  const isBusy = sessionActive && !isWaitingVerify;

  const formatTime = (secs) => {
    if (secs === null) return '';
    return `${Math.floor(secs / 60).toString().padStart(2, '0')}:${(secs % 60).toString().padStart(2, '0')}`;
  };

  const detail = dashboardData?.complaintDetail;

  return (
    <div className="cfpb-app">
      {/* ── Header ── */}
      <header className="cfpb-header">
        <div className="cfpb-header__inner">
          <div className="cfpb-logo">
            <span className="cfpb-logo__icon">🛡</span>
            <span className="cfpb-logo__cfpb">CFPB</span>
            <span className="cfpb-logo__text">Company Portal</span>
          </div>
          {isDone && detail && (
            <a href={detail.detailUrl} target="_blank" rel="noreferrer" className="cfpb-header__link">
              View on Portal ↗
            </a>
          )}
        </div>
      </header>

      <main className="cfpb-main">
        {/* ── Session Manager Card ── */}
        <section className="cfpb-card cfpb-status-card">
          <h1 className="cfpb-card__title">Session Manager</h1>

          {timeLeft !== null && !isTerminal && (
            <div className="cfpb-timer">
              <span className="cfpb-timer__label">Session expires in</span>
              <span className={`cfpb-timer__value ${timeLeft < 60 ? 'cfpb-timer__value--urgent' : ''}`}>
                {formatTime(timeLeft)}
              </span>
            </div>
          )}

          {error && (
            <div className="cfpb-alert cfpb-alert--error" role="alert">
              <strong>Error:</strong> {error}
            </div>
          )}

          {isIdle && (
            <button className="cfpb-btn cfpb-btn--ready" onClick={handleReady} aria-label="Start portal session">
              <span className="cfpb-btn__icon">▶</span> Ready
            </button>
          )}

          {isBusy && (
            <div className="cfpb-spinner-wrap" aria-live="polite">
              <div className="cfpb-spinner" aria-hidden="true" />
              <p className="cfpb-spinner__text">{STATUS_LABELS[sessionStatus]}</p>
            </div>
          )}

          {isWaitingVerify && (
            <form className="cfpb-verify-form" onSubmit={handleVerify} noValidate>
              <p className="cfpb-verify-form__info">
                A verification code was sent to your registered method.<br />
                Enter it below within the time limit.
              </p>
              <div className="cfpb-field">
                <label className="cfpb-field__label" htmlFor="verifyCode">Verification Code</label>
                <input
                  id="verifyCode" className="cfpb-field__input" type="text"
                  inputMode="numeric" autoComplete="one-time-code" placeholder="Enter code…"
                  value={verifyCode} maxLength={8}
                  onChange={(e) => { setVerifyCode(e.target.value); setVerifyError(''); }}
                  disabled={verifySubmitting}
                  aria-describedby={verifyError ? 'verifyError' : undefined}
                />
                {verifyError && <span id="verifyError" className="cfpb-field__error" role="alert">{verifyError}</span>}
              </div>
              <button type="submit" className="cfpb-btn cfpb-btn--submit" disabled={verifySubmitting || !verifyCode.trim()}>
                {verifySubmitting ? 'Submitting…' : 'Submit Code'}
              </button>
            </form>
          )}

          {!isIdle && (
            <button className="cfpb-btn cfpb-btn--reset" onClick={handleReset} aria-label="Reset session">
              ✕ Reset Session
            </button>
          )}
        </section>

        {/* ── Complaint Detail View ── */}
        {isDone && detail && (
          <section className="cfpb-detail">

            {/* Page title bar */}
            <div className="cfpb-detail__topbar">
              <div>
                <div className="cfpb-detail__back-label">Active Complaints</div>
                <h2 className="cfpb-detail__id">{detail.complaintId || 'Complaint Detail'}</h2>
              </div>
              {/* {detail.complaintStatus && (
                <span className="cfpb-status-badge">{detail.complaintStatus}</span>
              )} */}
            </div>

            <div className="cfpb-detail__layout">
              {/* ── Left: main content ── */}
              <div className="cfpb-detail__main">

                {/* All structured fields — group them into cards by category */}
                {Object.keys(detail.allFields).length > 0 && (() => {
                  const fields = detail.allFields;
                  const consumerKeys = ['Full Name', 'Phone', 'Email Address', 'Mobile Phone', 'Address', 'Account Number', 'Billing Address'];
                  const productKeys = ['Product or Service', 'Consumer Identified Company Name', 'Issue'];
                  const responseKeys = ['Submitted By', 'Who Will Receive Responses?'];

                  const group = (keys) => keys.filter(k => fields[k]);
                  const others = Object.keys(fields).filter(k =>
                    ![...consumerKeys, ...productKeys, ...responseKeys].includes(k)
                  );

                  return (
                    <>
                      {/* Primary Consumer */}
                      {group(consumerKeys).length > 0 && (
                        <div className="cfpb-section-card">
                          <h3 className="cfpb-section-card__title">Primary consumer information</h3>
                          <div className="cfpb-fields-grid">
                            {group(consumerKeys).map(k => (
                              <div className="cfpb-field-item" key={k}>
                                <span className="cfpb-field-item__label">{k}</span>
                                <span className="cfpb-field-item__value">{fields[k]}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Product Information */}
                      {group(productKeys).length > 0 && (
                        <div className="cfpb-section-card">
                          <h3 className="cfpb-section-card__title">Product information</h3>
                          <div className="cfpb-fields-grid">
                            {group(productKeys).map(k => (
                              <div className="cfpb-field-item" key={k}>
                                <span className="cfpb-field-item__label">{k}</span>
                                <span className="cfpb-field-item__value">{fields[k]}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Other fields */}
                      {others.length > 0 && (
                        <div className="cfpb-section-card">
                          <h3 className="cfpb-section-card__title">Additional Details</h3>
                          <div className="cfpb-fields-grid">
                            {others.map(k => (
                              <div className="cfpb-field-item" key={k}>
                                <span className="cfpb-field-item__label">{k}</span>
                                <span className="cfpb-field-item__value">{fields[k]}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Response recipients */}
                      {group(responseKeys).length > 0 && (
                        <div className="cfpb-section-card">
                          <h3 className="cfpb-section-card__title">Response recipients</h3>
                          <div className="cfpb-fields-grid">
                            {group(responseKeys).map(k => (
                              <div className="cfpb-field-item" key={k}>
                                <span className="cfpb-field-item__label">{k}</span>
                                <span className="cfpb-field-item__value">{fields[k]}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Named sections (What happened, Desired resolution, etc.) */}
                {Object.entries(detail.sections || {}).map(([title, content]) => (
                  content && (
                    <div className="cfpb-section-card" key={title}>
                      <h3 className="cfpb-section-card__title">{title}</h3>
                      <div className="cfpb-narrative">
                        {content.split(/\n+/).filter(Boolean).map((p, i) => (
                          <p key={i}>{p}</p>
                        ))}
                      </div>
                    </div>
                  )
                ))}

                {/* Narrative fallback */}
                {detail.narrative && !Object.keys(detail.sections || {}).some(k => /what happened/i.test(k)) && (
                  <div className="cfpb-section-card">
                    <h3 className="cfpb-section-card__title">What happened</h3>
                    <div className="cfpb-narrative">
                      {detail.narrative.split(/\n+/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
                    </div>
                  </div>
                )}

                {/* Attachments */}
                {detail.attachments?.length > 0 && (
                  <div className="cfpb-section-card">
                    <h3 className="cfpb-section-card__title">Attachments</h3>
                    <ul className="cfpb-attachments">
                      {detail.attachments.map((a, i) => (
                        <li key={i} className="cfpb-attachment">
                          <span className="cfpb-attachment__icon">📎</span>
                          <a href={a.href} target="_blank" rel="noreferrer" className="cfpb-attachment__link">
                            {a.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                    <button className="cfpb-btn-dl">⬇ Download all attachments</button>
                  </div>
                )}

                {/* Company response options */}
                {detail.responseOptions?.length > 0 && (
                  <div className="cfpb-section-card">
                    <h3 className="cfpb-section-card__title">
                      What is the company's response?
                      <a href={detail.detailUrl} target="_blank" rel="noreferrer" className="cfpb-response-categories">
                        Response categories
                      </a>
                    </h3>
                    <div className="cfpb-response-grid">
                      {detail.responseOptions.map((opt, i) => (
                        <label key={i} className="cfpb-response-option" style={{ cursor: 'pointer' }}>
                          <input 
                            type="radio" 
                            name="response" 
                            checked={selectedResponse === opt}
                            onChange={() => setSelectedResponse(opt)}
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI generated response section */}
                {selectedResponse === 'Closed with explanation' && dashboardData?.webhookResponse?.complaint_response && (
                  <div className="cfpb-section-card">
                    <h3 className="cfpb-section-card__title">What is your response to this complaint?</h3>
                    <div className="cfpb-field">
                      <textarea 
                        className="cfpb-field__input" 
                        readOnly 
                        rows={8}
                        value={dashboardData.webhookResponse.complaint_response}
                        style={{ width: '100%', resize: 'vertical', maxWidth: '100%', lineHeight: '1.6' }}
                      />
                    </div>
                  </div>
                )}

                {/* Fallback: if nothing extracted at all */}
                {!Object.keys(detail.allFields || {}).length &&
                  !Object.keys(detail.sections || {}).length &&
                  !detail.narrative && (
                    <div className="cfpb-section-card cfpb-section-card--warn">
                      <p>Detail data was limited. The page may still be loading.
                        <a href={detail.detailUrl} target="_blank" rel="noreferrer"> View the complaint directly ↗</a>
                      </p>
                    </div>
                  )}

                {/* ── JSON Viewer ── */}
                <div className="cfpb-json-section">
                  <button
                    className={`cfpb-btn-json ${showJson ? 'cfpb-btn-json--active' : ''}`}
                    onClick={() => setShowJson(v => !v)}
                    aria-expanded={showJson}
                  >
                    <span className="cfpb-btn-json__icon">{showJson ? '▲' : '{ }'}</span>
                    {showJson ? 'Hide JSON Data' : 'View Raw JSON Data'}
                  </button>

                  {showJson && (
                    <div className="cfpb-json-viewer">
                      <div className="cfpb-json-viewer__toolbar">
                        <span className="cfpb-json-viewer__title">Complaint Data — JSON</span>
                        <button
                          className="cfpb-json-viewer__copy"
                          onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(detail, null, 2));
                          }}
                        >
                          📋 Copy
                        </button>
                      </div>
                      <pre className="cfpb-json-viewer__pre">
                        <code dangerouslySetInnerHTML={{
                          __html: JSON.stringify(detail, null, 2)
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;')
                            .replace(
                              /("[^"]+")(\s*:)/g,
                              '<span class="json-key">$1</span>$2'
                            )
                            .replace(
                              /:\s*("[^"]*")/g,
                              ': <span class="json-str">$1</span>'
                            )
                            .replace(
                              /:\s*(\d+\.?\d*)/g,
                              ': <span class="json-num">$1</span>'
                            )
                            .replace(
                              /:\s*(true|false|null)/g,
                              ': <span class="json-bool">$1</span>'
                            )
                        }} />
                      </pre>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Right: sidebar ── */}
              <aside className="cfpb-detail__sidebar">
                <div className="cfpb-sidebar-card">
                  <div className="cfpb-sidebar-card__section">
                    <h4 className="cfpb-sidebar-card__heading">COMPLAINT STATUS</h4>
                    {detail.sidebarItems?.ALERTS && (
                      <p className="cfpb-sidebar-card__sub">ALERTS<br /><strong>{detail.sidebarItems.ALERTS}</strong></p>
                    )}
                    {detail.sidebarItems?.['COMPLAINT STATUS'] && (
                      <p className="cfpb-sidebar-card__sub">COMPLAINT STATUS<br />
                        <strong>{detail.sidebarItems['COMPLAINT STATUS']}</strong></p>
                    )}
                    {detail.sidebarItems?.['SENT TO COMPANY'] && (
                      <p className="cfpb-sidebar-card__sub">SENT TO COMPANY<br />
                        <strong>{detail.sidebarItems['SENT TO COMPANY']}</strong></p>
                    )}
                    {detail.sidebarItems?.['DUE DATE'] && (
                      <p className="cfpb-sidebar-card__due">
                        DUE DATE<br /><strong>{detail.sidebarItems['DUE DATE']}</strong>
                      </p>
                    )}
                    {detail.sidebarItems?.['CCDB ID'] && (
                      <p className="cfpb-sidebar-card__sub">CCDB ID<br />
                        <strong>{detail.sidebarItems['CCDB ID']}</strong></p>
                    )}
                    {/* Fallback: show all sidebar items */}
                    {!Object.keys(detail.sidebarItems || {}).length && detail.complaintStatus && (
                      <p className="cfpb-sidebar-card__sub"><strong>{detail.complaintStatus}</strong></p>
                    )}
                  </div>
                  <div className="cfpb-sidebar-card__section">
                    <h4 className="cfpb-sidebar-card__heading">ACTIONS</h4>
                    <a href={detail.detailUrl} target="_blank" rel="noreferrer" className="cfpb-action-link">
                      💬 Respond
                    </a>
                    <a href={detail.detailUrl} target="_blank" rel="noreferrer" className="cfpb-action-link">
                      🖨 Print
                    </a>
                  </div>
                </div>

                <div className="cfpb-meta-card">
                  <p className="cfpb-meta-card__label">Scraped</p>
                  <p className="cfpb-meta-card__value">
                    {new Date(dashboardData.scrapedAt).toLocaleString()}
                  </p>
                  <a href={detail.detailUrl} target="_blank" rel="noreferrer" className="cfpb-meta-card__link">
                    View original ↗
                  </a>
                </div>
              </aside>
            </div>
          </section>
        )}

        {/* Done but no detail */}
        {isDone && !detail && (
          <section className="cfpb-card cfpb-warn-card">
            <h2>No complaint detail found</h2>
            <p>The scraper completed but could not find or navigate to a complaint detail page.
              This may mean the complaints table was empty or took too long to load.</p>
            {dashboardData?.url && (
              <a href={dashboardData.url} target="_blank" rel="noreferrer" className="cfpb-action-link">
                Open portal ↗
              </a>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
