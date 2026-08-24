import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import lighthouseBg from '../assets/lighthouse-bg.png';

export default function About() {
  const navigate = useNavigate();

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
      
      <div style={{ padding: '2rem', display: 'flex', justifyContent: 'flex-start' }}>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '9999px',
            backgroundColor: 'transparent',
            color: 'var(--text-main)',
            border: '1px solid var(--border-color)',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background-color 0.2s',
            backdropFilter: 'blur(10px)'
          }}
          onMouseOver={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
          onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          ← Back to Home
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={{
          maxWidth: '800px',
          margin: '2rem auto',
          padding: '3rem',
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(12px)',
          borderRadius: '1rem',
          border: '1px solid var(--border-color)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        }}
      >
        <h1 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '1.5rem', background: 'linear-gradient(to right, #60a5fa, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          About MiniStore
        </h1>
        <div style={{ fontSize: '1.125rem', lineHeight: 1.7, color: 'var(--text-muted)' }}>
          <p style={{ marginBottom: '1.5rem' }}>
            MiniStore was built from scratch in TypeScript as a hands-on learning project to demystify how Redis-like systems work under the hood. Instead of treating in-memory databases as black boxes, this project explores their core internals: designing a zero-copy wire protocol, managing active and lazy TTL eviction, implementing publish/subscribe messaging, and ensuring durability through background snapshots and Append-Only Files (AOF).
          </p>
          <p>
            Please note that MiniStore is an educational demonstration of database internals, not a production Redis replacement. It intentionally skips clustering, authentication, and high-availability features to focus on delivering a transparent, accessible, and readable from-scratch implementation of a high-performance data store.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
