// api.js – VNG LearnZoo Frontend API Service (Offline-Ready, Fixed)
const API_BASE = 'https://gamified-backend-app.onrender.com/api';

// Helper: get offline users database
function getOfflineUsers() {
  return JSON.parse(localStorage.getItem('lz_offline_users') || '{}');
}

function saveOfflineUsers(users) {
  localStorage.setItem('lz_offline_users', JSON.stringify(users));
}

// Simple hash for offline validation (SHA-256)
async function hashPassword(pwd) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pwd);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Store user credentials offline (call after successful online login/signup)
async function storeOfflineCredential(user, plainPassword) {
  try {
    const users = getOfflineUsers();
    const hashed = await hashPassword(plainPassword);
    users[user.email] = {
      id: user.id || user._id,
      name: user.name,
      email: user.email,
      passwordHash: hashed,
      role: user.role,
      grade: user.grade,
      xp: user.xp || 0,
      streak: user.streak || 0,
      gamesPlayed: user.gamesPlayed || 0
    };
    saveOfflineUsers(users);
    console.log('✅ Offline credentials saved for', user.email);
  } catch (e) {
    console.error('Failed to save offline credentials:', e);
  }
}

function getToken() {
  return localStorage.getItem('lz_token');
}

// ========== AUTH (with guaranteed offline storage) ==========
async function login(email, password, role, grade) {
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role, grade })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    localStorage.setItem('lz_token', data.token);
    localStorage.setItem('lz_user', JSON.stringify(data.user));
    
    // ✅ Save offline credentials immediately after successful online login
    await storeOfflineCredential(data.user, password);
    
    return data.user;
  } catch (error) {
    console.warn('Online login failed, trying offline...', error.message);
    // Offline fallback
    const users = getOfflineUsers();
    const hashed = await hashPassword(password);
    const user = users[email];
    if (user && user.passwordHash === hashed) {
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
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role, grade })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    localStorage.setItem('lz_token', data.token);
    localStorage.setItem('lz_user', JSON.stringify(data.user));
    
    // ✅ Save offline credentials immediately after successful online signup
    await storeOfflineCredential(data.user, password);
    
    return data.user;
  } catch (error) {
    console.warn('Online signup failed, creating offline account...', error.message);
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
  const token = getToken();
  if (!token) throw new Error('Not logged in');
  try {
    const res = await fetch(`${API_BASE}/user/profile`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  } catch (error) {
    // Offline fallback
    const cachedUser = JSON.parse(localStorage.getItem('lz_user') || '{}');
    if (cachedUser.id) return cachedUser;
    throw error;
  }
}

async function updateUserProfile(updates) {
  const token = getToken();
  if (!token) throw new Error('Not logged in');
  try {
    const res = await fetch(`${API_BASE}/user/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    // Update local user
    const user = JSON.parse(localStorage.getItem('lz_user') || '{}');
    Object.assign(user, updates);
    localStorage.setItem('lz_user', JSON.stringify(user));
    return data;
  } catch (error) {
    // Offline: update local only
    const user = JSON.parse(localStorage.getItem('lz_user') || '{}');
    Object.assign(user, updates);
    localStorage.setItem('lz_user', JSON.stringify(user));
    return user;
  }
}

// ========== GAME RESULTS ==========
async function submitGameResult(gameId, score, xpEarned) {
  const token = getToken();
  const body = JSON.stringify({ gameId, score, xpEarned });
  try {
    const res = await fetch(`${API_BASE}/game/result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  } catch (error) {
    // Queue for later sync
    const pending = JSON.parse(localStorage.getItem('pendingGameResults') || '[]');
    pending.push({ gameId, score, xpEarned, timestamp: Date.now() });
    localStorage.setItem('pendingGameResults', JSON.stringify(pending));
    // Update local user stats
    const user = JSON.parse(localStorage.getItem('lz_user') || '{}');
    user.xp = (user.xp || 0) + xpEarned;
    user.gamesPlayed = (user.gamesPlayed || 0) + 1;
    user.streak = (user.streak || 0) + 1;
    localStorage.setItem('lz_user', JSON.stringify(user));
    return { xp: user.xp, streak: user.streak, gamesPlayed: user.gamesPlayed };
  }
}

// ========== LEADERBOARD ==========
async function getLeaderboard(grade) {
  try {
    const res = await fetch(`${API_BASE}/leaderboard/${grade}`);
    return await res.json();
  } catch (error) {
    const users = Object.values(getOfflineUsers()).filter(u => u.role === 'student' && u.grade == grade);
    return users.sort((a, b) => (b.xp || 0) - (a.xp || 0)).slice(0, 20);
  }
}

// ========== TEACHER ENDPOINTS ==========
async function getTeacherStudents(grade = null) {
  const token = getToken();
  const url = grade ? `/teacher/students?grade=${grade}` : '/teacher/students';
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}
async function getAtRiskStudents(grade = null) {
  const token = getToken();
  const url = grade ? `/teacher/atrisk?grade=${grade}` : '/teacher/atrisk';
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}
async function sendNudge(studentId, message) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/teacher/nudge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ studentId, message })
  });
  return res.json();
}
async function getClassStats(grade) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/teacher/stats/${grade}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}

// Export
if (typeof window !== 'undefined') {
  window.API = {
    login, signup, logout,
    getUserProfile, updateUserProfile,
    submitGameResult, getLeaderboard,
    getTeacherStudents, getAtRiskStudents, sendNudge, getClassStats
  };
}