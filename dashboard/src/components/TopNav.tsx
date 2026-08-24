import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function TopNav() {
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      // Show navbar after scrolling past hero (approx 100vh)
      if (window.scrollY > window.innerHeight - 100) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        padding: '1rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: scrolled ? 'rgba(15, 23, 42, 0.9)' : 'transparent',
        backdropFilter: scrolled ? 'blur(10px)' : 'none',
        borderBottom: scrolled ? '1px solid var(--border-color)' : '1px solid transparent',
        transition: 'all 0.3s ease',
        zIndex: 100,
        opacity: scrolled ? 1 : 0,
        pointerEvents: scrolled ? 'auto' : 'none',
        transform: scrolled ? 'translateY(0)' : 'translateY(-20px)'
      }}
    >
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
        <div style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--text-main)' }}>
          MiniStore
        </div>
      </div>
      
      <div style={{ flex: 2, display: 'flex', gap: '2rem', justifyContent: 'center', alignItems: 'center' }}>
        <a href="#features" style={{ color: 'var(--text-muted)', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color = 'var(--text-main)'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}>Features</a>
        <a href="#playground" style={{ color: 'var(--text-muted)', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color = 'var(--text-main)'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}>Playground</a>
        <a href="#architecture" style={{ color: 'var(--text-muted)', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color = 'var(--text-main)'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}>Architecture</a>
        <a href="#benchmarks" style={{ color: 'var(--text-muted)', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color = 'var(--text-main)'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}>Benchmarks</a>
        <a href="#get-started" style={{ color: 'var(--text-muted)', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color = 'var(--text-main)'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}>Get Started</a>
      </div>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '9999px',
            backgroundColor: 'var(--text-main)',
            color: 'var(--bg-color)',
            border: 'none',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'transform 0.2s, background-color 0.2s'
          }}
          onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.backgroundColor = '#fff'; }}
          onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.backgroundColor = 'var(--text-main)'; }}
        >
          Enter Dashboard
        </button>
      </div>
    </nav>
  );
}
