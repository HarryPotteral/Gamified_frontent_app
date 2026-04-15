// api.js – VNG LearnZoo Frontend API Service (Offline-Ready)
const API_BASE = 'https://gamified-backend-app.onrender.com/api';

// Helper: get offline users database
function getOfflineUsers() {
  return JSON.parse(localStorage.getItem('lz_offline_users') || '{}');
}

function saveOfflineUsers(users) {
  localStorage.setItem('lz_offline_users', JSON.stringify(users));
}

// Simple hash for demo (DO NOT use in production; use bcrypt on server)
async function hashPassword(pwd) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pwd);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Get token (works offline)
function getToken() {
  return localStorage.getItem('lz_token');
}

// Helper for authenticated requests with offline fallback
async function authFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'API request failed');
    return data;
  } catch (error) {
    // Offline fallback for specific endpoints
    if (endpoint === '/user/profile' && options.method === 'GET') {
      const cachedUser = JSON.parse(localStorage.getItem('lz_user') || '{}');
      if (cachedUser.id) return cachedUser;
      throw new Error('Not logged in');
    }
    if (endpoint === '/game/result' && options.method === 'POST') {
      // Queue for later sync
      const body = JSON.parse(options.body);
      const pending = JSON.parse(localStorage.getItem('pendingGameResults') || '[]');
      pending.push({ ...body, timestamp: Date.now() });
      localStorage.setItem('pendingGameResults', JSON.stringify(pending));
      // Return mock response with updated local stats
      const user = JSON.parse(localStorage.getItem('lz_user') || '{}');
      user.xp = (user.xp || 0) + body.xpEarned;
      user.gamesPlayed = (user.gamesPlayed || 0) + 1;
      user.streak = (user.streak || 0) + 1;
      localStorage.setItem('lz_user', JSON.stringify(user));
      return { xp: user.xp, streak: user.streak, gamesPlayed: user.gamesPlayed };
    }
    throw error;
  }
}

// ========== AUTH (with offline support) ==========
async function login(email, password, role, grade) {
  try {
    // Try server first
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role, grade })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('lz_token', data.token);
    localStorage.setItem('lz_user', JSON.stringify(data.user));
    return data.user;
  } catch (error) {
    console.warn('Offline login attempt:', error.message);
    // Offline fallback: check local users database
    const users = getOfflineUsers();
    const hashed = await hashPassword(password);
    const user = users[email];
    if (user && user.passwordHash === hashed) {
      // Valid offline login
      const sessionUser = { ...user, passwordHash: undefined };
      localStorage.setItem('lz_token', 'offline-token-' + Date.now());
      localStorage.setItem('lz_user', JSON.stringify(sessionUser));
      return sessionUser;
    }
    throw new Error('Invalid email or password (and offline)');
  }
}

async function signup(name, email, password, role, grade) {
  try {
    // Try server first
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role, grade })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('lz_token', data.token);
    localStorage.setItem('lz_user', JSON.stringify(data.user));
    // Also save offline
    const users = getOfflineUsers();
    users[email] = {
      id: data.user.id,
      name,
      email,
      passwordHash: await hashPassword(password),
      role,
      grade: role === 'student' ? grade : undefined,
      xp: 0,
      streak: 0,
      gamesPlayed: 0
    };
    saveOfflineUsers(users);
    return data.user;
  } catch (error) {
    console.warn('Offline signup attempt:', error.message);
    // Offline fallback: create local account
    const users = getOfflineUsers();
    if (users[email]) throw new Error('Email already registered (offline)');
    const hashed = await hashPassword(password);
    const newUser = {
      id: 'local_' + Date.now(),
      name,
      email,
      passwordHash: hashed,
      role,
      grade: role === 'student' ? grade : undefined,
      xp: 0,
      streak: 0,
      gamesPlayed: 0
    };
    users[email] = newUser;
    saveOfflineUsers(users);
    const sessionUser = { ...newUser, passwordHash: undefined };
    localStorage.setItem('lz_token', 'offline-token-' + Date.now());
    localStorage.setItem('lz_user', JSON.stringify(sessionUser));
    return sessionUser;
  }
}

function logout() {
  localStorage.removeItem('lz_token');
  localStorage.removeItem('lz_user');
  window.location.href = 'login.html';
}

// ========== USER PROFILE ==========
async function getUserProfile() {
  return authFetch('/user/profile');
}

async function updateUserProfile(updates) {
  // For offline, just update local user
  try {
    return await authFetch('/user/profile', {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  } catch (error) {
    const user = JSON.parse(localStorage.getItem('lz_user') || '{}');
    Object.assign(user, updates);
    localStorage.setItem('lz_user', JSON.stringify(user));
    return user;
  }
}

// ========== GAME RESULTS ==========
async function submitGameResult(gameId, score, xpEarned) {
  return authFetch('/game/result', {
    method: 'POST',
    body: JSON.stringify({ gameId, score, xpEarned })
  });
}

// ========== LEADERBOARD ==========
async function getLeaderboard(grade) {
  try {
    const res = await fetch(`${API_BASE}/leaderboard/${grade}`);
    return await res.json();
  } catch (error) {
    // Offline: return local users sorted by XP
    const users = Object.values(getOfflineUsers()).filter(u => u.role === 'student' && u.grade == grade);
    return users.sort((a, b) => (b.xp || 0) - (a.xp || 0)).slice(0, 20);
  }
}

// ========== TEACHER ENDPOINTS (stub offline) ==========
async function getTeacherStudents(grade = null) {
  return authFetch(`/teacher/students${grade ? `?grade=${grade}` : ''}`);
}
async function getAtRiskStudents(grade = null) {
  return authFetch(`/teacher/atrisk${grade ? `?grade=${grade}` : ''}`);
}
async function sendNudge(studentId, message) {
  return authFetch('/teacher/nudge', { method: 'POST', body: JSON.stringify({ studentId, message }) });
}
async function getClassStats(grade) {
  return authFetch(`/teacher/stats/${grade}`);
}

// Export for global access
if (typeof window !== 'undefined') {
  window.API = {
    login, signup, logout,
    getUserProfile, updateUserProfile,
    submitGameResult, getLeaderboard,
    getTeacherStudents, getAtRiskStudents, sendNudge, getClassStats
  };
}