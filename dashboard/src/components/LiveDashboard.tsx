import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import lighthouseBg from '../assets/lighthouse-bg.png';

interface KeyStats {
  name: string;
  type: string;
  ttl: number;
}

interface Snapshot {
  size: number;
  maxKeys: number;
  evictions: number;
  keys: KeyStats[];
  recentActivity?: string[];
}

export default function LiveDashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [token, setToken] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const connect = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsConnecting(true);
    setError('');

    const wsUrl = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:8090`;
    const urlWithToken = `${wsUrl}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(urlWithToken);

    ws.onopen = () => {
      setConnected(true);
      setIsConnecting(false);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setSnapshot(data);
      } catch (err) {
        console.error('Failed to parse snapshot', err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setIsConnecting(false);
      if (!connected) {
        setError('Connection failed. Incorrect password or server is offline.');
      }
    };

    return () => {
      ws.close();
    };
  };

  useEffect(() => {
    // We don't auto-connect if we want to show login, but wait, maybe the server doesn't require a password?
    // Let's just try to connect without password first.
    let cleanup = connect();
    return () => { if (cleanup) cleanup(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight: '100vh', color: 'var(--text-main)', position: 'relative' }}>
      {/* Fixed Full-Page Background */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundImage: `url(${lighthouseBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          zIndex: -2
        }}
      />
      {/* Dark Overlay */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(15, 23, 42, 0.8)',
          zIndex: -1
        }}
      />
      <motion.div 
        className="dashboard-container"
        initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <header className="header" style={{ position: 'relative' }}>
        <button
          onClick={() => navigate('/')}
          style={{
            position: 'absolute',
            top: '0',
            right: '0',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            fontWeight: 600,
            color: 'var(--bg-color)',
            backgroundColor: 'var(--text-main)',
            border: 'none',
            borderRadius: '9999px',
            cursor: 'pointer',
            transition: 'transform 0.2s, background-color 0.2s',
            boxShadow: '0 0 15px rgba(255, 255, 255, 0.2)'
          }}
          onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.backgroundColor = '#fff'; }}
          onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.backgroundColor = 'var(--text-main)'; }}
        >
          Exit Dashboard
        </button>
        <h1>MiniStore Dashboard</h1>
        <div className={`status-badge ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? 'Live' : 'Disconnected'}
        </div>
      </header>
      
      {!connected ? (
        <div className="login-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, marginTop: '4rem' }}>
          <form onSubmit={connect} style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '2rem', borderRadius: '1rem', border: '1px solid var(--accent)', display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '300px' }}>
            <h2>Authentication Required</h2>
            {error && <p style={{ color: '#ef4444', fontSize: '0.875rem' }}>{error}</p>}
            <input 
              type="password" 
              placeholder="Dashboard Password" 
              value={token} 
              onChange={e => setToken(e.target.value)}
              style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.5)', color: 'white' }}
            />
            <button 
              type="submit" 
              disabled={isConnecting}
              style={{ padding: '0.75rem', borderRadius: '0.5rem', border: 'none', background: 'var(--accent)', color: 'var(--bg-color)', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {isConnecting ? 'Connecting...' : 'Connect'}
            </button>
          </form>
        </div>
      ) : !snapshot ? (
        <div className="loading">Waiting for data...</div>
      ) : (
        <main className="content">
          <section className="stats-cards">
            <div className="card">
              <h3>Live Keys</h3>
              <p className="big-value">
                {snapshot.size} <span className="max-value">/ {snapshot.maxKeys}</span>
              </p>
            </div>
            <div className="card">
              <h3>Total Evictions</h3>
              <p className="big-value">{snapshot.evictions}</p>
            </div>
          </section>

          <section className="keys-section">
            <h2>Keys (MRU &rarr; LRU)</h2>
            <div className="table-container">
              {snapshot.keys.length === 0 ? (
                <p className="empty-state">The store is empty.</p>
              ) : (
                <table className="keys-table">
                  <thead>
                    <tr>
                      <th>Position</th>
                      <th>Key</th>
                      <th>Type</th>
                      <th>TTL (s)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.keys.map((k, index) => (
                      <tr key={k.name} className="key-row">
                        <td className="pos-col">#{index + 1}</td>
                        <td className="key-col">{k.name}</td>
                        <td className="type-col">
                          <span className={`type-badge type-${k.type}`}>{k.type}</span>
                        </td>
                        <td className="ttl-col">
                          {k.ttl === -1 ? <span className="persistent">Persistent</span> : <span className="expiring">{k.ttl}s</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="activity-section" style={{ marginTop: '2rem' }}>
            <h2>Recent Activity</h2>
            <div className="table-container" style={{ padding: '1rem', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '0.5rem' }}>
              {(!snapshot.recentActivity || snapshot.recentActivity.length === 0) ? (
                <p className="empty-state">No recent mutating commands.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontFamily: 'monospace', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {snapshot.recentActivity.map((log, index) => (
                    <li key={index} style={{ padding: '0.5rem', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '0.25rem', borderLeft: '3px solid var(--accent)' }}>
                      {log}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </main>
      )}
    </motion.div>
    </div>
  );
}
