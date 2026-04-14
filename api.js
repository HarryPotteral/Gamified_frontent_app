// api.js – VNG LearnZoo Frontend API Service
// Replace with your actual backend URL

const API_BASE = 'https://gamified-backend-app.onrender.com/api';
// Helper to get auth token from localStorage
function getToken() {
  return localStorage.getItem('lz_token');
}

// Helper for authenticated requests
async function authFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'API request failed');
  }
  return data;
}

// ========== AUTH ==========
async function login(email, password, role, grade) {
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
}

async function signup(name, email, password, role, grade) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password, role, grade })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  localStorage.setItem('lz_token', data.token);
  localStorage.setItem('lz_user', JSON.stringify(data.user));
  return data.user;
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
  return authFetch('/user/profile', {
    method: 'PATCH',
    body: JSON.stringify(updates)
  });
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
  return fetch(`${API_BASE}/leaderboard/${grade}`).then(res => res.json());
}

// ========== TEACHER ENDPOINTS ==========
async function getTeacherStudents(grade = null) {
  const url = grade ? `/teacher/students?grade=${grade}` : '/teacher/students';
  return authFetch(url);
}

async function getAtRiskStudents(grade = null) {
  const url = grade ? `/teacher/atrisk?grade=${grade}` : '/teacher/atrisk';
  return authFetch(url);
}

async function sendNudge(studentId, message) {
  return authFetch('/teacher/nudge', {
    method: 'POST',
    body: JSON.stringify({ studentId, message })
  });
}

async function getClassStats(grade) {
  return authFetch(`/teacher/stats/${grade}`);
}

// Export for global access (since we're not using ES modules)
if (typeof window !== 'undefined') {
  window.API = {
    login, signup, logout,
    getUserProfile, updateUserProfile,
    submitGameResult, getLeaderboard,
    getTeacherStudents, getAtRiskStudents, sendNudge, getClassStats
  };
}