import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const API = '/api';

// Status labels shown to the user
const STATUS_LABELS = {
  idle: 'Idle',
  launching: 'Launching browser & logging in…',
  waiting_verify: 'Waiting for verification code',
  verifying: 'Verifying code…',
  scraping: 'Scraping dashboard…',
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
  const [timeLeft, setTimeLeft] = useState(null); // seconds
  const pollRef = useRef(null);
  const startedRef = useRef(false); // guard against double-start (React StrictMode)

  // ─ Poll /status every 3 s while a session is alive 
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${API}/status`);
      const data = await res.json();
      setSessionStatus(data.status);
      setSessionActive(data.active);
      setTimeLeft(data.keepAliveSecondsLeft);
      if (data.error) setError(data.error);
      // Show inline verify error from the site (bad code), clear it when status moves on
      if (data.verifyError) {
        setVerifyError(data.verifyError);
        setVerifySubmitting(false);
      } else if (data.status !== 'verifying') {
        // Clear stale verify error once we move past it
        setVerifyError('');
      }
      if (data.dashboardData) setDashboardData(data.dashboardData);

      // Stop polling once terminal state reached
      if (data.status === 'done' || data.status === 'error') {
        stopPolling();
      }
    } catch (e) {
      console.error('Poll error:', e);
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(poll, 3000);
    poll(); // immediate first call
  }, [poll]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    // On mount, check if a session is already running (e.g. page refresh)
    poll();
    return () => stopPolling();
  }, [poll, stopPolling]);

  // ─ Start session 
  const handleReady = async () => {
    if (sessionActive) return; // already running — button is disabled
    setError(null);
    setDashboardData(null);
    setVerifyCode('');
    setVerifyError('');

    try {
      const res = await fetch(`${API}/start`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to start session');
        return;
      }
      setSessionActive(true);
      setSessionStatus('launching');
      startPolling();
    } catch (e) {
      setError('Cannot reach backend. Is it running on port 3001?');
    }
  };

  // ─ Submit verification code 
  const handleVerify = async (e) => {
    e.preventDefault();
    if (!verifyCode.trim()) {
      setVerifyError('Please enter the verification code.');
      return;
    }
    setVerifyError('');
    setVerifySubmitting(true);
    try {
      const res = await fetch(`${API}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verifyCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyError(data.error || 'Verification failed');
      }
      // status updates come from polling
    } catch (e) {
      setVerifyError('Cannot reach backend.');
    } finally {
      setVerifySubmitting(false);
    }
  };

  // ─ Reset / start over 
  const handleReset = async () => {
    stopPolling();
    await fetch(`${API}/reset`, { method: 'POST' }).catch(() => { });
    setSessionStatus('idle');
    setSessionActive(false);
    setError(null);
    setDashboardData(null);
    setVerifyCode('');
    setVerifyError('');
    setTimeLeft(null);
  };

  // ─ Derived UI flags 
  const isIdle = sessionStatus === 'idle';
  const isWaitingVerify = sessionStatus === 'waiting_verify';
  const isDone = sessionStatus === 'done';
  const isError = sessionStatus === 'error';
  const isTerminal = isDone || isError;
  const isBusy = sessionActive && !isWaitingVerify;

  const formatTime = (secs) => {
    if (secs === null) return '';
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="cfpb-app">
      {/* Header */}
      <header className="cfpb-header">
        <div className="cfpb-header__inner">
          <div className="cfpb-logo">
            <span className="cfpb-logo__cfpb">CFPB</span>
          </div>
        </div>
      </header>

      <main className="cfpb-main">
        {/* ─ Status Card ─ */}
        <section className="cfpb-card cfpb-status-card">
          <h1 className="cfpb-card__title">Session Manager</h1>

          {/* Status badge */}
          {/* <div className={`cfpb-badge cfpb-badge--${sessionStatus}`}>
            {STATUS_LABELS[sessionStatus] || sessionStatus}
          </div> */}

          {/* Keep-alive timer */}
          {timeLeft !== null && !isTerminal && (
            <div className="cfpb-timer">
              <span className="cfpb-timer__label">Session expires in</span>
              <span className={`cfpb-timer__value ${timeLeft < 60 ? 'cfpb-timer__value--urgent' : ''}`}>
                {formatTime(timeLeft)}
              </span>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="cfpb-alert cfpb-alert--error" role="alert">
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* ─ READY button: visible only when idle ─ */}
          {isIdle && (
            <button
              className="cfpb-btn cfpb-btn--ready"
              onClick={handleReady}
              aria-label="Start a new portal session"
            >
              <span className="cfpb-btn__icon">▶</span>
              Ready
            </button>
          )}

          {/* Loading spinner while launching / verifying / scraping */}
          {isBusy && (
            <div className="cfpb-spinner-wrap" aria-live="polite">
              <div className="cfpb-spinner" aria-hidden="true" />
              <p className="cfpb-spinner__text">{STATUS_LABELS[sessionStatus]}</p>
            </div>
          )}

          {/* ─ Verification Code Form: visible when waiting ─ */}
          {isWaitingVerify && (
            <form className="cfpb-verify-form" onSubmit={handleVerify} noValidate>
              <p className="cfpb-verify-form__info">
                A verification code was sent to your registered method.<br />
                Enter it below within the time limit.
              </p>
              <div className="cfpb-field">
                <label className="cfpb-field__label" htmlFor="verifyCode">
                  Verification Code
                </label>
                <input
                  id="verifyCode"
                  className="cfpb-field__input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Enter code…"
                  value={verifyCode}
                  onChange={(e) => { setVerifyCode(e.target.value); setVerifyError(''); }}
                  disabled={verifySubmitting}
                  maxLength={8}
                  aria-describedby={verifyError ? 'verifyError' : undefined}
                />
                {verifyError && (
                  <span id="verifyError" className="cfpb-field__error" role="alert">
                    {verifyError}
                  </span>
                )}
              </div>
              <button
                type="submit"
                className="cfpb-btn cfpb-btn--submit"
                disabled={verifySubmitting || !verifyCode.trim()}
              >
                {verifySubmitting ? 'Submitting…' : 'Submit Code'}
              </button>
            </form>
          )}

          {/* Reset / start-over button (always available except when idle) */}
          {!isIdle && (
            <button
              className="cfpb-btn cfpb-btn--reset"
              onClick={handleReset}
              aria-label="Reset session and start over"
            >
              ✕ Reset Session
            </button>
          )}
        </section>

        {/* ─ Dashboard Data ─ */}
        {isDone && dashboardData && (
          <section className="cfpb-card cfpb-dashboard-card">
            <h2 className="cfpb-card__title">Dashboard Data</h2>
            <p className="cfpb-dashboard__meta">
              Scraped from <a href={dashboardData.url} target="_blank" rel="noreferrer">{dashboardData.url}</a>
              {' '}at {new Date(dashboardData.scrapedAt).toLocaleString()}
            </p>

            {dashboardData.headings?.length > 0 && (
              <div className="cfpb-section">
                <h3 className="cfpb-section__title">Headings</h3>
                <ul className="cfpb-list">
                  {dashboardData.headings.map((h, i) => <li key={i}>{h}</li>)}
                </ul>
              </div>
            )}

            {dashboardData.tables?.length > 0 && (
              <div className="cfpb-section">
                <h3 className="cfpb-section__title">Tables</h3>
                {dashboardData.tables.map((tbl, ti) => (
                  <div key={ti} className="cfpb-table-wrap">
                    <table className="cfpb-table">
                      {tbl.headers.length > 0 && (
                        <thead>
                          <tr>{tbl.headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
                        </thead>
                      )}
                      <tbody>
                        {tbl.rows.map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => <td key={ci}>{cell}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}

            {dashboardData.links?.length > 0 && (
              <div className="cfpb-section">
                <h3 className="cfpb-section__title">Links</h3>
                <ul className="cfpb-list cfpb-list--links">
                  {dashboardData.links.slice(0, 30).map((l, i) => (
                    <li key={i}>
                      <a href={l.href} target="_blank" rel="noreferrer">{l.text}</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {dashboardData.paragraphs?.length > 0 && (
              <div className="cfpb-section">
                <h3 className="cfpb-section__title">Content</h3>
                <div className="cfpb-paragraphs">
                  {dashboardData.paragraphs.slice(0, 20).map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Raw body text fallback */}
            {!dashboardData.headings?.length && !dashboardData.paragraphs?.length && dashboardData.bodyText && (
              <div className="cfpb-section">
                <h3 className="cfpb-section__title">Raw Content</h3>
                <pre className="cfpb-raw">{dashboardData.bodyText}</pre>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
