import { useScrollFade } from '../useScrollFade';

const benchmarkData = [
  { command: 'SET', ops: '50,000', time: '1882.18', rate: '26,565' },
  { command: 'GET', ops: '50,000', time: '410.04', rate: '121,940' },
  { command: 'LPUSH/LPOP', ops: '50,000', time: '664.20', rate: '75,278' },
  { command: 'HSET/HGET', ops: '50,000', time: '3367.15', rate: '14,849' },
  { command: 'Mixed Workload', ops: '50,000', time: '1211.56', rate: '41,269' }
];

export default function BenchmarksSection() {
  const { ref, isVisible } = useScrollFade();

  return (
    <section id="benchmarks" style={{ padding: '6rem 2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <div 
        ref={ref}
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0)' : 'translateY(30px)',
          transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        <h2 style={{ fontSize: '2.5rem', marginBottom: '1rem', textAlign: 'center', color: 'var(--text-main)' }}>
          Benchmarks
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '3rem' }}>
          Raw throughput on a local instance (50,000 operations).
        </p>
        
        <div style={{
          background: 'rgba(30, 41, 59, 0.85)',
          border: '1px solid var(--border-color)',
          borderRadius: '1rem',
          overflow: 'hidden'
        }}>
          <table className="keys-table">
            <thead>
              <tr>
                <th>Command</th>
                <th>Total Ops</th>
                <th>Total Time (ms)</th>
                <th>Ops/sec</th>
              </tr>
            </thead>
            <tbody>
              {benchmarkData.map((b, i) => (
                <tr key={i} className="key-row">
                  <td className="key-col" style={{ color: 'var(--accent)' }}>{b.command}</td>
                  <td>{b.ops}</td>
                  <td>{b.time}</td>
                  <td style={{ fontWeight: 600, color: 'var(--success)' }}>{b.rate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
