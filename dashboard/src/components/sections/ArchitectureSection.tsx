import { useScrollFade } from '../useScrollFade';

export default function ArchitectureSection() {
  const { ref, isVisible } = useScrollFade();

  return (
    <section id="architecture" style={{ padding: '6rem 2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <div 
        ref={ref}
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0)' : 'translateY(30px)',
          transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        <h2 style={{ fontSize: '2.5rem', marginBottom: '3rem', textAlign: 'center', color: 'var(--text-main)' }}>
          Architecture
        </h2>
        
        <div style={{
          background: 'rgba(30, 41, 59, 0.85)',
          border: '1px solid var(--border-color)',
          borderRadius: '1rem',
          padding: '3rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2rem'
        }}>
          
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <div style={{ padding: '1rem 2rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', textAlign: 'center' }}>
              <div style={{ color: 'var(--text-main)', fontWeight: 600 }}>ministore/cli</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Interactive REPL</div>
            </div>
            
            <div style={{ padding: '1rem 2rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', textAlign: 'center' }}>
              <div style={{ color: 'var(--text-main)', fontWeight: 600 }}>ministore/dashboard</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>React Web UI</div>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
            <div style={{ color: 'var(--accent)', fontSize: '1.5rem' }}>&darr;</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', width: '120px', textAlign: 'center' }}>TCP / WebSocket</div>
            <div style={{ color: 'var(--accent)', fontSize: '1.5rem' }}>&darr;</div>
          </div>
          
          <div style={{ padding: '1.5rem 3rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '0.5rem', textAlign: 'center', width: '100%', maxWidth: '400px' }}>
            <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '1.25rem' }}>ministore/store-engine</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>TcpServer + StatsServer + InMemoryStore</div>
          </div>
          
          <div style={{ color: 'var(--text-muted)', fontSize: '1.5rem' }}>&darr;</div>
          
          <div style={{ padding: '1rem 2rem', background: '#1e293b', border: '1px dashed #475569', borderRadius: '0.5rem', textAlign: 'center', width: '100%', maxWidth: '400px' }}>
            <div style={{ color: 'var(--text-main)', fontWeight: 600 }}>ministore/protocol</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Command Parsing & Reply Encoding</div>
          </div>

        </div>
      </div>
    </section>
  );
}
