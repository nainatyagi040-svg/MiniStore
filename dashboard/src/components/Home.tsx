import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import HandwritingSvg from './HandwritingSvg';
import ShaderHero from './ShaderHero';
import TopNav from './TopNav';
import FeaturesSection from './sections/FeaturesSection';
import PlaygroundSection from './sections/PlaygroundSection';
import ArchitectureSection from './sections/ArchitectureSection';
import BenchmarksSection from './sections/BenchmarksSection';
import GetStartedSection from './sections/GetStartedSection';
import lighthouseBg from '../assets/lighthouse-bg.png';

export default function Home() {
  const [showIntro, setShowIntro] = useState(() => {
    return !sessionStorage.getItem('ministore_intro_seen');
  });

  const handleIntroComplete = () => {
    sessionStorage.setItem('ministore_intro_seen', 'true');
    setShowIntro(false);
  };

  return (
    <div style={{ minHeight: '100vh', color: 'var(--text-main)' }}>
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
      <AnimatePresence>
        {showIntro && (
          <motion.div
            key="intro"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundImage: `url(${lighthouseBg})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              zIndex: 50
            }}
          >
            <HandwritingSvg text="MiniStore" onComplete={handleIntroComplete} />
          </motion.div>
        )}
      </AnimatePresence>

      {!showIntro && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.2 }}
        >
          <TopNav />
          <ShaderHero />
          <FeaturesSection />
          <ArchitectureSection />
          <BenchmarksSection />
          <PlaygroundSection />
          <GetStartedSection />
        </motion.div>
      )}
    </div>
  );
}
