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
}

export default function LiveDashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8090');

    ws.onopen = () => {
      setConnected(true);
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
    };

    return () => {
      ws.close();
    };
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
      
      {!snapshot ? (
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
        </main>
      )}
    </motion.div>
    </div>
  );
}
