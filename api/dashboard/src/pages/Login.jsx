import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import '../styles/intellicon-login.css';

// Import your logo images
import intelliconLogo from '../assets/images/intellicon-logo.png';
import intelliconLogoBulb from '../assets/images/intellicon-logo-bulb.png';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e) => {
	  e.preventDefault();
	  setLoading(true);

	  try {
		await login(email, password, rememberMe);
		toast.success('Welcome back!');
		
		const from = location.state?.from?.pathname || '/';
		navigate(from, { replace: true });
	  } catch (error) {
		toast.error(error.response?.data?.error || 'Login failed');
	  } finally {
		setLoading(false);
	  }
  };

  return (
    <div className="intellicon-login-wrapper">
      <div className="login-orb login-orb1"></div>
      <div className="login-orb login-orb2"></div>
      <div className="login-orb login-orb3"></div>

      <div className="login-container">
        <div className="login-card">
          {/* Left Side - Visual */}
          <div className="visual-side">
            <div className="cube-container">
              <div className="cube">
                <div className="cube-face face-front">
                  <img src={intelliconLogoBulb} alt="Logo" />
                </div>
                <div className="cube-face face-back">
                  <span className="icon">💬</span>
                </div>
                <div className="cube-face face-right">
                  <span className="icon">📞</span>
                </div>
                <div className="cube-face face-left">
                  <span className="icon">🌐</span>
                </div>
                <div className="cube-face face-top">
                  <span className="icon">⚡</span>
                </div>
                <div className="cube-face face-bottom">
                  <span className="icon">🤖</span>
                </div>
              </div>
            </div>

            <div className="visual-text">
              <h2 className="visual-title">Intellicon AiVA Platform</h2>
              <p className="visual-subtitle">
                Next-generation AI communication platform<br/>
                powered by intelligent voice and chat technology
              </p>
            </div>

            <div className="stats">
              <div className="stat-item">
                <span className="stat-number">99.9%</span>
                <span className="stat-label">Uptime</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">50K+</span>
                <span className="stat-label">Users</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">24/7</span>
                <span className="stat-label">Support</span>
              </div>
            </div>
          </div>

          {/* Right Side - Form */}
          <div className="form-side">
            <div className="form-header">
              <div className="login-logo">
                <img src={intelliconLogo} alt="Intellicon" />
              </div>

              <h1 className="form-title">Welcome back</h1>
              <p className="form-subtitle">Sign in to your account to continue</p>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <label className="input-label">Email address</label>
                <div className="input-wrapper">
                  <span className="input-icon">📧</span>
                  <input 
                    type="email" 
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Password</label>
                <div className="input-wrapper">
                  <span className="input-icon">🔒</span>
                  <input 
                    type="password" 
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/*<div className="form-options">
                <label className="checkbox-wrapper">
                  <input 
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span className="checkbox-label">Remember me</span>
                </label>
                <a href="#" className="forgot-link">Forgot password?</a>
              </div>*/}

              <button type="submit" className="login-button" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign in to AiVA'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;