import { Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import LiveDashboard from './components/LiveDashboard';
import './index.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/dashboard" element={<LiveDashboard />} />
    </Routes>
  );
}

export default App;
