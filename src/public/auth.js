// Auth utilities for token management

const API_BASE = '';

export async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    throw new Error('No refresh token');
  }

  const response = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    throw new Error('Refresh failed');
  }

  const data = await response.json();
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
  return data.accessToken;
}

export async function fetchWithAuth(url, options = {}) {
  let token = localStorage.getItem('accessToken');

  const makeRequest = (accessToken) => {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  };

  let response = await makeRequest(token);

  // If token expired, try refresh once
  if (response.status === 403) {
    try {
      token = await refreshAccessToken();
      response = await makeRequest(token);
    } catch (error) {
      logout();
      throw new Error('Session expired');
    }
  }

  return response;
}

export function logout() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  return !!localStorage.getItem('accessToken');
}