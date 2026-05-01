import { fetchWithAuth, logout, getUser, isAuthenticated } from './auth.js';

// Redirect if not authenticated
if (!isAuthenticated()) {
  window.location.href = '/login';
}

const user = getUser();
document.getElementById('userName').textContent = user?.name || user?.email || 'User';

// Map setup
const map = L.map('map').setView([20.5937, 78.9629], 5); // Default: India center

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

// State
const remoteMarkers = new Map(); // userId -> marker
let myMarker = null;
let socket = null;
let isConnected = false;

// Custom icon creator
function createIcon(isSelf = false) {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width: 24px; height: 24px; border-radius: 50%; 
      background: ${isSelf ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'linear-gradient(135deg, #667eea, #764ba2)'};
      border: 3px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
}

// Get location with promise
function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

// Update connection status UI
function updateConnectionStatus(connected) {
  const statusEl = document.getElementById('connectionStatus');
  const dot = statusEl.querySelector('.status-dot');
  
  isConnected = connected;
  
  if (connected) {
    statusEl.classList.remove('disconnected');
    statusEl.classList.add('connected');
    dot.style.background = '#22c55e';
    statusEl.querySelector('span').textContent = 'Connected';
  } else {
    statusEl.classList.remove('connected');
    statusEl.classList.add('disconnected');
    dot.style.background = '#ef4444';
    statusEl.querySelector('span').textContent = 'Disconnected';
  }
}

// Initialize Socket.IO with auth
function initSocket() {
  const token = localStorage.getItem('accessToken');

  socket = io({
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('✅ Socket connected');
    updateConnectionStatus(true);
    
    // Request current location and send immediately
    getCurrentLocation().then(loc => {
      socket.emit('client:location:update', loc);
      updateMyMarker(loc.latitude, loc.longitude);
    }).catch(console.error);
  });

  socket.on('disconnect', (reason) => {
    console.log('❌ Socket disconnected:', reason);
    updateConnectionStatus(false);
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message);
    updateConnectionStatus(false);
    
    if (error.message === 'Token expired') {
      refreshAccessToken().then(() => {
        socket.auth.token = localStorage.getItem('accessToken');
        socket.connect();
      }).catch(() => {
        logout();
      });
    }
  });

  // Receive location updates from other users
  socket.on('server:location:update', (data) => {
    console.log('📍 Location update received:', data);
    
    const { userId, latitude, longitude, email, name } = data;
    
    // Don't show own location from broadcast (we handle it locally)
    if (userId === user?.id) return;

    if (!remoteMarkers.has(userId)) {
      const marker = L.marker([latitude, longitude], { icon: createIcon(false) })
        .addTo(map)
        .bindPopup(`<b>${name || email || 'User'}</b><br>${email || ''}`);
      remoteMarkers.set(userId, marker);
    } else {
      const marker = remoteMarkers.get(userId);
      marker.setLatLng([latitude, longitude]);
      marker.setPopupContent(`<b>${name || email || 'User'}</b><br>${email || ''}`);
    }
  });

  // Initial list of online users
  socket.on('server:users:initial', (users) => {
    console.log('👥 Initial users:', users);
    users.forEach(u => {
      if (u.latitude && u.longitude) {
        const marker = L.marker([u.latitude, u.longitude], { icon: createIcon(false) })
          .addTo(map)
          .bindPopup(`<b>${u.name || u.email || 'User'}</b><br>${u.email || ''}`);
        remoteMarkers.set(u.userId, marker);
      }
    });
  });

  // User came online
  socket.on('server:user:online', (data) => {
    console.log('🟢 User online:', data);
  });

  // User went offline
  socket.on('server:user:offline', (data) => {
    console.log('🔴 User offline:', data);
    const { userId } = data;
    if (remoteMarkers.has(userId)) {
      map.removeLayer(remoteMarkers.get(userId));
      remoteMarkers.delete(userId);
    }
  });

  // Errors
  socket.on('server:error', (data) => {
    console.error('Server error:', data.message);
  });
}

// Update my marker
function updateMyMarker(latitude, longitude) {
  if (!myMarker) {
    myMarker = L.marker([latitude, longitude], { icon: createIcon(true) })
      .addTo(map)
      .bindPopup('<b>You are here</b>')
      .openPopup();
    map.setView([latitude, longitude], 15);
  } else {
    myMarker.setLatLng([latitude, longitude]);
  }
}

// Send location periodically
async function startLocationSharing() {
  // Send immediately
  try {
    const loc = await getCurrentLocation();
    if (socket?.connected) {
      socket.emit('client:location:update', loc);
    }
    updateMyMarker(loc.latitude, loc.longitude);
  } catch (err) {
    console.error('Failed to get location:', err);
  }

  // Then every 10 seconds
  setInterval(async () => {
    try {
      const loc = await getCurrentLocation();
      if (socket?.connected) {
        socket.emit('client:location:update', loc);
      }
      updateMyMarker(loc.latitude, loc.longitude);
    } catch (err) {
      console.error('Location error:', err);
    }
  }, 10000);
}

// Logout handler
document.getElementById('logoutBtn').addEventListener('click', () => {
  if (socket) socket.disconnect();
  logout();
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  
  // Small delay to let socket connect first
  setTimeout(startLocationSharing, 1000);
  
  // Hide loading
  setTimeout(() => {
    document.getElementById('loadingOverlay').classList.add('hidden');
  }, 1500);
});