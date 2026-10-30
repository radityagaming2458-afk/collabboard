/**
 * CollabBoard - Collaborative Whiteboard Application
 * Features: Multi-user real-time drawing, background customization, encrypted links,
 * object selection & transformation, image insertion, and collaborative sticky notes.
 */

(async function () {
  'use strict';

  // --- 1. STATE & URL TOKEN RESOLUTION ---
  const urlParams = new URLSearchParams(window.location.search);
  const pathParts = window.location.pathname.split('/').filter(Boolean);

  let inviteToken = urlParams.get('token') || urlParams.get('invite');
  let roomId = null;
  let userRole = 'editor'; // default for room creator

  const roomCodeDisplay = document.getElementById('room-code-display');
  const roleBadge = document.getElementById('role-badge');
  const roleText = document.getElementById('role-text');
  const readonlyBanner = document.getElementById('readonly-banner');

  if (inviteToken) {
    try {
      const res = await fetch(`/api/invite/resolve?token=${encodeURIComponent(inviteToken)}`);
      const data = await res.json();
      if (data.valid) {
        roomId = data.room;
        userRole = data.role;
      } else {
        alert('Tautan undangan tidak valid atau telah kedaluwarsa/dimodifikasi.');
        window.location.href = '/';
        return;
      }
    } catch (e) {
      console.error('Gagal memverifikasi token:', e);
    }
  }

  if (!roomId) {
    roomId = urlParams.get('room');
    if (!roomId && pathParts.length >= 2 && pathParts[0] === 'room') {
      roomId = pathParts[1];
    }
    if (!roomId) {
      roomId = 'room-' + Math.random().toString(36).substring(2, 8);
      const newUrl = window.location.pathname + '?room=' + roomId;
      window.history.replaceState(null, '', newUrl);
    }
  }

  let currentEditorToken = null;
  let currentViewerToken = null;

  async function fetchRoomTokens() {
    try {
      const res = await fetch(`/api/invite/tokens?room=${encodeURIComponent(roomId)}`);
      const data = await res.json();
      currentEditorToken = data.editor_token;
      currentViewerToken = data.viewer_token;
    } catch (e) {
      console.error('Gagal mengambil token undangan:', e);
    }
  }

  await fetchRoomTokens();

  // User Profile
  const USER_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', 
    '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e'
  ];
  let myColor = localStorage.getItem('collab_color') || USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
  let myName = localStorage.getItem('collab_name') || 'User-' + Math.floor(100 + Math.random() * 900);
  let myUserId = null;

  // Canvas State & Elements
  const elements = [];
  const imageCache = {}; // src -> HTMLImageElement

  let backgroundState = {
    type: 'grid',
    color: '#1e293b',
    patternColor: '#334155',
    gridSize: 26,
    image: null
  };
  let bgImageObj = null;

  // Active Tool & Properties
  let currentTool = 'pen'; // pen, highlighter, line, arrow, rect, circle, text, sticky, eraser, pan, select
  let strokeColor = '#ffffff';
  let strokeWidth = 4;
  let isFilled = false;

  // Zoom & Pan
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;

  // Slide Workspace & Boundary Limits
  const SLIDE_WIDTH = 1920;
  const SLIDE_HEIGHT = 1080;
  const MIN_SCALE = 0.35;
  const MAX_SCALE = 2.5;

  let currentSlideIndex = 0;
  let totalSlidesCount = 1;

  // Slide DOM Elements
  const slideDock = document.getElementById('slide-dock');
  const btnToggleSlideDock = document.getElementById('btn-toggle-slide-dock');
  const btnPrevSlide = document.getElementById('btn-prev-slide');
  const btnNextSlide = document.getElementById('btn-next-slide');
  const btnAddSlide = document.getElementById('btn-add-slide');
  const btnDeleteSlide = document.getElementById('btn-delete-slide');
  const currentSlideNum = document.getElementById('current-slide-num');
  const totalSlidesNum = document.getElementById('total-slides-num');
  const tabCurrentSlideNum = document.getElementById('tab-current-slide-num');
  const tabTotalSlidesNum = document.getElementById('tab-total-slides-num');

  // Drawing & Interaction State
  let isDrawing = false;
  let currentStroke = null;
  const remoteLiveStrokes = {};
  const remoteCursors = {};

  // Selection & Transform State
  let selectedElement = null;
  let isDraggingElement = false;
  let dragStartWorld = { x: 0, y: 0 };
  let isResizingElement = false;
  let resizeHandleType = null; // 'br'

  // DOM Elements
  const bgCanvas = document.getElementById('bg-canvas');
  const drawCanvas = document.getElementById('draw-canvas');
  const bgCtx = bgCanvas.getContext('2d');
  const drawCtx = drawCanvas.getContext('2d');
  const canvasContainer = document.getElementById('canvas-container');
  const cursorsOverlay = document.getElementById('cursors-overlay');
  const elementsOverlay = document.getElementById('elements-overlay');

  const usersContainer = document.getElementById('users-container');
  const zoomLevelDisplay = document.getElementById('zoom-level');
  const selectionActionsBar = document.getElementById('selection-actions-bar');
  const btnDeleteSelected = document.getElementById('btn-delete-selected');
  const btnDuplicateSelected = document.getElementById('btn-duplicate-selected');
  const btnIncreaseSize = document.getElementById('btn-increase-size');
  const btnDecreaseSize = document.getElementById('btn-decrease-size');

  // Modals & Panels
  const modalBg = document.getElementById('modal-background');
  const modalShare = document.getElementById('modal-share');
  const chatDrawer = document.getElementById('chat-drawer');
  const chatMessages = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const chatBadge = document.getElementById('chat-badge');
  const toastContainer = document.getElementById('toast-container');

  // Insert Image inputs
  const btnInsertImage = document.getElementById('btn-insert-image');
  const canvasImageInput = document.getElementById('canvas-image-input');

  // Insert PDF inputs
  const btnInsertPdf = document.getElementById('btn-insert-pdf');
  const canvasPdfInput = document.getElementById('canvas-pdf-input');
  const modalPdfOptions = document.getElementById('modal-pdf-options');
  const btnCancelPdf = document.getElementById('btn-cancel-pdf');
  const btnConfirmPdf = document.getElementById('btn-confirm-pdf');
  const inputPdfPageNum = document.getElementById('input-pdf-page-num');
  const pdfTotalPagesLabel = document.getElementById('pdf-total-pages-label');
  const pdfDocInfo = document.getElementById('pdf-doc-info');

  // Sliding Properties Dock elements
  const propertiesDock = document.getElementById('properties-dock');
  const btnToggleProperties = document.getElementById('btn-toggle-properties');

  function autoCollapsePropertiesDock() {
    if (propertiesDock && !propertiesDock.classList.contains('collapsed')) {
      propertiesDock.classList.add('collapsed');
    }
  }

  function autoExpandPropertiesDock() {
    if (propertiesDock && propertiesDock.classList.contains('collapsed')) {
      propertiesDock.classList.remove('collapsed');
    }
  }

  if (btnToggleProperties && propertiesDock) {
    btnToggleProperties.addEventListener('click', (e) => {
      e.stopPropagation();
      propertiesDock.classList.toggle('collapsed');
    });
  }

  // UI Setup for Room & Role
  roomCodeDisplay.textContent = roomId;
  function updateRoleUI(role) {
    userRole = role;
    if (userRole === 'viewer') {
      roleBadge.className = 'flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30';
      roleText.textContent = 'Lihat Saja (Viewer)';
      readonlyBanner.style.display = 'flex';
      readonlyBanner.style.alignItems = 'center';

      document.querySelectorAll('.tool-btn, #btn-clear-board, #btn-clear-text, #btn-undo, #btn-redo, #btn-bg-modal, #btn-insert-image, #btn-insert-pdf').forEach(btn => {
        btn.disabled = true;
        btn.classList.add('opacity-40', 'pointer-events-none');
      });
      const btnShare = document.getElementById('btn-share');
      if (btnShare) btnShare.style.display = 'none';
      currentTool = 'pan';
      canvasContainer.className = 'w-full h-full relative overflow-hidden cursor-pan';
      clearSelection();
    } else {
      roleBadge.className = 'flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      roleText.textContent = 'Editor';
      readonlyBanner.style.display = 'none';

      document.querySelectorAll('.tool-btn, #btn-clear-board, #btn-clear-text, #btn-undo, #btn-redo, #btn-bg-modal, #btn-insert-image, #btn-insert-pdf').forEach(btn => {
        btn.disabled = false;
        btn.classList.remove('opacity-40', 'pointer-events-none');
      });
      const btnShare = document.getElementById('btn-share');
      if (btnShare) btnShare.style.display = '';
    }
    updateSlideUI();
  }

  function updateSlideUI() {
    if (currentSlideNum) currentSlideNum.textContent = currentSlideIndex + 1;
    if (totalSlidesNum) totalSlidesNum.textContent = totalSlidesCount;
    if (tabCurrentSlideNum) tabCurrentSlideNum.textContent = currentSlideIndex + 1;
    if (tabTotalSlidesNum) tabTotalSlidesNum.textContent = totalSlidesCount;
    if (btnPrevSlide) btnPrevSlide.disabled = (currentSlideIndex <= 0);
    if (btnNextSlide) btnNextSlide.disabled = (currentSlideIndex >= totalSlidesCount - 1);
    if (btnDeleteSlide) btnDeleteSlide.disabled = (totalSlidesCount <= 1 || userRole !== 'editor');
    if (btnAddSlide) {
      btnAddSlide.disabled = (userRole !== 'editor');
      if (userRole !== 'editor') {
        btnAddSlide.classList.add('opacity-40', 'pointer-events-none');
      } else {
        btnAddSlide.classList.remove('opacity-40', 'pointer-events-none');
      }
    }
    if (window.lucide) lucide.createIcons();
  }

  if (btnToggleSlideDock && slideDock) {
    btnToggleSlideDock.addEventListener('click', (e) => {
      e.stopPropagation();
      slideDock.classList.toggle('collapsed');
    });
  }

  if (btnPrevSlide) {
    btnPrevSlide.addEventListener('click', () => {
      if (currentSlideIndex > 0) {
        sendWS({ type: 'change_slide', index: currentSlideIndex - 1 });
      }
    });
  }

  if (btnNextSlide) {
    btnNextSlide.addEventListener('click', () => {
      if (currentSlideIndex < totalSlidesCount - 1) {
        sendWS({ type: 'change_slide', index: currentSlideIndex + 1 });
      }
    });
  }

  if (btnAddSlide) {
    btnAddSlide.addEventListener('click', () => {
      if (userRole === 'editor') {
        sendWS({ type: 'add_slide' });
      }
    });
  }

  if (btnDeleteSlide) {
    btnDeleteSlide.addEventListener('click', () => {
      if (userRole === 'editor' && totalSlidesCount > 1) {
        if (confirm(`Apakah Anda yakin ingin menghapus Slide ${currentSlideIndex + 1}? Semua coretan pada slide ini akan dihapus.`)) {
          sendWS({ type: 'delete_slide', index: currentSlideIndex });
        }
      }
    });
  }

  updateRoleUI(userRole);

  // --- 2. WEBSOCKET CONNECTION ---
  let socket = null;
  let socketReconnectTimer = null;
  let isKicked = false;

  function connectWebSocket() {
    if (isKicked) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const tokenQuery = inviteToken ? `&token=${encodeURIComponent(inviteToken)}` : '';
    const wsUrl = `${protocol}//${window.location.host}/ws/${roomId}?name=${encodeURIComponent(myName)}&color=${encodeURIComponent(myColor)}${tokenQuery}`;

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('Connected to whiteboard room:', roomId);
      showToast('Terhubung ke ruang kolaborasi', 'success');
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (e) {
        console.error('Error parsing message:', e);
      }
    };

    socket.onclose = () => {
      clearTimeout(socketReconnectTimer);
      if (!isKicked) {
        socketReconnectTimer = setTimeout(connectWebSocket, 3000);
      }
    };

    socket.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }

  function sendWS(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  }

  let lastCursorSent = 0;
  function broadcastCursor(x, y) {
    const now = Date.now();
    if (now - lastCursorSent > 45) {
      lastCursorSent = now;
      sendWS({ type: 'cursor', x, y });
    }
  }

  function handleServerMessage(msg) {
    switch (msg.type) {
      case 'init':
        myUserId = msg.user.user_id;
        updateRoleUI(msg.user.role);
        backgroundState = msg.background;
        loadBackgroundImage(backgroundState.image, () => {
          renderBackground();
          redrawCanvas();
        });
        elements.length = 0;
        if (Array.isArray(msg.elements)) {
          for (const el of msg.elements) {
            preloadElementAssets(el);
            elements.push(el);
          }
        }
        if (typeof msg.currentSlideIndex === 'number') currentSlideIndex = msg.currentSlideIndex;
        if (typeof msg.slidesCount === 'number') totalSlidesCount = msg.slidesCount;
        updateSlideUI();
        centerSlideInView(true);
        updateUserList(msg.users);
        syncStickyNotesDOM();
        redrawCanvas();
        break;

      case 'slide_changed':
        currentSlideIndex = msg.slideIndex;
        totalSlidesCount = msg.slidesCount;
        elements.length = 0;
        for (const k in remoteLiveStrokes) delete remoteLiveStrokes[k];
        if (Array.isArray(msg.elements)) {
          for (const el of msg.elements) {
            preloadElementAssets(el);
            elements.push(el);
          }
        }
        clearSelection();
        syncStickyNotesDOM();
        updateSlideUI();
        renderBackground();
        redrawCanvas();
        showToast(`Beralih ke Slide ${currentSlideIndex + 1}${msg.changedBy ? ' oleh ' + msg.changedBy : ''}`, 'info');
        break;

      case 'slide_added':
        currentSlideIndex = msg.slideIndex;
        totalSlidesCount = msg.slidesCount;
        elements.length = 0;
        for (const k in remoteLiveStrokes) delete remoteLiveStrokes[k];
        clearSelection();
        syncStickyNotesDOM();
        updateSlideUI();
        renderBackground();
        redrawCanvas();
        showToast(`Slide baru ditambahkan (${currentSlideIndex + 1}/${totalSlidesCount})`, 'success');
        break;

      case 'slide_deleted':
        currentSlideIndex = msg.slideIndex;
        totalSlidesCount = msg.slidesCount;
        elements.length = 0;
        for (const k in remoteLiveStrokes) delete remoteLiveStrokes[k];
        if (Array.isArray(msg.elements)) {
          for (const el of msg.elements) {
            preloadElementAssets(el);
            elements.push(el);
          }
        }
        clearSelection();
        syncStickyNotesDOM();
        updateSlideUI();
        renderBackground();
        redrawCanvas();
        showToast(`Slide dihapus. Menampilkan Slide ${currentSlideIndex + 1}/${totalSlidesCount}`, 'info');
        break;

      case 'user_joined':
        updateUserList(msg.users);
        showToast(`${msg.user.name} bergabung ke papan tulis`, 'info');
        break;

      case 'user_left':
        if (remoteCursors[msg.userId]) {
          remoteCursors[msg.userId].remove();
          delete remoteCursors[msg.userId];
        }
        delete remoteLiveStrokes[msg.userId];
        updateUserList(msg.users);
        redrawCanvas();
        if (msg.kicked) {
          showToast(`${msg.name || 'Peserta'} telah dikeluarkan dari ruangan oleh ${msg.by || 'Host'}.`, 'warning');
        }
        break;

      case 'users_updated':
        updateUserList(msg.users);
        break;

      case 'role_changed_by_admin':
        updateRoleUI(msg.newRole);
        if (msg.newRole === 'editor') {
          showToast(`Izin Anda diubah menjadi Editor oleh ${msg.changedBy || 'Host'}! Anda sekarang dapat menggambar.`, 'success');
        } else {
          showToast(`Izin Anda diubah menjadi Lihat Saja oleh ${msg.changedBy || 'Host'}.`, 'warning');
        }
        break;

      case 'cursor':
        updateRemoteCursor(msg);
        break;

      case 'draw_live':
        if (!remoteLiveStrokes[msg.userId]) {
          remoteLiveStrokes[msg.userId] = {
            tool: msg.tool,
            color: msg.color,
            size: msg.size,
            points: []
          };
        }
        remoteLiveStrokes[msg.userId].points = msg.points;
        redrawCanvas();
        break;

      case 'element_add':
        delete remoteLiveStrokes[msg.element.createdBy];
        preloadElementAssets(msg.element);
        elements.push(msg.element);
        if (msg.element.tool === 'sticky') {
          syncStickyNotesDOM();
        }
        redrawCanvas();
        break;

      case 'element_update':
        const updatedIdx = elements.findIndex(e => e.id === msg.element.id);
        if (updatedIdx !== -1) {
          preloadElementAssets(msg.element);
          elements[updatedIdx] = msg.element;
          if (selectedElement && selectedElement.id === msg.element.id) {
            selectedElement = msg.element;
          }
        } else {
          preloadElementAssets(msg.element);
          elements.push(msg.element);
        }
        if (msg.element.tool === 'sticky') {
          syncStickyNotesDOM();
        }
        redrawCanvas();
        break;

      case 'element_delete':
        const delIdx = elements.findIndex(e => e.id === msg.id);
        if (delIdx !== -1) {
          elements.splice(delIdx, 1);
        }
        const stickyDom = document.getElementById(`sticky-${msg.id}`);
        if (stickyDom) stickyDom.remove();

        if (selectedElement && selectedElement.id === msg.id) {
          clearSelection();
        }
        redrawCanvas();
        break;

      case 'sync_elements':
        elements.length = 0;
        if (Array.isArray(msg.elements)) {
          for (const el of msg.elements) {
            preloadElementAssets(el);
            elements.push(el);
          }
        }
        syncStickyNotesDOM();
        redrawCanvas();
        break;

      case 'clear':
        elements.length = 0;
        for (const k in remoteLiveStrokes) delete remoteLiveStrokes[k];
        clearSelection();
        elementsOverlay.innerHTML = '';
        redrawCanvas();
        showToast('Papan tulis telah dibersihkan', 'warning');
        break;

      case 'background_changed':
        backgroundState = msg.background;
        loadBackgroundImage(backgroundState.image, () => {
          renderBackground();
          redrawCanvas();
        });
        showToast('Background papan diubah oleh kolaborator', 'info');
        break;

      case 'chat':
        appendChatMessage(msg);
        break;

      case 'error':
        showToast(msg.message || 'Terjadi kesalahan', 'warning');
        break;

      case 'kicked':
        isKicked = true;
        clearTimeout(socketReconnectTimer);
        const modalKicked = document.getElementById('modal-kicked');
        const kickedMsg = document.getElementById('kicked-message');
        if (kickedMsg && msg.message) kickedMsg.textContent = msg.message;
        if (modalKicked) modalKicked.classList.remove('hidden');
        showToast(msg.message || 'Anda telah dikeluarkan dari ruangan.', 'warning');
        break;
    }
  }

  function preloadElementAssets(elem) {
    if (elem.tool === 'image' && elem.src) {
      if (!imageCache[elem.src]) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => redrawCanvas();
        img.src = elem.src;
        imageCache[elem.src] = img;
      }
      elem.imgObj = imageCache[elem.src];
    }
  }

  // --- 3. CANVAS RESIZE & COORDINATES ---
  function clampPanAndZoom() {
    scale = Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);

    const vw = canvasContainer.clientWidth || window.innerWidth;
    const vh = canvasContainer.clientHeight || window.innerHeight;

    const minVisibleX = Math.min(vw * 0.35, 350);
    const minVisibleY = Math.min(vh * 0.35, 250);

    const slideW = SLIDE_WIDTH * scale;
    const slideH = SLIDE_HEIGHT * scale;

    const minPanX = minVisibleX - slideW;
    const maxPanX = vw - minVisibleX;

    const minPanY = minVisibleY - slideH;
    const maxPanY = vh - minVisibleY;

    if (slideW <= vw) {
      panX = Math.min(Math.max(panX, (vw - slideW) / 2 - 200), (vw - slideW) / 2 + 200);
    } else {
      panX = Math.min(Math.max(panX, minPanX), maxPanX);
    }

    if (slideH <= vh) {
      panY = Math.min(Math.max(panY, (vh - slideH) / 2 - 150), (vh - slideH) / 2 + 150);
    } else {
      panY = Math.min(Math.max(panY, minPanY), maxPanY);
    }
  }

  function centerSlideInView(forceZoom = false) {
    const vw = canvasContainer.clientWidth || window.innerWidth;
    const vh = canvasContainer.clientHeight || window.innerHeight;

    if (forceZoom || scale === 1) {
      const padding = 60;
      const fitScale = Math.min((vw - padding * 2) / SLIDE_WIDTH, (vh - padding * 2) / SLIDE_HEIGHT);
      scale = Math.min(Math.max(fitScale, MIN_SCALE), 1.0);
    }

    const slideW = SLIDE_WIDTH * scale;
    const slideH = SLIDE_HEIGHT * scale;
    panX = (vw - slideW) / 2;
    panY = (vh - slideH) / 2;

    if (zoomLevelDisplay) {
      zoomLevelDisplay.textContent = Math.round(scale * 100) + '%';
    }
  }

  function resizeCanvases() {
    const rect = canvasContainer.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    bgCanvas.width = rect.width * dpr;
    bgCanvas.height = rect.height * dpr;
    bgCanvas.style.width = rect.width + 'px';
    bgCanvas.style.height = rect.height + 'px';
    bgCtx.scale(dpr, dpr);

    drawCanvas.width = rect.width * dpr;
    drawCanvas.height = rect.height * dpr;
    drawCanvas.style.width = rect.width + 'px';
    drawCanvas.style.height = rect.height + 'px';
    drawCtx.scale(dpr, dpr);

    clampPanAndZoom();
    renderBackground();
    syncStickyNotesDOM();
    redrawCanvas();
  }

  window.addEventListener('resize', resizeCanvases);

  function screenToWorld(clientX, clientY) {
    const rect = drawCanvas.getBoundingClientRect();
    const x = (clientX - rect.left - panX) / scale;
    const y = (clientY - rect.top - panY) / scale;
    return { x, y };
  }

  function worldToScreen(worldX, worldY) {
    return {
      x: worldX * scale + panX,
      y: worldY * scale + panY
    };
  }

  // --- 4. BACKGROUND RENDERING ---
  function loadBackgroundImage(url, callback) {
    if (!url) {
      bgImageObj = null;
      if (callback) callback();
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      bgImageObj = img;
      if (callback) callback();
    };
    img.onerror = () => {
      bgImageObj = null;
      if (callback) callback();
    };
    img.src = url;
  }

  function renderBackground() {
    const width = bgCanvas.clientWidth;
    const height = bgCanvas.clientHeight;

    // Fill the outer surrounding workspace desk with modern dark theme
    bgCtx.fillStyle = '#0b0f19';
    bgCtx.fillRect(0, 0, width, height);

    bgCtx.save();
    bgCtx.translate(panX, panY);
    bgCtx.scale(scale, scale);

    // Slide elevation drop shadow
    bgCtx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    bgCtx.shadowBlur = Math.round(35 / scale);
    bgCtx.shadowOffsetY = Math.round(10 / scale);
    bgCtx.fillStyle = backgroundState.color || '#1e293b';
    bgCtx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);

    // Reset shadow for inner drawing
    bgCtx.shadowColor = 'transparent';

    // Slide boundary border
    bgCtx.strokeStyle = 'rgba(99, 102, 241, 0.5)';
    bgCtx.lineWidth = 2 / scale;
    bgCtx.strokeRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);

    // Slide watermark / indicator on top-left of slide
    bgCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    bgCtx.font = `600 ${Math.round(14 / scale)}px ui-sans-serif, system-ui, sans-serif`;
    bgCtx.fillText(`SLIDE ${currentSlideIndex + 1} / ${totalSlidesCount}`, 20, 32);

    // Clip background patterns & image strictly within slide bounds
    bgCtx.beginPath();
    bgCtx.rect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
    bgCtx.clip();

    if (bgImageObj) {
      bgCtx.drawImage(bgImageObj, 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
      bgCtx.restore();
      return;
    }

    const patColor = backgroundState.patternColor || '#334155';
    const gridSize = backgroundState.gridSize || 26;
    const type = backgroundState.type;

    if (type === 'grid') {
      bgCtx.strokeStyle = patColor;
      bgCtx.lineWidth = 1;
      bgCtx.beginPath();
      for (let x = 0; x <= SLIDE_WIDTH; x += gridSize) {
        bgCtx.moveTo(x, 0);
        bgCtx.lineTo(x, SLIDE_HEIGHT);
      }
      for (let y = 0; y <= SLIDE_HEIGHT; y += gridSize) {
        bgCtx.moveTo(0, y);
        bgCtx.lineTo(SLIDE_WIDTH, y);
      }
      bgCtx.stroke();
    } else if (type === 'dots') {
      bgCtx.fillStyle = patColor;
      const dotRadius = 1.3;
      for (let x = gridSize / 2; x <= SLIDE_WIDTH; x += gridSize) {
        for (let y = gridSize / 2; y <= SLIDE_HEIGHT; y += gridSize) {
          bgCtx.beginPath();
          bgCtx.arc(x, y, dotRadius, 0, Math.PI * 2);
          bgCtx.fill();
        }
      }
    } else if (type === 'lined') {
      bgCtx.strokeStyle = patColor;
      bgCtx.lineWidth = 1;
      bgCtx.beginPath();
      for (let y = 0; y <= SLIDE_HEIGHT; y += gridSize) {
        bgCtx.moveTo(0, y);
        bgCtx.lineTo(SLIDE_WIDTH, y);
      }
      bgCtx.stroke();
    }

    bgCtx.restore();
  }

  // --- 5. BOUNDS & HIT TESTING FOR SELECTION ---
  function getElementBounds(elem) {
    if (!elem) return null;

    if (elem.tool === 'rect' || elem.tool === 'circle') {
      const minX = Math.min(elem.x1, elem.x2);
      const minY = Math.min(elem.y1, elem.y2);
      const maxX = Math.max(elem.x1, elem.x2);
      const maxY = Math.max(elem.y1, elem.y2);
      return { minX, minY, maxX, maxY };
    }

    if (elem.tool === 'line' || elem.tool === 'arrow') {
      const pad = (elem.size || 4) + 6;
      return {
        minX: Math.min(elem.x1, elem.x2) - pad,
        minY: Math.min(elem.y1, elem.y2) - pad,
        maxX: Math.max(elem.x1, elem.x2) + pad,
        maxY: Math.max(elem.y1, elem.y2) + pad
      };
    }

    if (elem.tool === 'pen' || elem.tool === 'highlighter' || elem.tool === 'eraser') {
      if (!elem.points || elem.points.length === 0) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of elem.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const pad = (elem.size || 4) + 6;
      return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
    }

    if (elem.tool === 'image') {
      return {
        minX: elem.x,
        minY: elem.y,
        maxX: elem.x + elem.width,
        maxY: elem.y + elem.height
      };
    }

    if (elem.tool === 'sticky') {
      const w = elem.width || 190;
      const h = elem.height || 140;
      return { minX: elem.x, minY: elem.y, maxX: elem.x + w, maxY: elem.y + h };
    }

    if (elem.tool === 'text') {
      const fontSize = (elem.size || 4) * 4;
      const estWidth = Math.max(40, (elem.text || '').length * (fontSize * 0.6));
      return {
        minX: elem.x,
        minY: elem.y - fontSize,
        maxX: elem.x + estWidth,
        maxY: elem.y + 8
      };
    }

    return null;
  }

  function distToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  }

  function getElementAt(worldX, worldY) {
    // Search top-to-bottom
    for (let i = elements.length - 1; i >= 0; i--) {
      const elem = elements[i];
      const b = getElementBounds(elem);
      if (!b) continue;

      // Quick bounding box check
      if (worldX < b.minX || worldX > b.maxX || worldY < b.minY || worldY > b.maxY) {
        continue;
      }

      if (['rect', 'image', 'sticky', 'text'].includes(elem.tool)) {
        return elem;
      }

      if (elem.tool === 'circle') {
        const cx = (elem.x1 + elem.x2) / 2;
        const cy = (elem.y1 + elem.y2) / 2;
        const rx = Math.abs(elem.x2 - elem.x1) / 2;
        const ry = Math.abs(elem.y2 - elem.y1) / 2;
        if (rx > 0 && ry > 0) {
          const norm = ((worldX - cx) / rx) ** 2 + ((worldY - cy) / ry) ** 2;
          if (norm <= 1.15) return elem;
        }
      }

      if (elem.tool === 'line' || elem.tool === 'arrow') {
        if (distToSegment(worldX, worldY, elem.x1, elem.y1, elem.x2, elem.y2) <= (elem.size || 4) + 8) {
          return elem;
        }
      }

      if (elem.tool === 'pen' || elem.tool === 'highlighter' || elem.tool === 'eraser') {
        if (elem.points && elem.points.length > 1) {
          for (let j = 1; j < elem.points.length; j++) {
            const p1 = elem.points[j - 1];
            const p2 = elem.points[j];
            if (distToSegment(worldX, worldY, p1.x, p1.y, p2.x, p2.y) <= (elem.size || 4) + 8) {
              return elem;
            }
          }
        }
      }
    }
    return null;
  }

  function isOverResizeHandle(worldX, worldY, elem) {
    if (!elem) return false;
    const b = getElementBounds(elem);
    if (!b) return false;
    const handleSize = 12 / scale;
    return (
      Math.abs(worldX - b.maxX) <= handleSize &&
      Math.abs(worldY - b.maxY) <= handleSize
    );
  }

  function selectElement(elem) {
    selectedElement = elem;
    if (selectedElement) {
      selectionActionsBar.style.display = 'flex';
    } else {
      selectionActionsBar.style.display = 'none';
    }
    syncStickyNotesDOM();
    redrawCanvas();
  }

  function clearSelection() {
    selectedElement = null;
    selectionActionsBar.style.display = 'none';
    syncStickyNotesDOM();
    redrawCanvas();
  }

  // --- 6. DRAWING & RENDERING ENGINE ---
  function redrawCanvas() {
    const width = drawCanvas.clientWidth;
    const height = drawCanvas.clientHeight;

    drawCtx.clearRect(0, 0, width, height);
    drawCtx.save();
    drawCtx.translate(panX, panY);
    drawCtx.scale(scale, scale);

    // Draw non-sticky elements (stickies rendered via synchronized DOM overlay)
    for (const elem of elements) {
      if (elem.tool !== 'sticky') {
        drawElement(drawCtx, elem);
      }
    }

    if (isDrawing && currentStroke) {
      drawElement(drawCtx, currentStroke);
    }

    for (const userId in remoteLiveStrokes) {
      const stroke = remoteLiveStrokes[userId];
      if (stroke && stroke.points && stroke.points.length > 0) {
        drawElement(drawCtx, stroke);
      }
    }

    // Render Selection Outline & Handles
    if (selectedElement) {
      const b = getElementBounds(selectedElement);
      if (b) {
        drawCtx.save();
        drawCtx.strokeStyle = '#6366f1';
        drawCtx.lineWidth = 1.8 / scale;
        drawCtx.setLineDash([5 / scale, 5 / scale]);
        const pad = 6;
        drawCtx.strokeRect(b.minX - pad, b.minY - pad, (b.maxX - b.minX) + pad * 2, (b.maxY - b.minY) + pad * 2);

        // Bottom-right resize handle
        drawCtx.setLineDash([]);
        drawCtx.fillStyle = '#ffffff';
        drawCtx.strokeStyle = '#4f46e5';
        drawCtx.lineWidth = 2 / scale;
        const handleR = 5 / scale;
        drawCtx.beginPath();
        drawCtx.arc(b.maxX + pad, b.maxY + pad, handleR, 0, Math.PI * 2);
        drawCtx.fill();
        drawCtx.stroke();
        drawCtx.restore();
      }
    }

    drawCtx.restore();
  }

  function drawElement(ctx, elem) {
    ctx.save();
    ctx.strokeStyle = elem.color;
    ctx.fillStyle = elem.color;
    ctx.lineWidth = elem.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (elem.tool === 'highlighter') {
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = elem.size * 2.5;
    }

    switch (elem.tool) {
      case 'pen':
      case 'highlighter':
      case 'eraser':
        if (elem.tool === 'eraser') {
          ctx.strokeStyle = backgroundState.color;
          ctx.lineWidth = elem.size * 3;
        }
        if (elem.points && elem.points.length > 0) {
          ctx.beginPath();
          if (elem.points.length === 1) {
            ctx.arc(elem.points[0].x, elem.points[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.moveTo(elem.points[0].x, elem.points[0].y);
            for (let i = 1; i < elem.points.length; i++) {
              const midX = (elem.points[i - 1].x + elem.points[i].x) / 2;
              const midY = (elem.points[i - 1].y + elem.points[i].y) / 2;
              ctx.quadraticCurveTo(elem.points[i - 1].x, elem.points[i - 1].y, midX, midY);
            }
            ctx.lineTo(elem.points[elem.points.length - 1].x, elem.points[elem.points.length - 1].y);
            ctx.stroke();
          }
        }
        break;

      case 'line':
        ctx.beginPath();
        ctx.moveTo(elem.x1, elem.y1);
        ctx.lineTo(elem.x2, elem.y2);
        ctx.stroke();
        break;

      case 'arrow':
        drawArrow(ctx, elem.x1, elem.y1, elem.x2, elem.y2, elem.size);
        break;

      case 'rect':
        const rx = Math.min(elem.x1, elem.x2);
        const ry = Math.min(elem.y1, elem.y2);
        const rw = Math.abs(elem.x2 - elem.x1);
        const rh = Math.abs(elem.y2 - elem.y1);
        if (elem.filled) {
          ctx.globalAlpha = 0.25;
          ctx.fillRect(rx, ry, rw, rh);
          ctx.globalAlpha = 1;
        }
        ctx.strokeRect(rx, ry, rw, rh);
        break;

      case 'circle':
        const cx = (elem.x1 + elem.x2) / 2;
        const cy = (elem.y1 + elem.y2) / 2;
        const radiusX = Math.abs(elem.x2 - elem.x1) / 2;
        const radiusY = Math.abs(elem.y2 - elem.y1) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(1, radiusX), Math.max(1, radiusY), 0, 0, Math.PI * 2);
        if (elem.filled) {
          ctx.globalAlpha = 0.25;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.stroke();
        break;

      case 'text':
        ctx.font = `${(elem.size || 4) * 4}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillStyle = elem.color;
        ctx.fillText(elem.text, elem.x, elem.y);
        break;

      case 'image':
        if (elem.imgObj && elem.imgObj.complete && elem.imgObj.naturalWidth > 0) {
          ctx.drawImage(elem.imgObj, elem.x, elem.y, elem.width, elem.height);
        } else if (elem.src) {
          if (!imageCache[elem.src]) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => redrawCanvas();
            img.src = elem.src;
            imageCache[elem.src] = img;
          }
          if (imageCache[elem.src].complete) {
            ctx.drawImage(imageCache[elem.src], elem.x, elem.y, elem.width, elem.height);
          }
        }
        break;
    }
    ctx.restore();
  }

  function drawArrow(ctx, fromX, fromY, toX, toY, width) {
    const headLen = Math.max(12, (width || 4) * 3.5);
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  }

  // --- 7. POINTER & TOOL INTERACTIONS ---
  function onPointerDown(e) {
    if (e.button !== 0 && e.button !== 1) return;

    if (currentTool === 'pan' || e.button === 1 || e.spaceKey) {
      isPanning = true;
      panStartX = e.clientX - panX;
      panStartY = e.clientY - panY;
      canvasContainer.classList.add('cursor-pan');
      return;
    }

    if (userRole === 'viewer') return;

    // Slide down properties bar when interacting with canvas
    autoCollapsePropertiesDock();

    const { x, y } = screenToWorld(e.clientX, e.clientY);

    // SELECTION TOOL LOGIC
    if (currentTool === 'select') {
      // Check resize handle first
      if (selectedElement && isOverResizeHandle(x, y, selectedElement)) {
        isResizingElement = true;
        resizeHandleType = 'br';
        dragStartWorld = { x, y };
        return;
      }

      // Check hit-testing on elements
      const hit = getElementAt(x, y);
      if (hit) {
        selectElement(hit);
        isDraggingElement = true;
        dragStartWorld = { x, y };
      } else {
        clearSelection();
      }
      return;
    }

    if (currentTool === 'text') {
      const text = prompt('Ketik teks untuk papan tulis:');
      if (text && text.trim()) {
        const textElement = {
          id: 'text-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
          tool: 'text',
          text: text.trim(),
          x,
          y,
          color: strokeColor,
          size: strokeWidth
        };
        elements.push(textElement);
        sendWS({ type: 'element_add', element: textElement });
        selectElement(textElement);
        redrawCanvas();
      }
      return;
    }

    if (currentTool === 'sticky') {
      createStickyNote(x, y);
      return;
    }

    isDrawing = true;

    if (currentTool === 'pen' || currentTool === 'highlighter' || currentTool === 'eraser') {
      currentStroke = {
        id: 'stroke-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        tool: currentTool,
        color: currentTool === 'eraser' ? backgroundState.color : strokeColor,
        size: strokeWidth,
        points: [{ x, y }]
      };
      sendWS({
        type: 'draw_live',
        strokeId: currentStroke.id,
        points: currentStroke.points,
        color: currentStroke.color,
        size: currentStroke.size,
        tool: currentStroke.tool
      });
    } else if (['line', 'arrow', 'rect', 'circle'].includes(currentTool)) {
      currentStroke = {
        id: 'shape-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        tool: currentTool,
        x1: x,
        y1: y,
        x2: x,
        y2: y,
        color: strokeColor,
        size: strokeWidth,
        filled: isFilled
      };
    }

    redrawCanvas();
  }

  let liveDrawThrottle = 0;
  function onPointerMove(e) {
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    broadcastCursor(x, y);

    if (isPanning) {
      panX = e.clientX - panStartX;
      panY = e.clientY - panStartY;
      clampPanAndZoom();
      renderBackground();
      syncStickyNotesDOM();
      redrawCanvas();
      return;
    }

    // Moving or Resizing Selected Element
    if (isDraggingElement && selectedElement && userRole === 'editor') {
      const dx = x - dragStartWorld.x;
      const dy = y - dragStartWorld.y;

      if (selectedElement.tool === 'pen' || selectedElement.tool === 'highlighter' || selectedElement.tool === 'eraser') {
        for (const pt of selectedElement.points) {
          pt.x += dx;
          pt.y += dy;
        }
      } else if (['rect', 'circle', 'line', 'arrow'].includes(selectedElement.tool)) {
        selectedElement.x1 += dx;
        selectedElement.y1 += dy;
        selectedElement.x2 += dx;
        selectedElement.y2 += dy;
      } else if (['text', 'image', 'sticky'].includes(selectedElement.tool)) {
        selectedElement.x += dx;
        selectedElement.y += dy;
        if (selectedElement.tool === 'sticky') {
          syncStickyNotesDOM();
        }
      }

      dragStartWorld = { x, y };
      redrawCanvas();
      return;
    }

    if (isResizingElement && selectedElement && userRole === 'editor') {
      const dx = x - dragStartWorld.x;
      const dy = y - dragStartWorld.y;

      if (selectedElement.tool === 'image' || selectedElement.tool === 'sticky') {
        selectedElement.width = Math.max(80, (selectedElement.width || 190) + dx);
        selectedElement.height = Math.max(60, (selectedElement.height || 140) + dy);
        if (selectedElement.tool === 'sticky') syncStickyNotesDOM();
      } else if (selectedElement.tool === 'text') {
        const delta = (dx + dy) / 2;
        const cur = selectedElement.size || 4;
        selectedElement.size = Math.max(1.5, Math.min(36, cur + delta * 0.08));
      } else if (['rect', 'circle', 'line', 'arrow'].includes(selectedElement.tool)) {
        selectedElement.x2 += dx;
        selectedElement.y2 += dy;
      }

      dragStartWorld = { x, y };
      redrawCanvas();
      return;
    }

    if (!isDrawing || !currentStroke || userRole === 'viewer') return;

    if (['pen', 'highlighter', 'eraser'].includes(currentStroke.tool)) {
      currentStroke.points.push({ x, y });

      const now = Date.now();
      if (now - liveDrawThrottle > 30) {
        liveDrawThrottle = now;
        sendWS({
          type: 'draw_live',
          strokeId: currentStroke.id,
          points: currentStroke.points,
          color: currentStroke.color,
          size: currentStroke.size,
          tool: currentStroke.tool
        });
      }
    } else if (['line', 'arrow', 'rect', 'circle'].includes(currentStroke.tool)) {
      currentStroke.x2 = x;
      currentStroke.y2 = y;
    }

    redrawCanvas();
  }

  function onPointerUp(e) {
    if (isPanning) {
      isPanning = false;
      return;
    }

    if (isDraggingElement || isResizingElement) {
      if (selectedElement) {
        sendWS({ type: 'element_update', element: selectedElement });
      }
      isDraggingElement = false;
      isResizingElement = false;
      return;
    }

    if (!isDrawing || !currentStroke || userRole === 'viewer') {
      isDrawing = false;
      currentStroke = null;
      return;
    }

    isDrawing = false;
    const finalized = { ...currentStroke };
    elements.push(finalized);
    sendWS({ type: 'element_add', element: finalized });

    currentStroke = null;
    redrawCanvas();
  }

  drawCanvas.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);

  // Touch Support with 1-finger drawing & 2-finger pan/pinch-zoom
  let initialTouchDist = null;
  let initialScale = 1;
  let touchPanStartX = 0;
  let touchPanStartY = 0;

  drawCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      onPointerDown({
        clientX: touch.clientX,
        clientY: touch.clientY,
        button: 0,
        preventDefault: () => e.preventDefault()
      });
    } else if (e.touches.length === 2) {
      e.preventDefault();
      isDrawing = false;
      currentStroke = null;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      initialTouchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      initialScale = scale;
      touchPanStartX = (t1.clientX + t2.clientX) / 2 - panX;
      touchPanStartY = (t1.clientY + t2.clientY) / 2 - panY;
    }
  }, { passive: false });

  window.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      onPointerMove({
        clientX: touch.clientX,
        clientY: touch.clientY
      });
    } else if (e.touches.length === 2 && initialTouchDist) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;

      const newScale = Math.min(Math.max(initialScale * (currentDist / initialTouchDist), MIN_SCALE), MAX_SCALE);
      panX = midX - touchPanStartX;
      panY = midY - touchPanStartY;
      scale = newScale;
      clampPanAndZoom();

      zoomLevelDisplay.textContent = Math.round(scale * 100) + '%';
      renderBackground();
      syncStickyNotesDOM();
      redrawCanvas();
    }
  }, { passive: false });

  window.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      initialTouchDist = null;
    }
    if (e.touches.length === 0) {
      onPointerUp(e);
    }
  });

  // Wheel Zoom
  canvasContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = 1.08;
    const rect = canvasContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const oldScale = scale;
    if (e.deltaY < 0) {
      scale = Math.min(scale * zoomFactor, MAX_SCALE);
    } else {
      scale = Math.max(scale / zoomFactor, MIN_SCALE);
    }

    panX = mouseX - (mouseX - panX) * (scale / oldScale);
    panY = mouseY - (mouseY - panY) * (scale / oldScale);
    clampPanAndZoom();

    zoomLevelDisplay.textContent = Math.round(scale * 100) + '%';
    renderBackground();
    syncStickyNotesDOM();
    redrawCanvas();
  }, { passive: false });

  // --- 8. DELETE & DUPLICATE OBJECTS ---
  function deleteElement(elem) {
    if (!elem || userRole !== 'editor') return;
    const idx = elements.findIndex(e => e.id === elem.id);
    if (idx !== -1) {
      elements.splice(idx, 1);
    }
    const stickyDom = document.getElementById(`sticky-${elem.id}`);
    if (stickyDom) stickyDom.remove();

    sendWS({ type: 'element_delete', id: elem.id });

    if (selectedElement && selectedElement.id === elem.id) {
      clearSelection();
    }
    redrawCanvas();
    showToast('Objek berhasil dihapus', 'info');
  }

  btnDeleteSelected.addEventListener('click', () => {
    if (selectedElement) {
      deleteElement(selectedElement);
    }
  });

  if (btnIncreaseSize) {
    btnIncreaseSize.addEventListener('click', () => {
      if (!selectedElement || userRole !== 'editor') return;
      if (selectedElement.tool === 'text') {
        const cur = selectedElement.size || 4;
        selectedElement.size = Math.min(36, cur + 2);
        sendWS({ type: 'element_update', element: selectedElement });
        redrawCanvas();
        showToast(`Ukuran teks diperbesar (${Math.round(selectedElement.size * 4)}px)`, 'info');
      } else if (selectedElement.tool === 'sticky') {
        selectedElement.width = Math.min(600, (selectedElement.width || 190) + 30);
        selectedElement.height = Math.min(450, (selectedElement.height || 140) + 20);
        selectedElement.fontSize = Math.min(26, (selectedElement.fontSize || 13) + 2);
        sendWS({ type: 'element_update', element: selectedElement });
        syncStickyNotesDOM();
        redrawCanvas();
        showToast('Ukuran catatan diperbesar', 'info');
      } else if (selectedElement.tool === 'image') {
        selectedElement.width = Math.round((selectedElement.width || 200) * 1.15);
        selectedElement.height = Math.round((selectedElement.height || 150) * 1.15);
        sendWS({ type: 'element_update', element: selectedElement });
        redrawCanvas();
      } else if (['rect', 'circle', 'line', 'arrow'].includes(selectedElement.tool)) {
        selectedElement.size = Math.min(24, (selectedElement.size || 4) + 2);
        sendWS({ type: 'element_update', element: selectedElement });
        redrawCanvas();
      }
    });
  }

  if (btnDecreaseSize) {
    btnDecreaseSize.addEventListener('click', () => {
      if (!selectedElement || userRole !== 'editor') return;
      if (selectedElement.tool === 'text') {
        const cur = selectedElement.size || 4;
        selectedElement.size = Math.max(1.5, cur - 2);
        sendWS({ type: 'element_update', element: selectedElement });
        redrawCanvas();
        showToast(`Ukuran teks diperkecil (${Math.round(selectedElement.size * 4)}px)`, 'info');
      } else if (selectedElement.tool === 'sticky') {
        selectedElement.width = Math.max(90, (selectedElement.width || 190) - 30);
        selectedElement.height = Math.max(70, (selectedElement.height || 140) - 20);
        selectedElement.fontSize = Math.max(10, (selectedElement.fontSize || 13) - 2);
        sendWS({ type: 'element_update', element: selectedElement });
        syncStickyNotesDOM();
        redrawCanvas();
        showToast('Ukuran catatan diperkecil', 'info');
      } else if (selectedElement.tool === 'image') {
        selectedElement.width = Math.round(Math.max(50, (selectedElement.width || 200) * 0.85));
        selectedElement.height = Math.round(Math.max(40, (selectedElement.height || 150) * 0.85));
        sendWS({ type: 'element_update', element: selectedElement });
        redrawCanvas();
      } else if (['rect', 'circle', 'line', 'arrow'].includes(selectedElement.tool)) {
        selectedElement.size = Math.max(1, (selectedElement.size || 4) - 2);
        sendWS({ type: 'element_update', element: selectedElement });
        redrawCanvas();
      }
    });
  }

  btnDuplicateSelected.addEventListener('click', () => {
    if (!selectedElement || userRole !== 'editor') return;
    const clone = JSON.parse(JSON.stringify(selectedElement));
    clone.id = 'dup-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);

    const offset = 25;
    if (['rect', 'circle', 'line', 'arrow'].includes(clone.tool)) {
      clone.x1 += offset;
      clone.y1 += offset;
      clone.x2 += offset;
      clone.y2 += offset;
    } else if (['text', 'image', 'sticky'].includes(clone.tool)) {
      clone.x += offset;
      clone.y += offset;
    } else if (clone.points) {
      for (const pt of clone.points) {
        pt.x += offset;
        pt.y += offset;
      }
    }

    preloadElementAssets(clone);
    elements.push(clone);
    sendWS({ type: 'element_add', element: clone });
    selectElement(clone);
    if (clone.tool === 'sticky') syncStickyNotesDOM();
    redrawCanvas();
    showToast('Objek berhasil diduplikat', 'success');
  });

  // --- 9. SYNCHRONIZED STICKY NOTES ---
  function createStickyNote(worldX, worldY) {
    const note = {
      id: 'sticky-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      tool: 'sticky',
      x: worldX,
      y: worldY,
      width: 190,
      height: 140,
      text: 'Catatan baru...',
      color: '#fef08a' // light yellow
    };
    elements.push(note);
    sendWS({ type: 'element_add', element: note });
    syncStickyNotesDOM();
    selectElement(note);
  }

  function syncStickyNotesDOM() {
    const stickies = elements.filter(e => e.tool === 'sticky');
    const existingIds = new Set(stickies.map(s => `sticky-${s.id}`));

    // Remove obsolete DOM notes
    const domNotes = elementsOverlay.querySelectorAll('.sticky-note-element');
    domNotes.forEach(el => {
      if (!existingIds.has(el.id)) {
        el.remove();
      }
    });

    // Render or update active notes
    stickies.forEach(note => {
      let el = document.getElementById(`sticky-${note.id}`);
      if (!el) {
        el = document.createElement('div');
        el.id = `sticky-${note.id}`;
        el.className = 'sticky-note-element bg-amber-200 text-slate-900 border border-amber-300';
        el.innerHTML = `
          <div class="sticky-header">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-700/80">Catatan</span>
            <button class="sticky-delete-btn" title="Hapus Catatan (Delete)">&times;</button>
          </div>
          <div class="sticky-body" contenteditable="${userRole === 'editor'}"></div>
          <div class="sticky-resize-handle" title="Tarik untuk mengubah ukuran"></div>
        `;

        // Delete button directly on sticky note
        const delBtn = el.querySelector('.sticky-delete-btn');
        delBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          deleteElement(note);
        });

        // Content editing sync
        const bodyEl = el.querySelector('.sticky-body');
        bodyEl.addEventListener('input', () => {
          note.text = bodyEl.innerText;
          sendWS({ type: 'element_update', element: note });
        });

        // Click to select note
        el.addEventListener('mousedown', (ev) => {
          if (ev.target !== delBtn && !ev.target.classList.contains('sticky-resize-handle')) {
            selectElement(note);
          }
        });

        // Resize handle on bottom-right of sticky note
        const resizeHandle = el.querySelector('.sticky-resize-handle');
        let noteResizeActive = false;
        let noteResizeStartWorld = { x: 0, y: 0 };
        let origNoteW = 190;
        let origNoteH = 140;

        resizeHandle.addEventListener('mousedown', (ev) => {
          if (userRole !== 'editor') return;
          ev.stopPropagation();
          noteResizeActive = true;
          noteResizeStartWorld = screenToWorld(ev.clientX, ev.clientY);
          origNoteW = note.width || 190;
          origNoteH = note.height || 140;
          selectElement(note);

          const onResizeMove = (moveEv) => {
            if (!noteResizeActive) return;
            const currentW = screenToWorld(moveEv.clientX, moveEv.clientY);
            const dx = currentW.x - noteResizeStartWorld.x;
            const dy = currentW.y - noteResizeStartWorld.y;
            note.width = Math.max(90, origNoteW + dx);
            note.height = Math.max(70, origNoteH + dy);
            el.style.width = note.width * scale + 'px';
            el.style.height = note.height * scale + 'px';
            redrawCanvas();
          };

          const onResizeUp = () => {
            if (noteResizeActive) {
              noteResizeActive = false;
              sendWS({ type: 'element_update', element: note });
              window.removeEventListener('mousemove', onResizeMove);
              window.removeEventListener('mouseup', onResizeUp);
            }
          };

          window.addEventListener('mousemove', onResizeMove);
          window.addEventListener('mouseup', onResizeUp);
        });

        // Drag sticky note header to reposition
        const headerEl = el.querySelector('.sticky-header');
        let noteDragActive = false;
        let noteStartWorld = { x: 0, y: 0 };

        headerEl.addEventListener('mousedown', (ev) => {
          if (userRole !== 'editor') return;
          noteDragActive = true;
          noteStartWorld = screenToWorld(ev.clientX, ev.clientY);
          selectElement(note);

          const onHeaderMove = (moveEv) => {
            if (!noteDragActive) return;
            const currentW = screenToWorld(moveEv.clientX, moveEv.clientY);
            note.x += (currentW.x - noteStartWorld.x);
            note.y += (currentW.y - noteStartWorld.y);
            noteStartWorld = currentW;
            const pos = worldToScreen(note.x, note.y);
            el.style.left = pos.x + 'px';
            el.style.top = pos.y + 'px';
            redrawCanvas();
          };

          const onHeaderUp = () => {
            if (noteDragActive) {
              noteDragActive = false;
              sendWS({ type: 'element_update', element: note });
              window.removeEventListener('mousemove', onHeaderMove);
              window.removeEventListener('mouseup', onHeaderUp);
            }
          };

          window.addEventListener('mousemove', onHeaderMove);
          window.addEventListener('mouseup', onHeaderUp);
        });

        elementsOverlay.appendChild(el);
      }

      // Update position and content
      const pos = worldToScreen(note.x, note.y);
      el.style.left = pos.x + 'px';
      el.style.top = pos.y + 'px';
      el.style.width = (note.width || 190) * scale + 'px';
      el.style.height = (note.height || 140) * scale + 'px';
      el.style.fontSize = Math.max(9, (note.fontSize || 13) * scale) + 'px';

      const bodyEl = el.querySelector('.sticky-body');
      if (document.activeElement !== bodyEl && bodyEl.innerText !== note.text) {
        bodyEl.innerText = note.text || '';
      }
      bodyEl.contentEditable = (userRole === 'editor');

      if (selectedElement && selectedElement.id === note.id) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
  }

  // --- 10. INSERT IMAGE (File picker & Clipboard Paste) ---
  btnInsertImage.addEventListener('click', () => {
    if (userRole === 'editor') {
      canvasImageInput.click();
    }
  });

  canvasImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      handleImageFile(file);
      canvasImageInput.value = '';
    }
  });

  // Paste image directly from clipboard anywhere on canvas
  window.addEventListener('paste', (e) => {
    if (userRole !== 'editor') return;
    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
      for (const file of e.clipboardData.files) {
        if (file.type.startsWith('image/')) {
          e.preventDefault();
          handleImageFile(file);
          break;
        }
      }
    }
  });

  function handleImageFile(file) {
    const reader = new FileReader();
    reader.onload = (evt) => {
      insertImageToCanvas(evt.target.result);
    };
    reader.readAsDataURL(file);
  }

  function insertImageToCanvas(dataUrl) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Calculate scaled dimension (max 380px width)
      const maxDim = 380;
      let width = img.naturalWidth || 300;
      let height = img.naturalHeight || 200;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      // Position in center of current view
      const center = screenToWorld(canvasContainer.clientWidth / 2, canvasContainer.clientHeight / 2);
      const imgElem = {
        id: 'img-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        tool: 'image',
        x: Math.round(center.x - width / 2),
        y: Math.round(center.y - height / 2),
        width,
        height,
        src: dataUrl,
        imgObj: img
      };

      imageCache[dataUrl] = img;
      elements.push(imgElem);
      sendWS({ type: 'element_add', element: { ...imgElem, imgObj: undefined } });

      // Automatically select and switch to select tool
      const selectBtn = document.querySelector('.tool-btn[data-tool="select"]');
      if (selectBtn) selectBtn.click();
      selectElement(imgElem);

      redrawCanvas();
      showToast('Gambar berhasil disisipkan ke papan tulis', 'success');
    };
    img.src = dataUrl;
  }

  // --- 11. PDF INSERTION VIA PDF.JS ---
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  let activePdfDoc = null;
  let activePdfFileName = '';

  if (btnInsertPdf) {
    btnInsertPdf.addEventListener('click', () => {
      if (userRole === 'editor') {
        canvasPdfInput.click();
      }
    });
  }

  if (canvasPdfInput) {
    canvasPdfInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        handlePdfFile(file);
        canvasPdfInput.value = '';
      }
    });
  }

  // Drag and drop PDF or Image directly to canvas
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (userRole !== 'editor') return;
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        handlePdfFile(file);
      } else if (file.type.startsWith('image/')) {
        handleImageFile(file);
      }
    }
  });

  async function handlePdfFile(file) {
    if (!window.pdfjsLib) {
      showToast('Library PDF.js sedang dimuat, silakan tunggu sebentar...', 'warning');
      return;
    }
    showToast(`Membaca dokumen PDF "${file.name}"...`, 'info');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      activePdfDoc = pdf;
      activePdfFileName = file.name;

      if (pdf.numPages === 1) {
        await renderAndInsertPdfPage(pdf, 1);
        showToast('Dokumen PDF berhasil disisipkan!', 'success');
      } else {
        if (pdfDocInfo) pdfDocInfo.textContent = `Dokumen "${file.name}" memiliki ${pdf.numPages} halaman.`;
        if (inputPdfPageNum) {
          inputPdfPageNum.max = pdf.numPages;
          inputPdfPageNum.value = 1;
        }
        if (pdfTotalPagesLabel) pdfTotalPagesLabel.textContent = `dari ${pdf.numPages} halaman`;
        if (modalPdfOptions) modalPdfOptions.classList.remove('hidden');
      }
    } catch (err) {
      console.error('Error loading PDF:', err);
      showToast('Gagal memproses dokumen PDF: ' + err.message, 'warning');
    }
  }

  if (btnCancelPdf) {
    btnCancelPdf.addEventListener('click', () => {
      modalPdfOptions.classList.add('hidden');
      activePdfDoc = null;
    });
  }

  if (btnConfirmPdf) {
    btnConfirmPdf.addEventListener('click', async () => {
      if (!activePdfDoc) return;
      modalPdfOptions.classList.add('hidden');
      showToast('Merender halaman PDF ke papan tulis...', 'info');

      const mode = document.querySelector('input[name="pdf-insert-mode"]:checked')?.value || 'single';

      try {
        if (mode === 'single') {
          const pageNum = parseInt(inputPdfPageNum.value, 10) || 1;
          await renderAndInsertPdfPage(activePdfDoc, pageNum);
        } else {
          const renderWidth = 460;
          for (let p = 1; p <= activePdfDoc.numPages; p++) {
            const offsetX = (p - 1) * (renderWidth + 30);
            await renderAndInsertPdfPage(activePdfDoc, p, offsetX, 0, renderWidth);
          }
        }
        showToast('Dokumen PDF berhasil disisipkan ke papan tulis!', 'success');
      } catch (err) {
        console.error('Error rendering PDF:', err);
        showToast('Gagal merender halaman PDF', 'warning');
      } finally {
        activePdfDoc = null;
      }
    });
  }

  async function renderAndInsertPdfPage(pdfDoc, pageNum, offsetX = 0, offsetY = 0, targetWidth = 460) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.8 }); // High resolution render
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = viewport.width;
    tempCanvas.height = viewport.height;
    const ctx = tempCanvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = tempCanvas.toDataURL('image/png');

    const width = targetWidth;
    const height = Math.round((viewport.height * width) / viewport.width);

    const center = screenToWorld(canvasContainer.clientWidth / 2, canvasContainer.clientHeight / 2);
    const pdfElem = {
      id: 'pdf-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      tool: 'image',
      x: Math.round(center.x - width / 2) + offsetX,
      y: Math.round(center.y - height / 2) + offsetY,
      width,
      height,
      src: dataUrl
    };

    preloadElementAssets(pdfElem);
    elements.push(pdfElem);
    sendWS({ type: 'element_add', element: { ...pdfElem, imgObj: undefined } });

    const selectBtn = document.querySelector('.tool-btn[data-tool="select"]');
    if (selectBtn) selectBtn.click();
    selectElement(pdfElem);
    redrawCanvas();
  }

  // --- 12. REMOTE CURSORS ---
  function updateRemoteCursor(data) {
    if (data.userId === myUserId) return;

    let cursor = remoteCursors[data.userId];
    if (!cursor) {
      cursor = document.createElement('div');
      cursor.className = 'remote-cursor';
      cursor.innerHTML = `
        <svg class="remote-cursor-icon" viewBox="0 0 24 24" fill="${data.color}" stroke="#ffffff" stroke-width="1.5">
          <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.54.35-.85L5.85 2.86a.5.5 0 0 0-.35.35z"/>
        </svg>
        <span class="remote-cursor-tag" style="background-color: ${data.color}">${data.name}</span>
      `;
      cursorsOverlay.appendChild(cursor);
      remoteCursors[data.userId] = cursor;
    }

    const pos = worldToScreen(data.x, data.y);
    cursor.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  }

  // --- 12. ONLINE USERS LIST & PERMISSIONS MANAGER ---
  const headerUserName = document.getElementById('header-user-name');
  const headerUserAvatar = document.getElementById('header-user-avatar');
  const usersBadgeCount = document.getElementById('users-badge-count');
  const activeUsersCount = document.getElementById('active-users-count');
  const participantsList = document.getElementById('participants-list');
  const modalUsersPermissions = document.getElementById('modal-users-permissions');
  const btnUserProfile = document.getElementById('btn-user-profile');
  const btnUsersModal = document.getElementById('btn-users-modal');
  const btnCloseUsersModal = document.getElementById('btn-close-users-modal');
  const btnCloseUsersModalBottom = document.getElementById('btn-close-users-modal-bottom');
  const inputDisplayName = document.getElementById('input-display-name');
  const btnSaveProfile = document.getElementById('btn-save-profile');
  const profileColorPicker = document.getElementById('profile-color-picker');
  const profileRoleBadge = document.getElementById('profile-role-badge');

  const modalWelcomeName = document.getElementById('modal-welcome-name');
  const formWelcomeName = document.getElementById('form-welcome-name');
  const inputWelcomeName = document.getElementById('input-welcome-name');

  let currentUsersList = [];

  function updateHeaderProfile() {
    if (headerUserName) headerUserName.textContent = myName;
    if (headerUserAvatar) headerUserAvatar.style.backgroundColor = myColor;
    if (inputDisplayName) inputDisplayName.value = myName;
    if (profileRoleBadge) {
      profileRoleBadge.textContent = userRole === 'editor' ? 'Editor' : 'Viewer';
      profileRoleBadge.className = userRole === 'editor' 
        ? 'text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
        : 'text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30';
    }
  }

  function updateUserList(users) {
    if (!usersContainer || !Array.isArray(users)) return;
    currentUsersList = users;
    usersContainer.innerHTML = '';

    if (usersBadgeCount) usersBadgeCount.textContent = users.length;
    if (activeUsersCount) activeUsersCount.textContent = `${users.length} Online`;

    users.slice(0, 5).forEach(u => {
      const circle = document.createElement('div');
      circle.className = 'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white border-2 border-slate-900 shadow-sm';
      circle.style.backgroundColor = u.color;
      circle.title = `${u.name} (${u.role === 'editor' ? 'Editor' : 'Viewer'})`;
      circle.textContent = (u.name || 'U').substring(0, 2).toUpperCase();
      usersContainer.appendChild(circle);
    });

    if (users.length > 5) {
      const extra = document.createElement('div');
      extra.className = 'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-300 bg-slate-700 border-2 border-slate-900';
      extra.textContent = '+' + (users.length - 5);
      usersContainer.appendChild(extra);
    }

    renderParticipantsList(users);
  }

  function renderParticipantsList(users) {
    if (!participantsList || !Array.isArray(users)) return;
    participantsList.innerHTML = '';

    users.forEach(u => {
      const isMe = u.userId === myUserId;
      const item = document.createElement('div');
      item.className = 'flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition';

      const isEditorUser = (u.role === 'editor');
      const badgeRoleClass = isEditorUser
        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30';

      item.innerHTML = `
        <div class="flex items-center space-x-2.5 min-w-0">
          <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow shrink-0" style="background-color: ${u.color}">
            ${(u.name || 'U').substring(0, 2).toUpperCase()}
          </div>
          <div class="min-w-0">
            <div class="flex items-center space-x-1.5 flex-wrap">
              <span class="font-semibold text-xs text-slate-200 truncate">${escapeHtml(u.name)}</span>
              ${isMe ? '<span class="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/25 text-indigo-300 font-semibold border border-indigo-500/30">Anda</span>' : ''}
              ${u.isHost ? '<span class="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">Host</span>' : ''}
            </div>
            <div class="text-[11px] mt-0.5">
              <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${badgeRoleClass}">
                ${isEditorUser ? 'Bisa Mengedit (Editor)' : 'Hanya Melihat (Viewer)'}
              </span>
            </div>
          </div>
        </div>

        <div class="shrink-0 ml-2 flex items-center space-x-1.5">
          ${!isMe && userRole === 'editor' ? `
            ${u.isHost ? `
              <span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20" title="Host ruangan selalu memiliki izin Editor permanen">
                <i data-lucide="crown" class="w-3.5 h-3.5"></i>
                <span>Host Tetap</span>
              </span>
            ` : `
              ${isEditorUser ? `
                <button class="btn-change-role px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition flex items-center space-x-1" data-id="${u.userId}" data-role="viewer" title="Cabut izin edit pengguna ini">
                  <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                  <span>Jadikan Viewer</span>
                </button>
              ` : `
                <button class="btn-change-role px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition flex items-center space-x-1" data-id="${u.userId}" data-role="editor" title="Beri izin menggambar kepada pengguna ini">
                  <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                  <span>Jadikan Editor</span>
                </button>
              `}
              <button class="btn-kick-user p-1.5 rounded-lg text-xs font-medium bg-red-500/15 hover:bg-red-500/30 text-red-400 hover:text-red-300 border border-red-500/30 transition flex items-center space-x-1" data-id="${u.userId}" data-name="${escapeHtml(u.name)}" title="Keluarkan peserta ini dari ruangan">
                <i data-lucide="user-x" class="w-3.5 h-3.5"></i>
                <span class="hidden sm:inline">Kick</span>
              </button>
            `}
          ` : (u.isHost ? `
            <span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <i data-lucide="crown" class="w-3 h-3"></i>
              <span>Host</span>
            </span>
          ` : '')}
        </div>
      `;

      participantsList.appendChild(item);
    });

    // Attach role change handlers
    participantsList.querySelectorAll('.btn-change-role').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetUserId = btn.getAttribute('data-id');
        const nextRole = btn.getAttribute('data-role');
        sendWS({
          type: 'change_user_role',
          targetUserId,
          role: nextRole
        });
        showToast('Izin pengguna berhasil diperbarui', 'info');
      });
    });

    // Attach kick handlers
    participantsList.querySelectorAll('.btn-kick-user').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetUserId = btn.getAttribute('data-id');
        const targetName = btn.getAttribute('data-name') || 'peserta';
        if (confirm(`Apakah Anda yakin ingin mengeluarkan "${targetName}" dari ruangan?`)) {
          sendWS({
            type: 'kick_user',
            targetUserId
          });
        }
      });
    });

    lucide.createIcons();
  }

  // Profile modal triggers
  if (btnUserProfile) {
    btnUserProfile.addEventListener('click', () => {
      updateHeaderProfile();
      modalUsersPermissions.classList.remove('hidden');
    });
  }

  if (btnUsersModal) {
    btnUsersModal.addEventListener('click', () => {
      updateHeaderProfile();
      modalUsersPermissions.classList.remove('hidden');
    });
  }

  if (btnCloseUsersModal) {
    btnCloseUsersModal.addEventListener('click', () => {
      modalUsersPermissions.classList.add('hidden');
    });
  }

  if (btnCloseUsersModalBottom) {
    btnCloseUsersModalBottom.addEventListener('click', () => {
      modalUsersPermissions.classList.add('hidden');
    });
  }

  // Profile color swatch picker in modal
  if (profileColorPicker) {
    profileColorPicker.innerHTML = '';
    USER_COLORS.forEach(c => {
      const dot = document.createElement('button');
      dot.className = `w-5 h-5 rounded-full border-2 transition ${myColor === c ? 'border-white scale-110 shadow' : 'border-transparent'}`;
      dot.style.backgroundColor = c;
      dot.addEventListener('click', () => {
        myColor = c;
        localStorage.setItem('collab_color', myColor);
        updateHeaderProfile();
        sendWS({ type: 'change_name', name: myName, color: myColor });
        profileColorPicker.querySelectorAll('button').forEach(b => {
          b.className = 'w-5 h-5 rounded-full border-2 border-transparent transition';
        });
        dot.className = 'w-5 h-5 rounded-full border-2 border-white scale-110 shadow transition';
      });
      profileColorPicker.appendChild(dot);
    });
  }

  if (btnSaveProfile) {
    btnSaveProfile.addEventListener('click', () => {
      const newName = inputDisplayName.value.trim();
      if (!newName) {
        showToast('Nama tidak boleh kosong', 'warning');
        return;
      }
      myName = newName;
      localStorage.setItem('collab_name', myName);
      localStorage.setItem('collab_has_custom_name', 'true');
      updateHeaderProfile();
      sendWS({ type: 'change_name', name: myName, color: myColor });
      showToast('Nama profil berhasil disimpan!', 'success');
      modalUsersPermissions.classList.add('hidden');
    });
  }

  // Welcome modal for first-time visitors to set their name
  if (!localStorage.getItem('collab_has_custom_name')) {
    setTimeout(() => {
      if (modalWelcomeName) {
        modalWelcomeName.classList.remove('hidden');
        if (inputWelcomeName) {
          inputWelcomeName.value = myName.startsWith('User-') ? '' : myName;
          inputWelcomeName.focus();
        }
      }
    }, 400);
  }

  if (formWelcomeName) {
    formWelcomeName.addEventListener('submit', (e) => {
      e.preventDefault();
      const entered = inputWelcomeName.value.trim();
      if (entered) {
        myName = entered;
        localStorage.setItem('collab_name', myName);
        localStorage.setItem('collab_has_custom_name', 'true');
        updateHeaderProfile();
        sendWS({ type: 'change_name', name: myName, color: myColor });
        modalWelcomeName.classList.add('hidden');
        showToast(`Selamat datang, ${myName}!`, 'success');
      }
    });
  }

  updateHeaderProfile();

  // --- 13. TOOLBAR & PROPERTIES CONTROLS ---
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (userRole === 'viewer') return;
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTool = btn.getAttribute('data-tool');

      // Expand properties dock when choosing tools
      autoExpandPropertiesDock();

      canvasContainer.className = 'w-full h-full relative overflow-hidden';
      if (currentTool === 'pan') {
        canvasContainer.classList.add('cursor-pan');
        clearSelection();
      } else if (currentTool === 'eraser') {
        canvasContainer.classList.add('cursor-eraser');
        clearSelection();
      } else if (currentTool === 'select') {
        canvasContainer.classList.add('cursor-select');
      } else {
        canvasContainer.classList.add('cursor-pen');
        clearSelection();
      }
    });
  });

  document.querySelectorAll('.color-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      autoExpandPropertiesDock();
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('ring-2', 'ring-indigo-500'));
      btn.classList.add('ring-2', 'ring-indigo-500');
      strokeColor = btn.getAttribute('data-color');
      if (selectedElement && userRole === 'editor') {
        selectedElement.color = strokeColor;
        sendWS({ type: 'element_update', element: selectedElement });
        redrawCanvas();
      }
    });
  });

  const customColorPicker = document.getElementById('custom-color-picker');
  customColorPicker.addEventListener('input', (e) => {
    strokeColor = e.target.value;
    if (selectedElement && userRole === 'editor') {
      selectedElement.color = strokeColor;
      sendWS({ type: 'element_update', element: selectedElement });
      redrawCanvas();
    }
  });

  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active', 'text-indigo-400'));
      btn.classList.add('active', 'text-indigo-400');
      strokeWidth = parseInt(btn.getAttribute('data-size'), 10);
      if (selectedElement && userRole === 'editor') {
        if (selectedElement.tool === 'text') {
          selectedElement.size = strokeWidth;
          sendWS({ type: 'element_update', element: selectedElement });
          redrawCanvas();
        } else if (selectedElement.tool === 'sticky') {
          const sizeMap = { 2: 10, 4: 13, 8: 18, 16: 26 };
          const dimMap = { 2: { w: 140, h: 100 }, 4: { w: 190, h: 140 }, 8: { w: 260, h: 190 }, 16: { w: 340, h: 250 } };
          selectedElement.fontSize = sizeMap[strokeWidth] || 13;
          if (dimMap[strokeWidth]) {
            selectedElement.width = dimMap[strokeWidth].w;
            selectedElement.height = dimMap[strokeWidth].h;
          }
          sendWS({ type: 'element_update', element: selectedElement });
          syncStickyNotesDOM();
          redrawCanvas();
        } else if (selectedElement.size) {
          selectedElement.size = strokeWidth;
          sendWS({ type: 'element_update', element: selectedElement });
          redrawCanvas();
        }
      }
    });
  });

  const checkFill = document.getElementById('check-fill-shape');
  if (checkFill) {
    checkFill.addEventListener('change', (e) => {
      isFilled = e.target.checked;
      if (selectedElement && userRole === 'editor' && 'filled' in selectedElement) {
        selectedElement.filled = isFilled;
        sendWS({ type: 'element_update', element: selectedElement });
        redrawCanvas();
      }
    });
  }

  document.getElementById('btn-undo').addEventListener('click', () => {
    if (userRole === 'editor') sendWS({ type: 'undo' });
  });

  document.getElementById('btn-redo').addEventListener('click', () => {
    if (userRole === 'editor') sendWS({ type: 'redo' });
  });

  document.getElementById('btn-clear-board').addEventListener('click', () => {
    if (userRole === 'editor') {
      if (confirm('Apakah Anda yakin ingin menghapus seluruh gambar dan catatan di papan tulis?')) {
        sendWS({ type: 'clear' });
      }
    }
  });

  document.getElementById('btn-clear-text').addEventListener('click', () => {
    if (userRole === 'editor') {
      const textCount = elements.filter(e => e.tool === 'text').length;
      if (textCount === 0) {
        showToast('Tidak ada elemen teks untuk dihapus', 'info');
        return;
      }
      if (confirm(`Hapus ${textCount} elemen teks? Gambar dan PDF tidak akan terpengaruh.`)) {
        sendWS({ type: 'clear_text_only' });
      }
    }
  });

  // Keyboard Shortcuts: Delete, Backspace, Ctrl+Z, Ctrl+Y, tool shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

    // Delete selected object
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedElement && userRole === 'editor') {
        e.preventDefault();
        deleteElement(selectedElement);
        return;
      }
    }

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (userRole === 'editor') sendWS({ type: 'redo' });
        } else {
          if (userRole === 'editor') sendWS({ type: 'undo' });
        }
      } else if (e.key === 'y') {
        e.preventDefault();
        if (userRole === 'editor') sendWS({ type: 'redo' });
      }
      return;
    }

    const key = e.key.toLowerCase();
    const toolMap = {
      'v': 'select',
      'p': 'pen',
      'e': 'eraser',
      'h': 'pan',
      'l': 'line',
      'a': 'arrow',
      'r': 'rect',
      'o': 'circle',
      't': 'text'
    };
    if (toolMap[key] && userRole === 'editor') {
      const btn = document.querySelector(`.tool-btn[data-tool="${toolMap[key]}"]`);
      if (btn) btn.click();
    }

    // Slide navigation shortcuts
    if (e.key === 'PageUp' || e.key === '[') {
      if (currentSlideIndex > 0) {
        sendWS({ type: 'change_slide', index: currentSlideIndex - 1 });
      }
    } else if (e.key === 'PageDown' || e.key === ']') {
      if (currentSlideIndex < totalSlidesCount - 1) {
        sendWS({ type: 'change_slide', index: currentSlideIndex + 1 });
      }
    }
  });

  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    const oldScale = scale;
    scale = Math.min(scale * 1.2, MAX_SCALE);
    const cx = canvasContainer.clientWidth / 2;
    const cy = canvasContainer.clientHeight / 2;
    panX = cx - (cx - panX) * (scale / oldScale);
    panY = cy - (cy - panY) * (scale / oldScale);
    clampPanAndZoom();
    zoomLevelDisplay.textContent = Math.round(scale * 100) + '%';
    renderBackground();
    syncStickyNotesDOM();
    redrawCanvas();
  });

  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    const oldScale = scale;
    scale = Math.max(scale / 1.2, MIN_SCALE);
    const cx = canvasContainer.clientWidth / 2;
    const cy = canvasContainer.clientHeight / 2;
    panX = cx - (cx - panX) * (scale / oldScale);
    panY = cy - (cy - panY) * (scale / oldScale);
    clampPanAndZoom();
    zoomLevelDisplay.textContent = Math.round(scale * 100) + '%';
    renderBackground();
    syncStickyNotesDOM();
    redrawCanvas();
  });

  document.getElementById('btn-zoom-reset').addEventListener('click', () => {
    centerSlideInView(true);
    renderBackground();
    syncStickyNotesDOM();
    redrawCanvas();
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    clearSelection();
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = SLIDE_WIDTH;
    exportCanvas.height = SLIDE_HEIGHT;
    const expCtx = exportCanvas.getContext('2d');

    // Render slide background
    expCtx.fillStyle = backgroundState.color || '#1e293b';
    expCtx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);

    if (bgImageObj) {
      expCtx.drawImage(bgImageObj, 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
    } else {
      const patColor = backgroundState.patternColor || '#334155';
      const gridSize = backgroundState.gridSize || 26;
      const type = backgroundState.type;

      if (type === 'grid') {
        expCtx.strokeStyle = patColor;
        expCtx.lineWidth = 1;
        expCtx.beginPath();
        for (let x = 0; x <= SLIDE_WIDTH; x += gridSize) {
          expCtx.moveTo(x, 0);
          expCtx.lineTo(x, SLIDE_HEIGHT);
        }
        for (let y = 0; y <= SLIDE_HEIGHT; y += gridSize) {
          expCtx.moveTo(0, y);
          expCtx.lineTo(SLIDE_WIDTH, y);
        }
        expCtx.stroke();
      } else if (type === 'dots') {
        expCtx.fillStyle = patColor;
        for (let x = gridSize / 2; x <= SLIDE_WIDTH; x += gridSize) {
          for (let y = gridSize / 2; y <= SLIDE_HEIGHT; y += gridSize) {
            expCtx.beginPath();
            expCtx.arc(x, y, 1.3, 0, Math.PI * 2);
            expCtx.fill();
          }
        }
      } else if (type === 'lined') {
        expCtx.strokeStyle = patColor;
        expCtx.lineWidth = 1;
        expCtx.beginPath();
        for (let y = 0; y <= SLIDE_HEIGHT; y += gridSize) {
          expCtx.moveTo(0, y);
          expCtx.lineTo(SLIDE_WIDTH, y);
        }
        expCtx.stroke();
      }
    }

    // Render elements
    for (const elem of elements) {
      if (elem.tool !== 'sticky') {
        drawElement(expCtx, elem);
      }
    }

    const link = document.createElement('a');
    link.download = `collabboard-${roomId}-slide-${currentSlideIndex + 1}-${Date.now()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
    showToast(`Slide ${currentSlideIndex + 1} berhasil diunduh sebagai gambar PNG (HD 1080p)`, 'success');
  });

  // --- 14. BACKGROUND MODAL & SETTINGS ---
  let tempBgConfig = { ...backgroundState };

  document.getElementById('btn-bg-modal').addEventListener('click', () => {
    tempBgConfig = { ...backgroundState };
    modalBg.classList.remove('hidden');
  });

  document.getElementById('btn-close-bg-modal').addEventListener('click', () => {
    modalBg.classList.add('hidden');
  });

  document.querySelectorAll('.bg-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.bg-preset-btn').forEach(b => b.classList.remove('border-indigo-500', 'bg-indigo-500/10'));
      btn.classList.add('border-indigo-500', 'bg-indigo-500/10');
      tempBgConfig.color = btn.getAttribute('data-color');
      tempBgConfig.patternColor = btn.getAttribute('data-patcolor');
    });
  });

  document.querySelectorAll('.pattern-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pattern-btn').forEach(b => b.classList.remove('border-indigo-500', 'bg-indigo-500/10'));
      btn.classList.add('border-indigo-500', 'bg-indigo-500/10');
      tempBgConfig.type = btn.getAttribute('data-pattern');
    });
  });

  const bgFileInput = document.getElementById('bg-file-input');
  const bgFileLabel = document.getElementById('bg-file-label');
  const btnRemoveBgImage = document.getElementById('btn-remove-bg-image');

  bgFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        tempBgConfig.image = evt.target.result;
        bgFileLabel.textContent = file.name;
        btnRemoveBgImage.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    }
  });

  btnRemoveBgImage.addEventListener('click', () => {
    tempBgConfig.image = null;
    bgFileInput.value = '';
    bgFileLabel.textContent = 'Pilih Gambar...';
    btnRemoveBgImage.classList.add('hidden');
  });

  document.getElementById('btn-apply-bg').addEventListener('click', () => {
    if (userRole !== 'editor') return;
    backgroundState = { ...tempBgConfig };
    loadBackgroundImage(backgroundState.image, () => {
      renderBackground();
      redrawCanvas();
    });
    sendWS({
      type: 'set_background',
      background: backgroundState
    });
    modalBg.classList.add('hidden');
    showToast('Background berhasil diperbarui untuk semua peserta', 'success');
  });

  // --- 15. ENCRYPTED SHARE / INVITE MODAL ---
  const shareLinkEdit = document.getElementById('share-link-edit');
  const shareLinkView = document.getElementById('share-link-view');

  document.getElementById('btn-share').addEventListener('click', async () => {
    await fetchRoomTokens();
    const origin = `${window.location.protocol}//${window.location.host}`;
    shareLinkEdit.value = `${origin}/join?token=${currentEditorToken}`;
    shareLinkView.value = `${origin}/join?token=${currentViewerToken}`;
    modalShare.classList.remove('hidden');
  });

  document.getElementById('btn-close-share-modal').addEventListener('click', () => {
    modalShare.classList.add('hidden');
  });

  document.getElementById('btn-close-share-modal-bottom').addEventListener('click', () => {
    modalShare.classList.add('hidden');
  });

  function copyToClipboard(inputElement, feedbackBtn) {
    inputElement.select();
    inputElement.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(inputElement.value).then(() => {
      const origHtml = feedbackBtn.innerHTML;
      feedbackBtn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5 mr-1"></i> Tersalin!';
      lucide.createIcons();
      setTimeout(() => {
        feedbackBtn.innerHTML = origHtml;
        lucide.createIcons();
      }, 2000);
    });
  }

  document.getElementById('btn-copy-edit-link').addEventListener('click', function () {
    copyToClipboard(shareLinkEdit, this);
  });

  document.getElementById('btn-copy-view-link').addEventListener('click', function () {
    copyToClipboard(shareLinkView, this);
  });

  document.getElementById('btn-copy-code').addEventListener('click', () => {
    navigator.clipboard.writeText(roomId).then(() => {
      showToast(`Kode ruang ${roomId} berhasil disalin!`, 'info');
    });
  });

  // --- 16. CHAT DRAWER ---
  const btnChatToggle = document.getElementById('btn-chat-toggle');
  const btnCloseChat = document.getElementById('btn-close-chat');

  btnChatToggle.addEventListener('click', () => {
    const isHidden = chatDrawer.style.display === 'none' || chatDrawer.style.display === '';
    chatDrawer.style.display = isHidden ? 'flex' : 'none';
    chatDrawer.style.flexDirection = 'column';
    chatBadge.classList.add('hidden');
    if (isHidden) {
      chatInput.focus();
    }
  });

  btnCloseChat.addEventListener('click', () => {
    chatDrawer.style.display = 'none';
  });

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;

    sendWS({
      type: 'chat',
      message: text
    });
    chatInput.value = '';
  });

  function appendChatMessage(msg) {
    const isMe = msg.userId === myUserId;
    const item = document.createElement('div');
    item.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'}`;

    item.innerHTML = `
      <div class="flex items-center space-x-1.5 mb-1 text-[11px] text-slate-400">
        <span class="w-2 h-2 rounded-full" style="background-color: ${msg.color}"></span>
        <span class="font-medium ${isMe ? 'text-indigo-300' : 'text-slate-300'}">${isMe ? 'Anda' : msg.name}</span>
      </div>
      <div class="px-3 py-2 rounded-xl max-w-[85%] break-words leading-relaxed ${isMe ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200 border border-slate-700/80'}">
        ${escapeHtml(msg.message)}
      </div>
    `;

    chatMessages.appendChild(item);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (chatDrawer.style.display === 'none' && !isMe) {
      chatBadge.classList.remove('hidden');
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- 17. TOAST NOTIFICATIONS ---
  function showToast(text, type = 'info') {
    const toast = document.createElement('div');
    const colorClass = type === 'success' ? 'bg-emerald-600 text-white' :
                       type === 'warning' ? 'bg-amber-600 text-white' :
                       'bg-slate-800 text-slate-200 border border-slate-700';

    toast.className = `toast-item pointer-events-auto px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2 text-xs font-medium ${colorClass}`;
    toast.innerHTML = `<span>${text}</span>`;

    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // --- 18. VIEW MODE & TOOLBAR CONTROLS ---
  const btnViewMode = document.getElementById('btn-view-mode');
  const viewModeIcon = document.getElementById('view-mode-icon');
  const viewModeText = document.getElementById('view-mode-text');

  let currentViewMode = localStorage.getItem('collab_view_mode') || (window.innerWidth <= 768 ? 'mobile' : 'desktop');

  function applyViewMode(mode, showNotification = false) {
    currentViewMode = mode;
    localStorage.setItem('collab_view_mode', mode);

    if (mode === 'mobile') {
      document.body.classList.add('mobile-mode');
      document.body.classList.remove('desktop-mode');
      if (viewModeText) viewModeText.textContent = 'Mobile';
      if (viewModeIcon) viewModeIcon.setAttribute('data-lucide', 'smartphone');
    } else {
      document.body.classList.add('desktop-mode');
      document.body.classList.remove('mobile-mode');
      if (viewModeText) viewModeText.textContent = 'Desktop';
      if (viewModeIcon) viewModeIcon.setAttribute('data-lucide', 'monitor');
    }

    lucide.createIcons();
    resizeCanvases();

    if (showNotification) {
      showToast(`Tampilan beralih ke Mode ${mode === 'mobile' ? 'Mobile (HP/Tablet)' : 'Desktop'}`, 'info');
    }
  }

  if (btnViewMode) {
    btnViewMode.addEventListener('click', () => {
      const nextMode = currentViewMode === 'desktop' ? 'mobile' : 'desktop';
      applyViewMode(nextMode, true);
    });
  }

  // Mini toggle toolbar button (for compact / mobile view)
  const btnToggleToolbar = document.getElementById('btn-toggle-toolbar');
  const toolbarToggleIcon = document.getElementById('toolbar-toggle-icon');
  const toolbarEl = document.getElementById('toolbar');

  if (btnToggleToolbar && toolbarEl) {
    btnToggleToolbar.addEventListener('click', () => {
      toolbarEl.classList.toggle('collapsed');
      const isCollapsed = toolbarEl.classList.contains('collapsed');
      if (toolbarToggleIcon) {
        toolbarToggleIcon.setAttribute('data-lucide', isCollapsed ? 'chevron-right' : 'chevron-left');
      }
      lucide.createIcons();
    });
  }

  // --- 19. INITIALIZE ---
  applyViewMode(currentViewMode, false);
  centerSlideInView(true);
  resizeCanvases();
  updateSlideUI();
  connectWebSocket();
  lucide.createIcons();

})();
