import { useScrollFade } from '../useScrollFade';

export default function GetStartedSection() {
  const { ref, isVisible } = useScrollFade();

  const codeStyle = {
    background: '#0f172a',
    padding: '1.5rem',
    borderRadius: '0.5rem',
    color: '#e2e8f0',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '0.875rem',
    border: '1px solid var(--border-color)',
    overflowX: 'auto' as const
  };

  return (
    <section id="get-started" style={{ padding: '6rem 2rem', maxWidth: '1000px', margin: '0 auto', borderTop: '1px solid var(--border-color)' }}>
      <div 
        ref={ref}
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0)' : 'translateY(30px)',
          transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        <h2 style={{ fontSize: '2.5rem', marginBottom: '3rem', textAlign: 'center', color: 'var(--text-main)' }}>
          Get Started
        </h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
          <div>
            <h3 style={{ color: 'var(--accent)', marginBottom: '1rem', fontSize: '1.25rem' }}>1. Start the Server</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Run the store-engine and dashboard simultaneously.</p>
            <div style={codeStyle}>npm start:all</div>
          </div>
          
          <div>
            <h3 style={{ color: 'var(--accent)', marginBottom: '1rem', fontSize: '1.25rem' }}>2. Use the CLI</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Connect via the interactive REPL.</p>
            <div style={codeStyle}>npm run cli</div>
          </div>
          
          <div>
            <h3 style={{ color: 'var(--accent)', marginBottom: '1rem', fontSize: '1.25rem' }}>3. Run Benchmarks</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Test throughput on your local machine.</p>
            <div style={codeStyle}>npm run benchmark</div>
          </div>
        </div>
      </div>
    </section>
  );
}
