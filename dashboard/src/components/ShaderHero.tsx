import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import lighthouseBg from '../assets/lighthouse-bg.png';

interface ShaderHeroProps {
  headline: string;
  subtitle: string;
}

export default function ShaderHero({ headline, subtitle }: ShaderHeroProps) {
  const navigate = useNavigate();

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
        background: 'linear-gradient(to bottom, rgba(15, 23, 42, 0.1), rgba(15, 23, 42, 0.6))',
        padding: '2rem',
        textAlign: 'center'
      }}>
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          style={{
            padding: '0.5rem 1rem',
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '9999px',
            color: 'var(--accent)',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '2rem',
            letterSpacing: '0.05em',
            textTransform: 'uppercase'
          }}
        >
          New: Live Pub/Sub + Persistence
        </motion.div>

        {/* Headline */}
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          style={{
            fontSize: 'clamp(3rem, 6vw, 5rem)',
            lineHeight: 1.1,
            fontWeight: 800,
            margin: '0 0 1.5rem 0',
            maxWidth: '1000px',
            color: '#fff',
            textShadow: '0 4px 20px rgba(0,0,0,0.5)'
          }}
        >
          A Redis-inspired store,<br />
          <span style={{ 
            background: 'linear-gradient(90deg, #38bdf8, #818cf8)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 0 20px rgba(56,189,248,0.3))'
          }}>built from scratch.</span>
        </motion.h1>
        
        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          style={{
            fontSize: '1.25rem',
            color: 'var(--text-muted)',
            marginBottom: '3rem',
            maxWidth: '700px',
            lineHeight: 1.6
          }}
        >
          An in-memory key-value store with TTL, LRU eviction, live Pub/Sub, and dual persistence (Snapshot + AOF), built entirely in TypeScript.
        </motion.p>
        
        {/* Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}
        >
          {/* Primary Button */}
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              padding: '1rem 2.5rem',
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'var(--bg-color)',
              backgroundColor: 'var(--text-main)',
              border: 'none',
              borderRadius: '9999px',
              cursor: 'pointer',
              transition: 'transform 0.2s, background-color 0.2s',
              boxShadow: '0 0 20px rgba(255, 255, 255, 0.2)'
            }}
            onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.backgroundColor = '#fff'; }}
            onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.backgroundColor = 'var(--text-main)'; }}
          >
            Enter Dashboard
          </button>
          
          {/* Secondary Button */}
          <a
            href="#playground"
            style={{
              padding: '1rem 2.5rem',
              fontSize: '1.125rem',
              fontWeight: 600,
              color: '#fff',
              backgroundColor: 'transparent',
              border: '2px solid rgba(255,255,255,0.2)',
              borderRadius: '9999px',
              cursor: 'pointer',
              textDecoration: 'none',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; }}
            onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            Try the Playground
          </a>
        </motion.div>

        {/* Tech Stack Row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1 }}
          style={{
            position: 'absolute',
            bottom: '2rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem'
          }}
        >
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Built With
          </div>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {['TypeScript', 'Node.js', 'React', 'WebSocket'].map(tech => (
              <div key={tech} style={{
                color: '#fff',
                fontSize: '1rem',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                opacity: 0.8
              }}>
                {tech}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
