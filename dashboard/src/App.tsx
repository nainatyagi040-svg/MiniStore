import { useEffect, useState } from 'react';
import './index.css';

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

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);

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
    <div className="dashboard-container">
      <header className="header">
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
    </div>
  );
}

export default App;
