// --- Virtual File System (VFS) ---
// Storage: IndexedDB for ~1GB capacity (localStorage is only ~5–10MB)
const VFS_DB_NAME = "RobbieOS_VFS";
const VFS_STORE_NAME = "vfs";
const VFS_QUOTA_MB = 1024; // 1 GB

const defaultVFS = {
  type: "dir",
  children: {
    projects: {
      type: "dir",
      icon: "ph-briefcase",
      children: {
        "RobbieOS.txt": {
          type: "file",
          content: "A beautiful webOS built with just HTML, CSS, and JS.",
        },
        "cat.txt": {
          type: "file",
          content:
            "I love cats. They are so cute and fluffy. My cat's name is Millet.",
        },
      },
    },
    skills: {
      type: "dir",
      icon: "ph-lightning",
      children: {
        "programming.txt": {
          type: "file",
          content:
            "I know and I am proficent in JavaScript, Java, Python, C#, and HTML/CSS",
        },
        "GameDev.txt": {
          type: "file",
          content:
            "I have 7 years of experience in game development. I have worked on many game projects and I am proficient in Unity.",
        },
      },
    },
    experience: {
      type: "dir",
      icon: "ph-medal",
      children: {
        "HackClub.txt": {
          type: "file",
          content: "I love flavortown :D.",
        },
        "Games.txt": {
          type: "file",
          content: "I love making games, I think it would be my dream job.",
        },
      },
    },
    "about_me.txt": {
      type: "file",
      content: "I am a 16 year old developer and I like to make cool things :)",
    },
    "contact.txt": {
      type: "file",
      content: "Email: zhengyuanma111@gmail.com",
    },
    music: {
      type: "dir",
      icon: "ph-music-notes",
      children: {
        "Sample Track.mp3": {
          type: "file",
          content:
            "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        },
      },
    },
  },
};

// Define a map of available Phosphor icons for folders
const iconMap = {
  projects: "ph-briefcase",
  skills: "ph-lightning",
  experience: "ph-medal",
  documents: "ph-file-doc",
  downloads: "ph-download-simple",
  music: "ph-music-notes",
  pictures: "ph-image",
  videos: "ph-video-camera",
  folder: "ph-folder",
  coding: "ph-code",
  games: "ph-game-controller",
  archive: "ph-archive",
  cloud: "ph-cloud",
  heart: "ph-heart",
  star: "ph-star",
  gear: "ph-gear",
  user: "ph-user",
};

// Start with default; will be replaced when IndexedDB loads
let vfs = JSON.parse(JSON.stringify(defaultVFS));

function openVFSDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VFS_DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(VFS_STORE_NAME, { keyPath: "id" });
    };
  });
}

function loadVFSFromIndexedDB() {
  return openVFSDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VFS_STORE_NAME, "readonly");
      const store = tx.objectStore(VFS_STORE_NAME);
      const req = store.get("robbieos_vfs");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        db.close();
        const data = req.result;
        resolve(data ? data.payload : null);
      };
    });
  });
}

function saveVFSToIndexedDB(payload) {
  return openVFSDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VFS_STORE_NAME, "readwrite");
      const store = tx.objectStore(VFS_STORE_NAME);
      store.put({ id: "robbieos_vfs", payload: payload });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  });
}

// Load VFS and preferences on startup
function initVFS() {
  loadVFSFromIndexedDB()
    .then((loaded) => {
      if (loaded && typeof loaded === "object" && loaded.children) {
        vfs = loaded;
      } else {
        // Migrate from localStorage if present
        const legacy = localStorage.getItem("robbieos_vfs");
        if (legacy) {
          try {
            vfs = JSON.parse(legacy);
            saveVFSToIndexedDB(vfs)
              .then(() => {
                localStorage.removeItem("robbieos_vfs");
              })
              .catch(() => {});
          } catch (e) {}
        }
      }

      // Load saved background
      const savedBg = localStorage.getItem("robbieos_background");
      if (savedBg) {
        try {
          const bgData = JSON.parse(savedBg);
          setBackground(bgData.type, bgData.url);
        } catch (e) {
          setBackground("default");
        }
      } else {
        setBackground("default");
      }

      document
        .querySelectorAll('.os-window[data-app="files"]')
        .forEach((win) => {
          renderExplorer(win, win.dataset.currentPath || "/");
        });

      // Show mobile warning popup once per session
      if (!sessionStorage.getItem("robbieos_mobile_warned")) {
        const isMobile =
          window.innerWidth <= 768 ||
          /Mobi|Android|iPhone/i.test(navigator.userAgent);
        if (isMobile) {
          setTimeout(() => {
            if (typeof osAlert === "function") {
              osAlert(
                "For the best experience, please use RobbieOS on a desktop browser. You may continue, but some features might not be fully optimized.",
                "Mobile Device Detected",
              );
              sessionStorage.setItem("robbieos_mobile_warned", "true");
            }
          }, 1500); // Wait a moment for OS to settle before showing popup
        }
      }
    })
    .catch(() => {
      const legacy = localStorage.getItem("robbieos_vfs");
      if (legacy) {
        try {
          vfs = JSON.parse(legacy);
        } catch (e) {}
      }
      setBackground("default");
    });
}

let saveVFSTimeout = null;
function saveVFS(immediate = false) {
  vfsStorageCache = null; // Invalidate cache
  if (saveVFSTimeout) {
    clearTimeout(saveVFSTimeout);
    saveVFSTimeout = null;
  }

  const performSave = () => {
    const vfsString = JSON.stringify(vfs);
    const storageInfo = calculateStorageUsage(true); // Recalculate
    const sizeInMB = storageInfo.totalMB;

    if (sizeInMB > VFS_QUOTA_MB * 0.9) {
      if (typeof osAlert === "function") {
        osAlert(
          `Storage is almost full (${sizeInMB.toFixed(2)} MB / ${VFS_QUOTA_MB} MB). Remove some files to free space.`,
          "Storage Warning",
        );
      }
    }

    saveVFSToIndexedDB(vfs).catch((e) => {
      if (typeof osAlert === "function") {
        osAlert(
          "Failed to save to storage: " + (e.message || "Unknown error"),
          "Storage Error",
        );
      }
    });
  };

  if (immediate) {
    performSave();
  } else {
    saveVFSTimeout = setTimeout(performSave, 1000);
  }
}

// Calculate storage usage
let vfsStorageCache = null;

function calculateStorageUsage(bypassCache = false) {
  if (vfsStorageCache && !bypassCache) return vfsStorageCache;

  // Optimized calculation: Avoid stringifying the entire VFS (slow for large files)
  let txtSize = 0;
  let imageSize = 0;
  let drwSize = 0;
  let musicSize = 0;
  let fileCounts = { txt: 0, images: 0, drw: 0, music: 0, folders: 0 };
  let estimatedTotalBytes = 0;

  function traverse(node, name = "") {
    // Estimating JSON overhead: quotes, colons, braces, etc.
    estimatedTotalBytes += name.length + 20;

    if (node.type === "dir" && node.children) {
      fileCounts.folders++;
      for (let childName in node.children) {
        traverse(node.children[childName], childName);
      }
    } else if (node.type === "file") {
      const content = node.content || "";
      const contentSize = content.length;
      estimatedTotalBytes += contentSize;

      if (node.fileType === "image") {
        imageSize += contentSize;
        fileCounts.images++;
      } else if (node.fileType === "drw") {
        drwSize += contentSize;
        fileCounts.drw++;
      } else if (isMusicFile(name)) {
        musicSize += contentSize;
        fileCounts.music++;
      } else {
        txtSize += contentSize;
        fileCounts.txt++;
      }
    }
  }

  traverse(vfs, "root");

  const totalSizeMB = estimatedTotalBytes / (1024 * 1024);
  const estimatedQuotaMB = VFS_QUOTA_MB;
  const availableMB = Math.max(0, estimatedQuotaMB - totalSizeMB);
  const usagePercent = Math.min(100, (totalSizeMB / estimatedQuotaMB) * 100);

  vfsStorageCache = {
    totalMB: totalSizeMB,
    availableMB: availableMB,
    quotaMB: estimatedQuotaMB,
    usagePercent: usagePercent,
    breakdown: {
      txtMB: txtSize / (1024 * 1024),
      imageMB: imageSize / (1024 * 1024),
      drwMB: drwSize / (1024 * 1024),
      musicMB: musicSize / (1024 * 1024),
      fileCounts: fileCounts,
    },
  };
  return vfsStorageCache;
}

function updateStorageDisplay(win) {
  if (!win) return;

  const storageInfo = calculateStorageUsage();
  const usedEl = win.querySelector("#storage-used");
  const availableEl = win.querySelector("#storage-available");
  const barEl = win.querySelector("#storage-bar");
  const breakdownEl = win.querySelector("#storage-breakdown");

  if (usedEl) {
    usedEl.textContent = `${storageInfo.totalMB.toFixed(2)} MB / ${storageInfo.quotaMB || 1024} MB`;
  }

  if (availableEl) {
    const avail = storageInfo.availableMB;
    availableEl.textContent =
      avail >= 1024
        ? `${(avail / 1024).toFixed(2)} GB free`
        : `${avail.toFixed(2)} MB free`;
  }

  if (barEl) {
    barEl.style.width = `${storageInfo.usagePercent}%`;
    // Change color based on usage
    if (storageInfo.usagePercent > 90) {
      barEl.style.background = "var(--danger)";
    } else if (storageInfo.usagePercent > 70) {
      barEl.style.background = "var(--warning)";
    } else {
      barEl.style.background = "var(--accent)";
    }
  }

  if (breakdownEl) {
    const counts = storageInfo.breakdown.fileCounts;
    breakdownEl.innerHTML = `
            <div>📄 Text files: ${counts.txt} (${storageInfo.breakdown.txtMB.toFixed(2)} MB)</div>
            <div>🖼️ Images: ${counts.images} (${storageInfo.breakdown.imageMB.toFixed(2)} MB)</div>
            <div>🎨 Drawings: ${counts.drw} (${storageInfo.breakdown.drwMB.toFixed(2)} MB)</div>
            <div>🎵 Music: ${counts.music} (${storageInfo.breakdown.musicMB.toFixed(2)} MB)</div>
            <div>📁 Folders: ${counts.folders}</div>
        `;
  }
}

// --- Clock Logic ---
function updateClock() {
  const now = new Date();
  let hours = now.getHours();
  let minutes = now.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";

  hours = hours % 12;
  hours = hours ? hours : 12;
  minutes = minutes < 10 ? "0" + minutes : minutes;

  document.getElementById("clock").innerText = `${hours}:${minutes} ${ampm}`;
}
setInterval(updateClock, 1000);
updateClock();

// --- Window Management ---
let zIndexCounter = 100;
const desktop = document.getElementById("desktop");
const activeWindows = [];

function updateDock() {
  const dockItems = document.querySelectorAll(".dock-item");
  dockItems.forEach((item) => {
    const onclickStr = item.getAttribute("onclick");
    if (!onclickStr || !onclickStr.includes("openApp")) return;
    const match = onclickStr.match(/openApp\(['"]([^'"]+)['"]\)/);
    if (!match) return;
    const appId = match[1];

    const instances = Array.from(
      document.querySelectorAll(`.os-window[data-app="${appId}"]`),
    ).filter((w) => !w.classList.contains("closing"));

    // Dot indicator
    let dot = item.querySelector(".active-dot");
    if (instances.length > 0) {
      item.classList.add("has-instances");
      if (!dot) {
        dot = document.createElement("div");
        dot.className = "active-dot";
        item.appendChild(dot);
      }
    } else {
      item.classList.remove("has-instances");
      if (dot) dot.remove();
    }

    // Previews
    let previewContainer = item.querySelector(".dock-preview-container");
    if (instances.length > 0) {
      if (!previewContainer) {
        previewContainer = document.createElement("div");
        previewContainer.className = "dock-preview-container";
        item.appendChild(previewContainer);
      }

      previewContainer.innerHTML = "";
      instances.forEach((inst, index) => {
        let titleText = "Window";
        if (appData[appId] && appData[appId].title) {
          titleText = `${appData[appId].title} ${index + 1}`;
        }

        let iconClass = "ph-app-window";
        const iconEl = item.querySelector("i");
        if (iconEl) {
          const matchClass = Array.from(iconEl.classList).find(
            (c) => c.startsWith("ph-") && c !== "ph" && c !== "ph-fill",
          );
          if (matchClass) iconClass = matchClass;
        }

        const prevItem = document.createElement("div");
        prevItem.className = "dock-preview-item";
        prevItem.innerHTML = `
          <div class="dock-preview-close" title="Close Window"><i class="ph ph-x"></i></div>
          <div class="dock-preview-content-wrapper"></div>
          <div class="window-title" title="${titleText}">${titleText}</div>
        `;

        // Clone the window content for a live preview
        const contentWrapper = prevItem.querySelector(
          ".dock-preview-content-wrapper",
        );
        const originalContent = inst.querySelector(".window-content");
        if (originalContent) {
          const clone = originalContent.cloneNode(true);
          // Strip duplicate IDs to avoid breaking things
          clone
            .querySelectorAll("[id]")
            .forEach((el) => el.removeAttribute("id"));
          clone.id = "";

          // Disable interaction and animation in clone
          clone.style.pointerEvents = "none";
          clone.style.overflow = "hidden";

          // Calculate realistic scaling down to the preview box
          // The preview wrapper is approx 110px wide
          const wrapperWidth = 110;
          const origWidth =
            parseFloat(inst.style.width) || inst.offsetWidth || 800;
          const origHeight =
            parseFloat(inst.style.height) || inst.offsetHeight || 600;
          const scaleRatio = wrapperWidth / origWidth;

          clone.style.position = "absolute";
          clone.style.top = "0";
          clone.style.left = "0";
          clone.style.width = `${origWidth}px`;
          clone.style.height = `${origHeight}px`; // use full height so it scales perfectly
          clone.style.transform = `scale(${scaleRatio})`;
          clone.style.transformOrigin = "top left";
          clone.style.background = "transparent";

          contentWrapper.appendChild(clone);
        } else {
          contentWrapper.innerHTML = `<div class="app-icon" style="height: 100%; display: flex; align-items: center; justify-content: center;"><i class="ph ${iconClass}"></i></div>`;
        }

        prevItem.addEventListener("click", (e) => {
          e.stopPropagation();
          inst.classList.remove("minimized");
          setActiveWindow(inst);
          updateDock();
        });

        const closeBtn = prevItem.querySelector(".dock-preview-close");
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          inst.classList.add("closing");
          setTimeout(() => inst.remove(), 300);
        });

        previewContainer.appendChild(prevItem);
      });
    } else {
      if (previewContainer) previewContainer.remove();
    }
  });
}

// Observe desktop for window changes
const desktopObserver = new MutationObserver(() => {
  updateDock();
});
desktopObserver.observe(desktop, { childList: true });

// Quickfind Logic
const quickfindOverlay = document.getElementById("quickfind-overlay");
const quickfindInput = document.querySelector(".quickfind-input");
let isQuickfindOpen = false;

document.addEventListener("keydown", (e) => {
  // Cmd+Space or Ctrl+Space
  if ((e.metaKey || e.ctrlKey) && e.code === "Space") {
    toggleQuickfind();
  }
  // Escape to close
  if (e.key === "Escape" && isQuickfindOpen) {
    toggleQuickfind();
  }
});

function toggleQuickfind() {
  isQuickfindOpen = !isQuickfindOpen;
  if (isQuickfindOpen) {
    quickfindOverlay.classList.add("visible");
    quickfindInput.value = "";
    if (typeof updateQuickfindSuggestions === "function")
      updateQuickfindSuggestions();
    quickfindInput.focus();
  } else {
    quickfindOverlay.classList.remove("visible");
    quickfindInput.blur();
    if (
      typeof updateQuickfindSuggestions === "function" &&
      quickfindSuggestions
    ) {
      quickfindSuggestions.classList.remove("active");
    }
  }
}

const quickfindSuggestions = document.getElementById("quickfind-suggestions");
let activeSuggestionIndex = -1;

function updateQuickfindSuggestions() {
  const query = quickfindInput.value.trim().toLowerCase();
  quickfindSuggestions.innerHTML = "";
  activeSuggestionIndex = -1;
  const allApps = [
    "terminal",
    "browser",
    "files",
    "Notepad",
    "settings",
    "drawing",
    "photoviewer",
    "musicplayer",
  ];

  if (!query) {
    quickfindSuggestions.classList.remove("active");
    return;
  }

  const matches = allApps.filter((app) => app.toLowerCase().includes(query));

  // Also support alias "term"
  if ("term".includes(query) && !matches.includes("terminal"))
    matches.push("terminal");
  // Also support alias "photos"
  if ("photos".includes(query) && !matches.includes("photoviewer"))
    matches.push("photoviewer");
  // Also support alias "music"
  if ("music".includes(query) && !matches.includes("musicplayer"))
    matches.push("musicplayer");

  if (matches.length > 0) {
    quickfindSuggestions.classList.add("active");
    matches.forEach((app, idx) => {
      const el = document.createElement("div");
      el.className = "suggestion-item";
      let icon = "ph-app-window";
      if (app === "terminal") icon = "ph-terminal-window";
      if (app === "browser") icon = "ph-globe";
      if (app === "files") icon = "ph-folder-open";
      if (app === "Notepad") icon = "ph-note-pencil";
      if (app === "settings") icon = "ph-gear";
      if (app === "drawing") icon = "ph-paint-brush";
      if (app === "photoviewer") icon = "ph-image";
      if (app === "musicplayer") icon = "ph-music-notes";

      const displayName =
        app === "musicplayer"
          ? "Music"
          : app.charAt(0).toUpperCase() + app.slice(1);
      el.innerHTML = `<i class="ph ${icon}"></i> <span>${displayName}</span>`;
      el.onmousedown = () => {
        // fires before blur
        openApp(app);
        toggleQuickfind();
      };
      // Track index for keyboard navigation
      el.dataset.index = idx;
      el.dataset.app = app;
      quickfindSuggestions.appendChild(el);
    });
  } else {
    quickfindSuggestions.classList.remove("active");
  }
}

quickfindInput.addEventListener("input", updateQuickfindSuggestions);

quickfindInput.addEventListener("keydown", (e) => {
  const items = Array.from(
    quickfindSuggestions.querySelectorAll(".suggestion-item"),
  );

  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (items.length === 0) return;
    activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
    items.forEach((it, idx) =>
      it.classList.toggle("selected", idx === activeSuggestionIndex),
    );
    items[activeSuggestionIndex].scrollIntoView({ block: "nearest" });
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (items.length === 0) return;
    activeSuggestionIndex = activeSuggestionIndex - 1;
    if (activeSuggestionIndex < 0) activeSuggestionIndex = items.length - 1;
    items.forEach((it, idx) =>
      it.classList.toggle("selected", idx === activeSuggestionIndex),
    );
    items[activeSuggestionIndex].scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (items.length > 0) {
      const idx = activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0;
      const app = items[idx].dataset.app;
      openApp(app);
      toggleQuickfind();
    } else {
      toggleQuickfind();
    }
  }
});

quickfindInput.addEventListener("blur", () => {
  // slight delay to allow click on suggestion to register
  setTimeout(() => {
    if (isQuickfindOpen) toggleQuickfind();
  }, 150);
});

const appData = {
  terminal: {
    title: "terminal",
    width: "750px",
    height: "480px",
    type: "terminal",
    content: `
            <div class="terminal-body" style="height: 100%;">
                <div class="output">
                    <div style="color: var(--accent);">Welcome to RobbieOS v2.0</div>
                    <div style="margin-top: 5px; color: var(--text-muted);">Type 'help' for available commands.</div>
                    <br>
                </div>
                <div class="input-line" style="display: flex; gap: 8px; color: var(--success);">
                    <span>➜</span>
                    <span style="color: var(--accent);">~</span>
                    <input type="text" class="cmd-input" autofocus spellcheck="false" autocomplete="off"
                        style="background: transparent; border: none; outline: none; color: var(--text-main); font-family: 'JetBrains Mono', monospace; flex-grow: 1; font-size: 14px;">
                </div>
            </div>
        `,
  },
  settings: {
    title: "Settings",
    width: "600px",
    height: "650px",
    type: "html",
    content: `
            <div style="font-family: 'Inter', sans-serif;">
                <h3 style="color: var(--text-main); margin-bottom: 25px; font-weight: 600; font-size: 20px;">System Preferences</h3>
                
                <div style="display: flex; flex-direction: column; gap: 20px;">
                    <!-- Appearance -->
                    <div style="background: rgba(255,255,255,0.05); padding: 20px; border-radius: 12px;">
                        <div style="font-weight: 600; margin-bottom: 12px; color: var(--accent);">Wallpapers</div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
                            <div onclick="setBackground('default')" style="cursor: pointer; text-align: center;">
                                <div style="height: 60px; background: url('backgrounds/default.png') center/cover; border-radius: 8px;"></div>
                                <div style="font-size: 11px; margin-top: 5px; opacity: 0.7;">Default</div>
                            </div>
                            <div onclick="setBackground('spirited')" style="cursor: pointer; text-align: center;">
                                <div style="height: 60px; background: url('backgrounds/Spirted Away Station.png') center/cover; border-radius: 8px;"></div>
                                <div style="font-size: 11px; margin-top: 5px; opacity: 0.7;">Station</div>
                            </div>
                             <div onclick="setBackground('ocean')" style="cursor: pointer; text-align: center;">
                                <div style="height: 60px; background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); border-radius: 8px;"></div>
                                <div style="font-size: 11px; margin-top: 5px; opacity: 0.7;">Ocean</div>
                            </div>
                            <div onclick="setBackground('live')" style="cursor: pointer; text-align: center;">
                                <div style="height: 60px; background: #000; border-radius: 8px; border: 1px dashed var(--accent);">
                                    <div style="color: var(--accent); font-size: 18px; line-height: 60px;">🐱</div>
                                </div>
                                <div style="font-size: 11px; margin-top: 5px; opacity: 0.7;">Swamp Cat (Live)</div>
                            </div>
                        </div>
                    </div>

                    <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 10px; display: flex; align-items: center; justify-content: space-between;">
                         <div>
                            <div style="font-weight: 500;">Dock Transparency</div>
                            <div style="font-size: 12px; color: var(--text-muted);">Adjust UI glass effect</div>
                        </div>
                        <input type="range" min="10" max="90" value="20" style="accent-color: var(--accent);">
                    </div>

                    <!-- Storage Information -->
                    <div style="background: rgba(255,255,255,0.05); padding: 20px; border-radius: 12px;">
                        <div style="font-weight: 600; margin-bottom: 4px; color: var(--accent);">Storage</div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 15px;">Limit: 1 GB (IndexedDB)</div>
                        <div id="storage-info" style="font-size: 13px;">
                            <!-- Storage info will be injected here -->
                        </div>
                        <div style="margin-top: 15px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 12px;">
                                <span style="color: var(--text-muted);">Used</span>
                                <span id="storage-used" style="color: var(--text-main); font-weight: 600;">-</span>
                            </div>
                            <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
                                <div id="storage-bar" style="height: 100%; background: var(--accent); border-radius: 4px; transition: width 0.3s; width: 0%;"></div>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-top: 5px; font-size: 11px; color: var(--text-muted);">
                                <span>Available</span>
                                <span id="storage-available">-</span>
                            </div>
                        </div>
                        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);">
                            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">File Breakdown:</div>
                            <div id="storage-breakdown" style="font-size: 11px; color: var(--text-muted); line-height: 1.6;">
                                <!-- Breakdown will be injected here -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `,
  },
  browser: {
    title: "Browser",
    width: "800px",
    height: "600px",
    type: "html",
    content: `
            <div class="browser-container">
                <div class="browser-header">
                    <div class="browser-nav">
<<<<
                        <div class="browser-nav-btn" onclick="browserGoBack(this)" title="Go Back">
                            <i class="ph ph-caret-left"></i>
                        </div>
                        <div class="browser-nav-btn" onclick="browserReload(this)" title="Reload">
                            <i class="ph ph-arrow-clockwise"></i>
                        </div>
                        <div class="browser-nav-btn js-proxy-toggle" onclick="toggleBrowserProxy(this)" title="Toggle Proxy Mode (Bypass Connection Refusal)" style="position: relative;">
                            <i class="ph ph-shield-check" style="color: #34a853;"></i>
                            <div class="glass-proxy-tooltip" style="position:absolute; top:calc(100% + 14px); left:50%; transform:translateX(-50%); background:var(--glass-bg); backdrop-filter:blur(25px); -webkit-backdrop-filter:blur(25px); border:1px solid var(--glass-border); color:var(--text-main); font-size:13px; font-weight:600; padding:10px 16px; border-radius:12px; display:none; white-space:nowrap; box-shadow:0 12px 40px rgba(0,0,0,0.5); z-index:200; cursor:pointer;">
                                <span>Is this page not loading? Click me!</span>
                                <i class="ph ph-x" style="margin-left: 10px; opacity: 0.6; transition: opacity 0.2s; padding: 4px;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'" onclick="event.stopPropagation(); this.parentElement.style.display='none'; this.closest('.os-window').dataset.muteProxyTooltip='true';"></i>
                                <div style="position:absolute; top:-4px; left:50%; transform:translateX(-50%) rotate(45deg); width:8px; height:8px; background:var(--glass-bg); border-top:1px solid var(--glass-border); border-left:1px solid var(--glass-border);"></div>
                            </div>
                        </div>
                        <div class="browser-nav-btn" onclick="window.open(this.closest('.browser-container').querySelector('input').value, '_blank')" title="Open in New Tab">
                            <i class="ph ph-arrow-square-out"></i>
                        </div>
                    </div>
                    <div class="browser-address-bar">
                        <input type="text" placeholder="Search or enter address" onkeydown="if(event.key==='Enter') navigateBrowser(this)">
                    </div>
====
                </div>
                <div class="browser-viewport">
                    <div class="browser-view-content" id="browser-content" style="height: 100%; position: relative;">
                        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #5f6368; font-family: 'Inter', sans-serif;">
                            <i class="ph ph-globe-hemisphere-west" style="font-size: 64px; margin-bottom: 20px; color: var(--accent);"></i>
                            <h2 style="margin-bottom: 10px; color: #202124;">Welcome to RobbieOS Browser</h2>
                            <p style="font-size: 14px;">Enter a URL or search to get started.</p>
                        </div>
                    </div>
                </div>
            </div>
        `,
  },
  files: {
    title: "Files",
    width: "900px",
    height: "600px",
    type: "html",
    content: `
            <div class="explorer-container">
                <div class="explorer-sidebar" id="explorer-sidebar">
                    <!-- Dynamic Items -->
                </div>

                <div class="explorer-main">
                    <div class="explorer-toolbar">
                        <div class="browser-nav">
                            <div class="browser-nav-btn" onclick="explorerGoBackBtn(this)">
                                <i class="ph ph-caret-left"></i>
                            </div>
                        </div>
                        <input type="text" class="path-input" id="explorer-path" value="/" onkeydown="if(event.key==='Enter') explorerNavigateInput(this)">
                    </div>
                    <div class="explorer-grid" id="explorer-grid">
                        <!-- Files/Folders injected here -->
                    </div>
                    <div class="explorer-drag-dialog">
                        <i class="ph-fill ph-info"></i>
                        <span>You can drag in your own files here!</span>
                        <button class="close-btn" onclick="this.closest('.explorer-drag-dialog').style.display='none'"><i class="ph ph-x"></i></button>
                    </div>
                </div>
            </div>
        `,
  },
  Notepad: {
    title: "Text Notepad",
    width: "800px",
    height: "600px",
    type: "html",
    content: `
            <div class="Notepad-container">
                <div class="Notepad-toolbar">
                    <div style="display: flex; gap: 8px; width: 100%; align-items: center; background: rgba(255,255,255,0.05); padding: 4px 12px; border-radius: 8px; border: 1px solid var(--glass-border);">
                        <i class="ph ph-file-text" style="color: var(--accent);"></i>
                        <input type="text" id="Notepad-smart-path" placeholder="/projects/notes.txt" 
                            style="background: transparent; border: none; outline: none; color: var(--text-main); flex-grow: 1; font-size: 13px; height: 30px;"
                            onkeydown="if(event.key==='Enter') handleSmartPath(this, 'txt')">
                        <div style="font-size: 10px; color: var(--text-muted); opacity: 0.7;">Enter to Save/Load</div>
                    </div>
                </div>
                <div class="Notepad-content">
                    <textarea id="Notepad-textarea" spellcheck="false" placeholder="Start typing..."></textarea>
                </div>
            </div>
        `,
  },
  drawing: {
    title: "Drawing",
    width: "800px",
    height: "600px",
    type: "html",
    content: `
            <div class="drawing-container">
                <div class="drawing-toolbar">
                     <div style="display: flex; gap: 8px; width: 100%; align-items: center; background: rgba(255,255,255,0.05); padding: 4px 12px; border-radius: 8px; border: 1px solid var(--glass-border); margin-bottom: 10px;">
                        <i class="ph ph-paint-brush" style="color: var(--accent);"></i>
                        <input type="text" id="drawing-smart-path" placeholder="/pictures/drawing.drw" 
                            style="background: transparent; border: none; outline: none; color: var(--text-main); flex-grow: 1; font-size: 13px; height: 30px;"
                            onkeydown="if(event.key==='Enter') handleSmartPath(this, 'drw')">
                        <div style="font-size: 10px; color: var(--text-muted); opacity: 0.7;">Enter to Save/Load</div>
                    </div>
                    <div class="drawing-tools" style="justify-content: flex-start; gap: 15px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <input type="color" id="drawing-color" value="#89b4fa" title="Color">
                            <button class="tool-btn" id="drawing-eraser" onclick="toggleEraser(this)" title="Eraser">
                                <i class="ph ph-eraser"></i>
                            </button>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; flex-grow: 1;">
                            <i class="ph ph-line-weight" style="font-size: 16px; opacity: 0.6;"></i>
                            <input type="range" id="drawing-size" min="1" max="50" value="3" style="flex-grow: 1;">
                            <span id="drawing-size-display" style="min-width: 35px; font-size: 12px;">3px</span>
                        </div>
                        <button class="Notepad-btn" onclick="clearDrawingCanvas(this)" style="padding: 4px 12px; height: 32px;">
                            <i class="ph ph-trash"></i> Clear
                        </button>
                    </div>
                </div>
                <div class="drawing-content">
                    <canvas id="drawing-canvas"></canvas>
                </div>
            </div>
        `,
  },

  photoviewer: {
    title: "Photo Viewer",
    width: "850px",
    height: "650px",
    type: "html",
    content: `
            <div class="photoviewer-container">
                <div class="photoviewer-toolbar">
                    <div class="photoviewer-title" id="photoviewer-title">No image loaded</div>
                    <div class="photoviewer-actions">
                        <button class="Notepad-btn" onclick="closePhotoViewer(this)">
                            <i class="ph ph-x"></i> Close
                        </button>
                    </div>
                </div>
                <div class="photoviewer-content">
                    <img id="photoviewer-image" style="max-width: 100%; max-height: 100%; object-fit: contain;">
                    <div id="photoviewer-placeholder" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted);">
                        <i class="ph ph-image" style="font-size: 64px; margin-bottom: 20px; opacity: 0.5;"></i>
                        <p>No image selected</p>
                    </div>
                </div>
            </div>
        `,
  },
  musicplayer: {
    title: "Music",
    width: "960px",
    height: "650px",
    type: "html",
    content: `
            <div class="music-app-container">
                <div class="music-header">
                    <div class="music-header-left">
                        <div class="music-controls-group">
                            <button class="music-btn-icon" onclick="prevMusic(this)"><i class="ph-fill ph-skip-back"></i></button>
                            <button class="music-btn-icon play-pause-btn" onclick="togglePlayMusic(this)"><i id="play-pause-icon" class="ph-fill ph-play"></i></button>
                            <button class="music-btn-icon" onclick="nextMusic(this)"><i class="ph-fill ph-skip-forward"></i></button>
                        </div>
                    </div>
                    
                    <div class="music-header-center">
                        <div class="now-playing-card">
                            <div class="now-playing-art">
                                <img id="music-art-img" src="" style="display: none;">
                                <div id="music-art-placeholder" class="music-art-placeholder">
                                    <i class="ph-fill ph-music-note"></i>
                                </div>
                            </div>
                            <div class="now-playing-details">
                                <div class="now-playing-metadata" style="cursor: pointer;">
                                    <div id="music-title" class="music-track-title">Not Playing</div>
                                    <div id="music-artist" class="music-track-artist">Select music to start</div>
                                </div>
                                <div class="music-timeline">
                                    <span id="music-current-time" class="time-label">0:00</span>
                                    <div class="music-progress-wrapper" onclick="seekMusic(event, this)">
                                        <div id="music-progress" class="music-progress-fill"></div>
                                    </div>
                                    <span id="music-duration" class="time-label">0:00</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="music-header-right">
                        <div class="music-volume-group">
                            <i class="ph ph-speaker-low"></i>
                            <input type="range" class="music-volume-slider" min="0" max="1" step="0.01" value="0.7" oninput="setMusicVolume(this)">
                            <i class="ph ph-speaker-high"></i>
                        </div>
                        <div class="music-secondary-controls">
                           <button class="music-btn-icon small" title="Shuffle" onclick="toggleMusicShuffle(this)"><i id="shuffle-icon" class="ph ph-shuffle"></i></button>
                           <button class="music-btn-icon small" title="Queue" onclick="toggleMusicPanel('queue', this)"><i class="ph ph-list-numbers"></i></button>
                           <button class="music-btn-icon small" title="Lyrics" onclick="toggleMusicPanel('lyrics', this)"><i class="ph ph-list"></i></button>
                        </div>
                    </div>
                </div>

                <div class="music-body">
                    <div class="music-sidebar">
                        <div class="sidebar-section">
                           <div class="sidebar-title">Robbie Music</div>
                           <div class="sidebar-item active" onclick="switchMusicView('listen-now', this)"><i class="ph ph-play-circle"></i> Listen Now</div>
                           <div class="sidebar-item" onclick="switchMusicView('browse', this)"><i class="ph ph-grid-four"></i> Browse</div>
                        </div>
                        <div class="sidebar-section">
                           <div class="sidebar-title" style="display:flex; justify-content:space-between; align-items:center;">Library <i class="ph ph-arrows-clockwise" style="cursor:pointer; font-size:14px;" onclick="forceRefreshMusicLibrary(this)" title="Refresh Library"></i></div>
                           <div class="sidebar-item" onclick="switchMusicView('library-songs', this)"><i class="ph ph-music-notes"></i> Songs</div>
                           <div class="sidebar-item" onclick="switchMusicView('library-albums', this)"><i class="ph ph-record"></i> Albums</div>
                           <div class="sidebar-item" onclick="switchMusicView('library-artists', this)"><i class="ph ph-microphone-stage"></i> Artists</div>
                        </div>
                        <div class="sidebar-section" id="music-playlists-section">
                           <div class="sidebar-title">Playlists <i class="ph ph-plus-circle create-playlist-btn" onclick="createMusicPlaylist(this)"></i></div>
                           <div id="sidebar-playlists-list" class="sidebar-playlists-list">
                               <!-- Playlists injected here -->
                           </div>
                        </div>
                    </div>
                    
                    <div class="music-content" id="music-main-content">
                        <div class="view-loading">
                            <i class="ph ph-spinner ph-spin"></i>
                        </div>
                    </div>

                    <div class="music-right-panel" id="music-right-panel">
                        <div class="lyrics-bg"><img id="lyrics-bg-img" class="lyrics-bg-img"></div>
                        <div class="panel-header" style="z-index: 2;">
                            <span id="panel-title">Queue</span>
                            <button class="music-btn-icon small" onclick="toggleMusicPanel(null, this)"><i class="ph ph-x"></i></button>
                        </div>
                        <div id="panel-content" class="panel-content" style="z-index: 2;">
                            <!-- Queue or Lyrics injected here -->
                        </div>
                    </div>
                </div>
                
                <input type="file" class="music-import-input" accept="audio/*" multiple style="display: none;" onchange="handleMusicImport(event, this)">
                <audio id="main-audio-element" style="display: none;"></audio>
            </div>
        `,
  },
};

// --- Background Manager ---
function setBackground(type, customUrl) {
  const liveCanvas = document.getElementById("live-bg");
  const liveVideo = document.getElementById("live-bg-video");
  const body = document.body;
  const root = document.documentElement;

  // Reset
  liveCanvas.style.display = "none";
  liveVideo.style.display = "none";
  liveVideo.pause();
  body.style.background = "";
  stopLiveBg();

  if (type === "default") {
    body.style.background =
      "url('backgrounds/default.png') center/cover no-repeat";
    root.style.setProperty("--accent", "#89b4fa");
    root.style.setProperty("--accent-secondary", "#f5c2e7");
    root.style.setProperty("--tint", "rgba(137, 180, 250, 0.1)"); // Blue Tint
  } else if (type === "spirited") {
    body.style.background =
      "url('backgrounds/Spirted Away Station.png') center/cover no-repeat";
    root.style.setProperty("--accent", "#ff8e8e"); // Warm Pinkish
    root.style.setProperty("--accent-secondary", "#ffb88c"); // Orangish
    root.style.setProperty("--tint", "rgba(255, 142, 142, 0.15)"); // Warm Tint
  } else if (type === "ocean") {
    body.style.background = "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)";
    root.style.setProperty("--accent", "#4facfe");
    root.style.setProperty("--accent-secondary", "#00f2fe");
    root.style.setProperty("--tint", "rgba(79, 172, 254, 0.1)"); // Cyan Tint
  } else if (type === "live") {
    liveVideo.style.display = "block";
    liveVideo.play();
    root.style.setProperty("--accent", "#44cf6c"); // Dark Greenish
    root.style.setProperty("--accent-secondary", "#32936f");
    root.style.setProperty("--tint", "rgba(68, 207, 108, 0.12)"); // Green Tint
  } else if (type === "custom" && customUrl) {
    body.style.background = `url("${customUrl}") center/cover no-repeat`;
    // Use default accents for custom backgrounds for now
    root.style.setProperty("--accent", "#89b4fa");
    root.style.setProperty("--accent-secondary", "#f5c2e7");
    root.style.setProperty("--tint", "rgba(255, 255, 255, 0.05)");
  }

  // Persist choice
  localStorage.setItem(
    "robbieos_background",
    JSON.stringify({ type, url: customUrl || null }),
  );
}

// --- Live Background Logic (Starfield/Nebula) ---
let liveBgInterval = null;
function startLiveBg() {
  const canvas = document.getElementById("live-bg");
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const stars = [];
  for (let i = 0; i < 200; i++) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 1.5,
      speed: Math.random() * 0.5 + 0.1,
    });
  }

  function animate() {
    ctx.fillStyle = "rgba(10, 10, 20, 0.2)"; // Fading trail effect
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#89b4fa";
    stars.forEach((s) => {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();

      s.y += s.speed;
      if (s.y > canvas.height) s.y = 0;
    });
    liveBgInterval = requestAnimationFrame(animate);
  }
  animate();
}

function stopLiveBg() {
  if (liveBgInterval) cancelAnimationFrame(liveBgInterval);
}

// Global exposure for onclick
window.setBackground = setBackground;
window.toggleEraser = function (btn) {
  const win = btn.closest(".os-window");
  if (win && win.toggleEraser) win.toggleEraser();
};

// --- Browser Logic ---
let currentBlobUrl = null;

// --- Simplified Browser Logic ---
function toggleBrowserProxy(btn) {
  const win = btn.closest(".os-window");
  const icon = btn.querySelector("i");

  if (!win.dataset.forceProxy || win.dataset.forceProxy === "false") {
    win.dataset.forceProxy = "true";
    icon.className = "ph ph-shield-warning";
    icon.style.color = "var(--danger)";
    osToast("Proxy Mode Enabled. Bypassing security.", "ph-shield-warning");
  } else {
    win.dataset.forceProxy = "false";
    icon.className = "ph ph-shield-check";
    icon.style.color = "#34a853";
    osToast("Proxy Mode Disabled. Fast native browsing.", "ph-shield-check");
  }

  const input = win.querySelector(".browser-address-bar input");
  if (input.value.trim()) navigateBrowser(input, false);
}

async function navigateBrowser(input, addToHistory = true) {
  let url = input.value.trim();
  if (!url) return;

  const win = input.closest(".os-window");
  const contentDiv = win.querySelector("#browser-content");

  // Handle empty or search queries
  if (!url.includes(".") || url.includes(" ")) {
    url = `https://www.google.com/search?q=${encodeURIComponent(url)}&igu=1`;
  } else {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }
    if (url.includes("google.com")) {
      const separator = url.includes("?") ? "&" : "?";
      if (!url.includes("igu=1")) url += separator + "igu=1";
    }
  }

  input.value = url;

  const proxyTooltip = win.querySelector(".glass-proxy-tooltip");
  if (proxyTooltip) {
    if (win.dataset.forceProxy !== "true") {
      proxyTooltip.style.display = "block";
    } else {
      proxyTooltip.style.display = "none";
    }
  }

  // Manage History
  if (!win.browserHistory) win.browserHistory = [];
  if (typeof win.browserHistoryIndex === "undefined")
    win.browserHistoryIndex = -1;

  if (addToHistory) {
    win.browserHistory = win.browserHistory.slice(
      0,
      win.browserHistoryIndex + 1,
    );
    win.browserHistory.push(url);
    win.browserHistoryIndex++;
  }

  const loadProxiedSite = async (targetUrl) => {
    try {
      contentDiv.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #5f6368; background: #fff;">
                    <div class="browser-spinner" style="width: 40px; height: 40px; border: 3px solid rgba(0,0,0,0.1); border-top-color: var(--accent); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 15px;"></div>
                    <p style="font-size: 14px; color: #5f6368;">Bypassing X-Frame-Options via Proxy (may be slower)...</p>
                </div>
                <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
            `;

      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
      const response = await fetch(proxyUrl);
      const data = await response.json();

      if (data.contents) {
        if (data.status && data.status.http_code >= 400) {
          throw new Error("HTTP Error " + data.status.http_code);
        }

        const injectedScript = `
                <script>
                    document.addEventListener('click', function(e) {
                        const link = e.target.closest('a');
                        if (link && link.href && !link.href.startsWith('javascript:')) {
                            e.preventDefault();
                            window.parent.postMessage({ type: 'browser-navigate', url: link.href }, '*');
                        }
                    });
                    window.addEventListener('submit', function(e) {
                        e.preventDefault();
                        window.parent.postMessage({ type: 'browser-navigate', url: e.target.action || window.location.href }, '*');
                    });
                </script>
                `;

        let html = data.contents;
        const baseTag = `<base href="${targetUrl}">`;
        if (html.toLowerCase().includes("<head>")) {
          html = html.replace(
            /<head>/i,
            `<head>\n${baseTag}\n${injectedScript}`,
          );
        } else {
          html = `${baseTag}\n${injectedScript}\n` + html;
        }

        contentDiv.innerHTML = `<iframe style="width:100%; height:100%; border:none; background:white; position:absolute; top:0; left:0; z-index:2;" sandbox="allow-scripts allow-forms allow-same-origin allow-popups"></iframe>`;
        const iframe = contentDiv.querySelector("iframe");
        iframe.srcdoc = html;
      } else {
        throw new Error("No contents retrieved.");
      }
    } catch (err) {
      contentDiv.innerHTML = `
                <div class="browser-error-overlay" style="position:absolute; top:0; left:0; width:100%; height:100%; background:#fff; z-index:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:40px; text-align:center; font-family:'Inter', sans-serif;">
                    <i class="ph ph-shield-warning" style="font-size: 64px; color: var(--danger); margin-bottom: 20px;"></i>
                    <h2 style="color: #202124; margin-bottom: 15px;">Connection Refused</h2>
                    <p style="color: #5f6368; max-width: 500px; line-height: 1.6; margin-bottom: 25px;">
                        This website (${targetUrl}) actively refuses to connect or cannot be loaded securely. Modern web security measures like <b>X-Frame-Options</b> or stringent CORS policies are actively blocking access.
                    </p>
                    <a href="${targetUrl}" target="_blank" style="background: var(--accent); color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; transition: opacity 0.2s; position: relative; z-index:99;">
                        Open Website in New Tab <i class="ph ph-arrow-square-out"></i>
                    </a>
                </div>
            `;
    }
  };

  // If proxy mode is forcefully enabled by user, strictly use proxy.
  if (win.dataset.forceProxy === "true") {
    return loadProxiedSite(url);
  }

  // Otherwise, fast Native loading immediately (Non-blocking)
  contentDiv.innerHTML = `<iframe src="${url}" style="width:100%; height:100%; border:none; background:white; position:absolute; top:0; left:0; z-index:2;" sandbox="allow-scripts allow-forms allow-same-origin allow-popups"></iframe>`;

  const fallbackOverlay = document.createElement("div");
  fallbackOverlay.innerHTML = `
        <div class="browser-error-overlay" style="position:absolute; top:0; left:0; width:100%; height:100%; background:#fff; z-index:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:40px; text-align:center; font-family:'Inter', sans-serif;">
            <i class="ph ph-shield-warning" style="font-size: 64px; color: var(--danger); margin-bottom: 20px;"></i>
            <h2 style="color: #202124; margin-bottom: 15px;">Secure Embedding Blocked</h2>
            <p style="color: #5f6368; max-width: 500px; line-height: 1.6; margin-bottom: 25px;">
                This website (${url}) actively refuses to connect directly. Chrome has aggressively blocked the iframe.
            </p>
            <div style="display: flex; gap: 10px;">
                <button onclick="toggleBrowserProxy(this)" style="background: transparent; color: var(--danger); border: 1px solid var(--danger); padding: 12px 24px; border-radius: 8px; cursor: pointer; font-family: 'Inter', sans-serif; font-weight: 600;">
                    <i class="ph ph-shield-warning"></i> Force Proxy Bypass
                </button>
                <a href="${url}" target="_blank" style="background: var(--accent); color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-family: 'Inter', sans-serif; display: flex; align-items: center; gap: 6px;">
                    Open in Tab <i class="ph ph-arrow-square-out"></i>
                </a>
            </div>
            <p style="margin-top: 20px; font-size: 12px; color: var(--text-muted);">
                You can also click the Shield icon in the top toolbar to active Proxy Mode.
            </p>
        </div>
    `;
  contentDiv.appendChild(fallbackOverlay.firstElementChild);

  // Run async background check for security headers to auto-swap
  if (!url.includes("google.com") && !url.includes("igu=1")) {
    const navId = Date.now();
    win.dataset.currentNav = navId;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      // Fast HEAD check through corsproxy.org
      const res = await fetch(
        `https://corsproxy.org/?${encodeURIComponent(url)}`,
        { method: "HEAD", signal: controller.signal },
      );
      clearTimeout(timeoutId);

      if (win.dataset.currentNav == navId) {
        const xfo = res.headers.get("x-frame-options");
        const csp = res.headers.get("content-security-policy");

        if (
          (xfo &&
            (xfo.toLowerCase().includes("deny") ||
              xfo.toLowerCase().includes("sameorigin"))) ||
          (csp && csp.toLowerCase().includes("frame-ancestors"))
        ) {
          // Auto-detected block, swap smoothly to proxy!
          loadProxiedSite(url);
        }
      }
    } catch (e) {
      // Check timed out or failed. We leave the native iframe + fallback overlay up.
      // If the iframe fails, the user will see the chrome block and the shield button overlay.
      console.warn("Auto background header check failed for:", url);
    }
  }
}
function browserGoBack(btn) {
  const win = btn.closest(".os-window");
  if (win.browserHistory && win.browserHistoryIndex > 0) {
    win.browserHistoryIndex--;
    const url = win.browserHistory[win.browserHistoryIndex];
    const input = win.querySelector(".browser-address-bar input");
    input.value = url;
    navigateBrowser(input, false);
  } else {
    osToast("No previous history in this session.", "ph-info");
  }
}

function browserReload(btn) {
  const iframe = btn.closest(".os-window").querySelector("iframe");
  const input = btn
    .closest(".os-window")
    .querySelector(".browser-address-bar input");
  if (iframe) {
    if (input && input.value) {
      navigateBrowser(input);
    } else {
      try {
        iframe.contentWindow.location.reload();
      } catch (e) {
        // If CORS prevents reload, just re-navigate to the current URL in input
        if (input) navigateBrowser(input);
      }
    }
  }
}

// --- File Explorer Logic ---
let currentExplorerPath = "/";

function truncateFileName(name, limit = 13) {
  if (name.length <= limit) return name;
  const extIndex = name.lastIndexOf(".");
  let ext = "";
  let base = name;

  if (extIndex !== -1 && extIndex !== 0) {
    ext = name.substring(extIndex);
    base = name.substring(0, extIndex);
  }

  const endLimit = 4;
  const lastPart = base.length > endLimit ? base.slice(-endLimit) : "";
  const prefixLength = Math.max(3, limit - 3 - endLimit - ext.length);
  const firstPart =
    base.length > endLimit ? base.substring(0, prefixLength) : base;

  if (firstPart.length + lastPart.length < base.length) {
    return `${firstPart}...${lastPart}${ext}`;
  }
  return name;
}

function showNodeProperties(path) {
  const node = getVFSNode(path);
  if (!node) return;

  // Escape user-provided data
  const escapeHTML = (str) =>
    str.replace(
      /[&<>'"]/g,
      (tag) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[tag] || tag,
    );

  const rawName = path.split("/").pop() || "Root";
  const name = escapeHTML(rawName);
  const safePath = escapeHTML(path);

  let typeStr = node.type === "dir" ? "File Folder" : "File";
  if (node.type === "file") {
    const extIndex = rawName.lastIndexOf(".");
    if (extIndex !== -1 && extIndex !== 0) {
      typeStr = rawName.substring(extIndex + 1).toUpperCase() + " File";
    }
  }

  function getFolderSizeSync(n) {
    let size = 0;
    if (n.type === "file") {
      return n.content ? n.content.length * 2 : 0; // Simple size approx
    }
    for (const key in n.children) {
      size += getFolderSizeSync(n.children[key]);
    }
    return size;
  }

  const totalSize = getFolderSizeSync(node);
  let sizeStr = "";
  if (totalSize < 1024) sizeStr = totalSize + " Bytes";
  else if (totalSize < 1024 * 1024)
    sizeStr = (totalSize / 1024).toFixed(2) + " KB";
  else sizeStr = (totalSize / (1024 * 1024)).toFixed(2) + " MB";

  let details = `<div style="display:grid; grid-template-columns: 80px 1fr; gap: 10px; font-size: 13px; text-align: left; padding: 10px 0;">`;
  details += `<span style="opacity:0.6;">Name:</span> <b>${name}</b>`;
  details += `<span style="opacity:0.6;">Type:</span> <span>${typeStr}</span>`;
  details += `<span style="opacity:0.6;">Location:</span> <span style="word-break: break-all;">${safePath}</span>`;
  details += `<span style="opacity:0.6;">Size:</span> <span>${sizeStr} (${totalSize.toLocaleString()} bytes)</span>`;

  if (
    node.type === "file" &&
    node.content &&
    node.content.startsWith("data:image")
  ) {
    details += `<span style="opacity:0.6;">Format:</span> <span>Encoded Image</span>`;
  } else if (node.type === "dir") {
    const count = Object.keys(node.children || {}).length;
    details += `<span style="opacity:0.6;">Contains:</span> <span>${count} items</span>`;
  }
  details += `</div>`;

  showOSModal({
    title: "Properties",
    message: details,
    isHTML: true,
    buttonText: "Close",
  });
}

function getVFSNode(path) {
  if (!path || path === "/" || path === "") return vfs;
  let parts = path.split("/").filter((p) => p);
  let node = vfs;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (node.children && node.children[part]) {
      node = node.children[part];
    } else {
      return null;
    }
  }
  return node;
}

function isImageFile(filename) {
  const lowerName = filename.toLowerCase();
  return (
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".gif") ||
    lowerName.endsWith(".webp")
  );
}

function moveVFSNode(sourcePath, targetPath) {
  if (sourcePath === targetPath) return;

  if (targetPath.startsWith(sourcePath + "/")) {
    osAlert("Cannot move a folder into its own subfolder.", "Error");
    return;
  }
  const sourceNode = getVFSNode(sourcePath);
  const targetParent = getVFSNode(targetPath);

  if (sourceNode && targetParent && targetParent.type === "dir") {
    const name = sourcePath.split("/").pop();
    if (targetParent.children[name]) {
      osAlert(
        `A file or folder named "${name}" already exists in the destination.`,
        "Error",
      );
      return;
    }

    // Remove from old location
    const sourceParts = sourcePath.split("/").filter((p) => p);
    const sourceName = sourceParts.pop();
    const sourceParentPath = "/" + sourceParts.join("/");

    // Prevent moving to the exact same directory (avoids deletion bug)
    if (
      targetPath === sourceParentPath ||
      targetPath === sourceParentPath + "/"
    )
      return;

    const sourceParent = getVFSNode(sourceParentPath);

    targetParent.children[sourceName] = sourceNode;
    delete sourceParent.children[sourceName];

    saveVFS();
    document.querySelectorAll('.os-window[data-app="files"]').forEach((w) => {
      renderExplorer(w, w.dataset.currentPath || "/");
    });
    osToast(`Moved ${sourceName} successfully`, "ph-check");
  }
}

function updateSidebar(win, path) {
  const sidebar = win.querySelector("#explorer-sidebar");
  if (!sidebar) return;

  sidebar.innerHTML = "";
  const fragment = document.createDocumentFragment();

  // Always add Home
  const home = document.createElement("div");
  home.className = `sidebar-item ${path === "/" ? "active" : ""}`;
  home.innerHTML = '<i class="ph ph-house"></i><span>Home</span>';
  home.onclick = () => renderExplorer(win, "/");

  // Drag and Drop to Home
  home.ondragover = (e) => {
    e.preventDefault();
    home.classList.add("drag-over");
  };
  home.ondragleave = (e) => {
    if (!home.contains(e.relatedTarget)) {
      home.classList.remove("drag-over");
    }
  };
  home.ondrop = (e) => {
    e.preventDefault();
    home.classList.remove("drag-over");

    // Check if dropping files from outside
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileUpload(win, files, "/");
    } else {
      // Handle internal VFS move
      const textData = e.dataTransfer.getData("text/plain");
      if (textData && textData.startsWith("vfs_multi:")) {
        try {
          const pathsToMove = JSON.parse(textData.substring(10));
          pathsToMove.forEach((p) => moveVFSNode(p, "/"));
        } catch (err) {}
      } else if (textData) {
        moveVFSNode(textData, "/");
      }
    }
  };

  fragment.appendChild(home);

  // Sidebar Icons Map
  const iconMap = {
    projects: "ph-briefcase",
    skills: "ph-lightning",
    experience: "ph-medal",
    documents: "ph-file-doc",
    downloads: "ph-download-simple",
    music: "ph-music-notes",
    pictures: "ph-image",
    videos: "ph-video-camera",
  };

  // Add folders from root
  for (let name in vfs.children) {
    const item = vfs.children[name];
    if (item.type === "dir") {
      const fullPath = "/" + name;
      const div = document.createElement("div");
      div.className = `sidebar-item ${path.startsWith(fullPath) ? "active" : ""}`;

      // Use item's custom icon, or fallback to map (defined globally at top), then default
      let icon = item.icon || iconMap[name.toLowerCase()] || "ph-folder";

      // Create elements directly for speed
      const i = document.createElement("i");
      i.className = `ph ${icon}`;
      const span = document.createElement("span");
      span.textContent = name;
      div.appendChild(i);
      div.appendChild(span);

      div.onclick = () => renderExplorer(win, fullPath);

      // Drag and Drop to Sidebar
      div.ondragover = (e) => {
        e.preventDefault();
        div.classList.add("drag-over");
      };
      div.ondragleave = (e) => {
        if (!div.contains(e.relatedTarget)) {
          div.classList.remove("drag-over");
        }
      };
      div.ondrop = (e) => {
        e.preventDefault();
        div.classList.remove("drag-over");

        // Check if dropping files from outside
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          handleFileUpload(win, files, fullPath);
        } else {
          // Handle internal VFS move
          const textData = e.dataTransfer.getData("text/plain");
          if (textData && textData.startsWith("vfs_multi:")) {
            try {
              const pathsToMove = JSON.parse(textData.substring(10));
              pathsToMove.forEach((p) => moveVFSNode(p, fullPath));
            } catch (err) {}
          } else if (textData) {
            moveVFSNode(textData, fullPath);
          }
        }
      };

      fragment.appendChild(div);
    }
  }
  sidebar.appendChild(fragment);
}

function renderExplorer(win, path) {
  if (!win) return;
  const grid = win.querySelector("#explorer-grid");
  const pathBar = win.querySelector("#explorer-path");
  if (!grid || !pathBar) return;

  // Normalize path
  if (!path.startsWith("/")) path = "/" + path;
  const node = getVFSNode(path);
  if (!node || node.type !== "dir") {
    osAlert("Directory not found", "Error");
    pathBar.value = win.dataset.currentPath || "/";
    return;
  }

  win.dataset.currentPath = path;
  pathBar.value = path;
  // Track last clicked for Shift-selection
  let lastIndex = -1;
  const fileItems = [];

  grid.innerHTML = "";
  const fragment = document.createDocumentFragment();
  updateSidebar(win, path);

  const childrenKeys = Object.keys(node.children);

  childrenKeys.forEach((name, index) => {
    const item = node.children[name];
    const fullPath = path === "/" ? `/${name}` : `${path}/${name}`;

    const div = document.createElement("div");
    div.className = "file-item";
    div.draggable = true;
    div.dataset.path = fullPath;
    div.dataset.index = index;
    fileItems.push(div);

    let icon = "ph-file";
    if (item.type === "dir") icon = item.icon || "ph-folder";
    else if (name.toLowerCase().endsWith(".txt")) icon = "ph-file-text";
    else if (name.toLowerCase().endsWith(".drw")) icon = "ph-paint-brush";
    else if (isImageFile(name)) icon = "ph-image";
    else if (isMusicFile(name)) icon = "ph-music-notes";

    const i = document.createElement("i");
    i.className = `ph ${icon}`;

    const span = document.createElement("span");
    span.title = name;
    span.textContent = truncateFileName(name);

    if (win.selectedNodes && win.selectedNodes.has(fullPath)) {
      div.classList.add("selected");
    }

    div.appendChild(i);
    div.appendChild(span);
    fragment.appendChild(div);
  });

  grid.appendChild(fragment);

  // Use event delegation for interactions (Click, Double Click, Context Menu)
  if (!grid.dataset.gridListenersInit) {
    grid.dataset.gridListenersInit = "true";

    grid.onclick = (e) => {
      const itemDiv = e.target.closest(".file-item");
      if (!itemDiv) return;
      e.stopPropagation();
      hideContextMenu();

      const itemPath = itemDiv.dataset.path;
      const index = parseInt(itemDiv.dataset.index);

      if (!win.selectedNodes) win.selectedNodes = new Set();

      if (e.shiftKey && lastIndex !== -1) {
        const start = Math.min(lastIndex, index);
        const end = Math.max(lastIndex, index);
        for (let i = start; i <= end; i++) {
          win.selectedNodes.add(fileItems[i].dataset.path);
        }
      } else if (e.ctrlKey || e.metaKey) {
        if (win.selectedNodes.has(itemPath)) win.selectedNodes.delete(itemPath);
        else win.selectedNodes.add(itemPath);
        lastIndex = index;
      } else {
        win.selectedNodes.clear();
        win.selectedNodes.add(itemPath);
        lastIndex = index;
      }

      // Visual update
      grid.querySelectorAll(".file-item").forEach((el) => {
        el.classList.toggle("selected", win.selectedNodes.has(el.dataset.path));
      });
    };

    grid.ondblclick = (e) => {
      const itemDiv = e.target.closest(".file-item");
      if (!itemDiv) return;
      const itemPath = itemDiv.dataset.path;
      const itemNode = getVFSNode(itemPath);
      const name = itemPath.split("/").pop();

      if (itemNode.type === "dir") {
        renderExplorer(win, itemPath);
      } else if (name.toLowerCase().endsWith(".drw")) {
        openDrawingFile(itemPath);
      } else if (isImageFile(name)) {
        openPhotoInViewer(itemPath);
      } else if (name.toLowerCase().endsWith(".txt")) {
        openFileInNotepad(itemPath);
      } else if (isMusicFile(name)) {
        openMusicFile(itemPath);
      }
    };

    grid.oncontextmenu = (e) => {
      const itemDiv = e.target.closest(".file-item");
      if (!itemDiv) return;
      e.preventDefault();
      e.stopPropagation();

      const itemPath = itemDiv.dataset.path;
      if (!win.selectedNodes.has(itemPath)) {
        win.selectedNodes.clear();
        win.selectedNodes.add(itemPath);
        // Visual update
        grid.querySelectorAll(".file-item").forEach((el) => {
          el.classList.toggle(
            "selected",
            win.selectedNodes.has(el.dataset.path),
          );
        });
      }

      showContextMenu(e, "file", itemPath);
    };

    grid.addEventListener("dragstart", (e) => {
      const itemDiv = e.target.closest(".file-item");
      if (!itemDiv) return;
      const itemPath = itemDiv.dataset.path;

      if (!win.selectedNodes.has(itemPath)) {
        win.selectedNodes.clear();
        win.selectedNodes.add(itemPath);
        grid.querySelectorAll(".file-item").forEach((el) => {
          el.classList.toggle(
            "selected",
            win.selectedNodes.has(el.dataset.path),
          );
        });
      }

      const selectedArray = Array.from(win.selectedNodes);
      e.dataTransfer.setData(
        "text/plain",
        "vfs_multi:" + JSON.stringify(selectedArray),
      );
      itemDiv.classList.add("dragging");
    });

    grid.addEventListener("dragend", (e) => {
      const itemDiv = e.target.closest(".file-item");
      if (itemDiv) itemDiv.classList.remove("dragging");
    });
  }

  grid.appendChild(fragment);

  grid.ondragover = (e) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) grid.classList.add("drag-over");
  };

  grid.ondragleave = (e) => {
    if (!grid.contains(e.relatedTarget)) grid.classList.remove("drag-over");
  };

  grid.ondrop = (e) => {
    e.preventDefault();
    grid.classList.remove("drag-over");

    const externalFiles = e.dataTransfer.files;
    if (externalFiles && externalFiles.length > 0) {
      handleFileUpload(win, externalFiles, win.dataset.currentPath || "/");
    } else {
      const textData = e.dataTransfer.getData("text/plain");
      if (textData && textData.startsWith("vfs_multi:")) {
        try {
          const pathsToMove = JSON.parse(textData.substring(10));
          pathsToMove.forEach((p) =>
            moveVFSNode(p, win.dataset.currentPath || "/"),
          );
        } catch (err) {}
      } else if (textData) {
        moveVFSNode(textData, win.dataset.currentPath || "/");
      }
    }
  };
}

function explorerGoBackBtn(btn) {
  const win = btn.closest(".os-window");
  const currentPath = win.dataset.currentPath || "/";
  if (currentPath === "/") return;
  let parts = currentPath.split("/").filter((p) => p);
  parts.pop();
  renderExplorer(win, "/" + parts.join("/"));
}

function handleFileUpload(win, files, targetPath) {
  const parent = getVFSNode(targetPath);
  if (!parent || parent.type !== "dir") {
    osAlert("Cannot upload files to this location.", "Error");
    return;
  }

  let uploadedCount = 0;
  let skippedCount = 0;
  const fileArray = Array.from(files);

  fileArray.forEach((file, index) => {
    const fileName = file.name.toLowerCase();
    const isTxt = fileName.endsWith(".txt");
    const isImage = isImageFile(fileName);
    const isMusic = isMusicFile(fileName);

    if (!isTxt && !isImage && !isMusic) {
      skippedCount++;
      if (uploadedCount + skippedCount === fileArray.length) {
        finishUpload();
      }
      return;
    }

    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > 100) {
      skippedCount++;
      osAlert(`File "${file.name}" is too large. Max 100MB.`, "Error");
      if (uploadedCount + skippedCount === fileArray.length) finishUpload();
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      let finalFileName = file.name;
      const extIndex = finalFileName.lastIndexOf(".");
      const ext = extIndex !== -1 ? finalFileName.substring(extIndex) : "";
      const baseName =
        extIndex !== -1 ? finalFileName.substring(0, extIndex) : finalFileName;

      if (parent.children[finalFileName]) {
        let counter = 1;
        while (parent.children[`${baseName} (${counter})${ext}`]) {
          counter++;
        }
        finalFileName = `${baseName} (${counter})${ext}`;
      }

      parent.children[finalFileName] = {
        type: "file",
        content: content,
        size: file.size,
      };

      uploadedCount++;
      if (uploadedCount + skippedCount === fileArray.length) finishUpload();
    };

    reader.onerror = () => {
      skippedCount++;
      if (uploadedCount + skippedCount === fileArray.length) finishUpload();
    };

    if (isTxt) reader.readAsText(file);
    else reader.readAsDataURL(file);
  });

  function finishUpload() {
    saveVFS(true);
    renderExplorer(win, targetPath);
    if (uploadedCount > 0) {
      osToast(`Uploaded ${uploadedCount} file(s)`, "ph-check-circle");
    }
    if (skippedCount > 0) {
      osToast(`Skipped ${skippedCount} file(s)`, "ph-warning");
    }
  }
}

function openMusicFile(path) {
  const node = getVFSNode(path);
  if (!node || node.type !== "file") return;

  const fileName = path.split("/").pop();
  if (!isMusicFile(fileName)) {
    osAlert("File type not supported by Music Player.", "Error");
    return;
  }

  // Find if music player is already open
  let musicWin = Array.from(
    document.querySelectorAll('.os-window[data-app="musicplayer"]'),
  ).pop();

  if (!musicWin) {
    openApp("musicplayer");
    setTimeout(() => {
      const newWin = Array.from(
        document.querySelectorAll('.os-window[data-app="musicplayer"]'),
      ).pop();
      if (newWin) playTrackInWin(newWin, path);
    }, 150);
  } else {
    setActiveWindow(musicWin);
    playTrackInWin(musicWin, path);
  }

  function playTrackInWin(win, trackPath) {
    if (win.refreshPlaylist) win.refreshPlaylist();
    // Find track index in the newly refreshed tracks
    setTimeout(() => {
      const index = win.tracks.findIndex((t) => t.path === trackPath);
      if (index !== -1) {
        // Find the playlist item and click it, or call the internal playTrack if we can expose it
        // For now, let's just trigger it via the playlist UI if possible or add a helper
        const items = win.querySelectorAll(".playlist-item");
        if (items[index]) items[index].click();
      } else {
        // If not found in /music or / (maybe it's elsewhere), force play it
        const node = getVFSNode(trackPath);
        if (node) {
          const audio = win.querySelector("#main-audio-element");
          const titleEl = win.querySelector("#music-title");
          if (audio && titleEl) {
            titleEl.textContent = trackPath.split("/").pop();
            audio.src = node.content;
            audio.play();
            const icon = win.querySelector("#play-pause-icon");
            if (icon) icon.className = "ph-fill ph-pause";
          }
        }
      }
    }, 100);
  }
}

// --- File Picker Dialog Logic ---
let filePickerCurrentPath = "/";
let filePickerSelectedPath = null;
let filePickerCallback = null;

function openFilePickerDialog(btn) {
  const overlay = document.getElementById("file-picker-overlay");
  if (!overlay) return;

  filePickerCurrentPath = "/";
  filePickerSelectedPath = null;
  filePickerCallback = (selectedPath) => {
    const win = btn.closest(".os-window");
    if (win) {
      // Handle Notepad path
      const NotepadPathInput = win.querySelector("#Notepad-path");
      const NotepadPathDisplay = win.querySelector("#Notepad-path-display");
      if (NotepadPathInput) NotepadPathInput.value = selectedPath;
      if (NotepadPathDisplay) NotepadPathDisplay.textContent = selectedPath;

      // Handle drawing path
      const drawingPathInput = win.querySelector("#drawing-path");
      const drawingPathDisplay = win.querySelector("#drawing-path-display");
      if (drawingPathInput) drawingPathInput.value = selectedPath;
      if (drawingPathDisplay) drawingPathDisplay.textContent = selectedPath;
    }
  };

  renderFilePicker(filePickerCurrentPath);
  overlay.classList.add("active");
}

function closeFilePickerDialog() {
  const overlay = document.getElementById("file-picker-overlay");
  if (overlay) {
    overlay.classList.remove("active");
  }
  filePickerSelectedPath = null;
  filePickerCallback = null;
}

function renderFilePicker(path) {
  const grid = document.getElementById("file-picker-grid");
  const sidebar = document.getElementById("file-picker-sidebar");
  const pathBar = document.getElementById("file-picker-path");

  if (!grid || !sidebar || !pathBar) return;

  // Normalize path
  if (!path.startsWith("/")) path = "/" + path;
  const node = getVFSNode(path);
  if (!node || node.type !== "dir") {
    path = "/";
    filePickerCurrentPath = "/";
  }

  filePickerCurrentPath = path;
  pathBar.value = path;
  grid.innerHTML = "";
  sidebar.innerHTML = "";

  // Add Home to sidebar
  const home = document.createElement("div");
  home.className = `file-picker-sidebar-item ${path === "/" ? "active" : ""}`;
  home.innerHTML = '<i class="ph ph-house"></i><span>Home</span>';
  home.onclick = () => renderFilePicker("/");
  sidebar.appendChild(home);

  // Add root folders to sidebar
  for (let name in vfs.children) {
    const item = vfs.children[name];
    if (item.type === "dir") {
      const fullPath = "/" + name;
      const div = document.createElement("div");
      div.className = `file-picker-sidebar-item ${path.startsWith(fullPath) ? "active" : ""}`;

      let icon = item.icon || iconMap[name.toLowerCase()] || "ph-folder";
      div.innerHTML = `<i class="ph ${icon}"></i><span>${name}</span>`;
      div.onclick = () => renderFilePicker(fullPath);
      sidebar.appendChild(div);
    }
  }

  // Render folders in grid
  const currentNode = getVFSNode(path);
  if (currentNode && currentNode.children) {
    for (let name in currentNode.children) {
      const item = currentNode.children[name];
      if (item.type === "dir") {
        const fullPath = path === "/" ? `/${name}` : `${path}/${name}`;
        const div = document.createElement("div");
        div.className = "file-picker-folder-item";

        let clickTimeout;
        div.onclick = () => {
          clearTimeout(clickTimeout);
          clickTimeout = setTimeout(() => {
            // Single click - select folder
            document
              .querySelectorAll(".file-picker-folder-item")
              .forEach((el) => {
                el.classList.remove("selected");
              });
            div.classList.add("selected");
            filePickerSelectedPath = fullPath;
          }, 200);
        };

        div.ondblclick = (e) => {
          e.stopPropagation();
          clearTimeout(clickTimeout);
          // Double click - navigate into folder
          renderFilePicker(fullPath);
        };

        let icon = item.icon || iconMap[name.toLowerCase()] || "ph-folder";
        div.innerHTML = `<i class="ph ${icon}"></i><span>${name}</span>`;
        grid.appendChild(div);
      }
    }
  }

  // Allow selecting current folder
  const currentFolderDiv = document.createElement("div");
  currentFolderDiv.className = "file-picker-folder-item";
  currentFolderDiv.style.marginTop = "10px";
  currentFolderDiv.style.border = "2px dashed rgba(255,255,255,0.2)";
  currentFolderDiv.onclick = () => {
    document.querySelectorAll(".file-picker-folder-item").forEach((el) => {
      el.classList.remove("selected");
    });
    currentFolderDiv.classList.add("selected");
    filePickerSelectedPath = path;
  };
  currentFolderDiv.innerHTML = `<i class="ph ph-folder-dotted"></i><span>Current Folder</span>`;
  grid.insertBefore(currentFolderDiv, grid.firstChild);
}

function filePickerGoBack() {
  if (filePickerCurrentPath === "/") return;
  let parts = filePickerCurrentPath.split("/").filter((p) => p);
  parts.pop();
  renderFilePicker("/" + parts.join("/"));
}

// --- Functional Nav Helpers for Explorer ---
function explorerNavigateInput(input) {
  const win = input.closest(".os-window");
  renderExplorer(win, input.value);
}

// Close file picker when clicking on overlay (set up after DOM is ready)
setTimeout(() => {
  const overlay = document.getElementById("file-picker-overlay");
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        closeFilePickerDialog();
      }
    });
  }
}, 100);

// --- Text Notepad Logic ---
function openFileInNotepad(path, win = null) {
  const node = getVFSNode(path);
  if (!node || node.type !== "file") return;

  if (!path.toLowerCase().endsWith(".txt")) {
    osAlert("Only .txt files can be opened in Notepad.", "Unsupported File");
    return;
  }

  if (!win) {
    openApp("Notepad");
    setTimeout(() => {
      const newWin = Array.from(
        document.querySelectorAll('.os-window[data-app="Notepad"]'),
      ).pop();
      openFileInNotepad(path, newWin);
    }, 150);
    return;
  }

  const pathInput = win.querySelector("#Notepad-smart-path");
  const textarea = win.querySelector("#Notepad-textarea");
  if (pathInput) pathInput.value = path;
  if (textarea) textarea.value = node.content;
  setActiveWindow(win);
}

function saveNotepadFile(btn) {
  const win = btn.closest(".os-window");
  const filename = win.querySelector("#Notepad-filename").value.trim();
  const pathInput = win.querySelector("#Notepad-path");
  const saveDirPath = pathInput ? pathInput.value.trim() : "/";
  const content = win.querySelector("#Notepad-textarea").value;

  if (!filename) {
    osAlert("Please enter a filename", "Error");
    return;
  }

  if (!filename.toLowerCase().endsWith(".txt")) {
    osAlert("Please include .txt extension in your filename.", "Constraint");
    return;
  }

  // Normalize directory path
  let dirPath = saveDirPath;
  if (!dirPath.startsWith("/")) dirPath = "/" + dirPath;

  let parent = getVFSNode(dirPath);
  if (parent && parent.type === "dir") {
    parent.children[filename] = { type: "file", content: content };
    saveVFS();
    osToast(
      `Saved as ${dirPath === "/" ? "" : dirPath}/${filename}`,
      "ph-check-circle",
    );

    // Refresh explorer if it's viewing that folder
    if (document.getElementById("explorer-grid")) {
      renderExplorer(currentExplorerPath);
    }
  } else {
    osAlert(`The folder "${dirPath}" does not exist.`, "Error");
  }
}

// --- Drawing App Logic ---
function initDrawingCanvas(win) {
  const canvas = win.querySelector("#drawing-canvas");
  const colorPicker = win.querySelector("#drawing-color");
  const sizeSlider = win.querySelector("#drawing-size");
  const sizeDisplay = win.querySelector("#drawing-size-display");
  const eraserBtn = win.querySelector("#drawing-eraser");

  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const drawingContent = win.querySelector(".drawing-content");

  // Set canvas size
  canvas.width = drawingContent.offsetWidth;
  canvas.height = drawingContent.offsetHeight;

  // Set default canvas background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;
  let isEraser = false;

  win.toggleEraser = () => {
    isEraser = !isEraser;
    eraserBtn.classList.toggle("active", isEraser);
    osToast(
      isEraser ? "Eraser Mode" : "Brush Mode",
      isEraser ? "ph-eraser" : "ph-paint-brush",
    );
  };

  // Update size display
  sizeSlider.addEventListener("input", (e) => {
    sizeDisplay.textContent = e.target.value + "px";
  });

  // Drawing functions
  function startDrawing(e) {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;
  }

  function draw(e) {
    if (!isDrawing) return;

    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    ctx.strokeStyle = isEraser ? "#ffffff" : colorPicker.value;
    ctx.lineWidth = sizeSlider.value;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(currentX, currentY);
    ctx.stroke();

    lastX = currentX;
    lastY = currentY;
  }

  function stopDrawing() {
    isDrawing = false;
  }

  // Mouse events
  canvas.addEventListener("mousedown", startDrawing);
  canvas.addEventListener("mousemove", draw);
  canvas.addEventListener("mouseup", stopDrawing);
  canvas.addEventListener("mouseleave", stopDrawing);

  // Touch events for mobile
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent("mousedown", {
      clientX: touch.clientX,
      clientY: touch.clientY,
    });
    canvas.dispatchEvent(mouseEvent);
  });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent("mousemove", {
      clientX: touch.clientX,
      clientY: touch.clientY,
    });
    canvas.dispatchEvent(mouseEvent);
  });

  canvas.addEventListener("touchend", (e) => {
    e.preventDefault();
    const mouseEvent = new MouseEvent("mouseup", {});
    canvas.dispatchEvent(mouseEvent);
  });

  // Handle window resize
  const resizeObserver = new ResizeObserver(() => {
    const oldData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    canvas.width = drawingContent.offsetWidth;
    canvas.height = drawingContent.offsetHeight;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.putImageData(oldData, 0, 0);
  });

  resizeObserver.observe(drawingContent);
}

function clearDrawingCanvas(btn) {
  const win = btn.closest(".os-window");
  const canvas = win.querySelector("#drawing-canvas");
  if (!canvas) return;

  if (confirm("Clear the entire canvas?")) {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function saveDrawingFile(btn) {
  const win = btn.closest(".os-window");
  const filename = win.querySelector("#drawing-filename").value.trim();
  const pathInput = win.querySelector("#drawing-path");
  const saveDirPath = pathInput ? pathInput.value.trim() : "/";
  const canvas = win.querySelector("#drawing-canvas");

  if (!canvas) return;

  if (!filename) {
    osAlert("Please enter a filename", "Error");
    return;
  }

  if (!filename.toLowerCase().endsWith(".drw")) {
    osAlert("Please include .drw extension in your filename.", "Constraint");
    return;
  }

  // Save canvas as base64 data URL
  const imageData = canvas.toDataURL("image/png");
  const drawingData = {
    imageData: imageData,
    width: canvas.width,
    height: canvas.height,
    timestamp: new Date().toISOString(),
  };

  // Normalize directory path
  let dirPath = saveDirPath;
  if (!dirPath.startsWith("/")) dirPath = "/" + dirPath;

  let parent = getVFSNode(dirPath);
  if (parent && parent.type === "dir") {
    parent.children[filename] = {
      type: "file",
      content: JSON.stringify(drawingData),
      fileType: "drw",
    };
    saveVFS();
    osToast(
      `Saved as ${dirPath === "/" ? "" : dirPath}/${filename}`,
      "ph-check-circle",
    );

    // Refresh explorer if it's viewing that folder
    if (document.getElementById("explorer-grid")) {
      renderExplorer(currentExplorerPath);
    }
  } else {
    osAlert(`The folder "${dirPath}" does not exist.`, "Error");
  }
}

function openDrawingFile(path, win = null) {
  const node = getVFSNode(path);
  if (!node || node.type !== "file") return;

  if (!path.toLowerCase().endsWith(".drw")) {
    osAlert("Only .drw files can be opened in Drawing.", "Error");
    return;
  }

  if (!win) {
    openApp("drawing");
    setTimeout(() => {
      const newWin = Array.from(
        document.querySelectorAll('.os-window[data-app="drawing"]'),
      ).pop();
      openDrawingFile(path, newWin);
    }, 150);
    return;
  }

  const pathInput = win.querySelector("#drawing-smart-path");
  if (pathInput) pathInput.value = path;

  try {
    const drawingData = JSON.parse(node.content);
    const canvas = win.querySelector("#drawing-canvas");
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear before drawing
      ctx.drawImage(img, 0, 0);
    };
    img.src = drawingData.imageData;
  } catch (e) {
    osAlert("Failed to load drawing file.", "Error");
  }
  setActiveWindow(win);
}

// --- Photo Viewer Logic ---
function openPhotoInViewer(path) {
  const node = getVFSNode(path);
  if (!node || node.type !== "file") return;

  const fileName = path.split("/").pop();
  if (!isImageFile(fileName)) {
    osAlert(
      "This file type is not supported by the Photo Viewer. Only image files (.png, .jpg, .jpeg, .gif, .webp) can be opened.",
      "Error",
    );
    return;
  }

  openApp("photoviewer");
  setTimeout(() => {
    const win = Array.from(document.querySelectorAll(".os-window")).pop();
    if (win && win.querySelector("#photoviewer-image")) {
      const titleEl = win.querySelector("#photoviewer-title");
      const imgEl = win.querySelector("#photoviewer-image");
      const placeholderEl = win.querySelector("#photoviewer-placeholder");

      if (titleEl) titleEl.textContent = fileName;
      if (placeholderEl) placeholderEl.style.display = "none";

      // Load image from base64 data
      // Image files are stored as base64 data URLs from FileReader
      imgEl.src = node.content;

      imgEl.style.display = "block";
    }
  }, 100);
}

function closePhotoViewer(btn) {
  const win = btn.closest(".os-window");
  if (win) {
    win.classList.add("closing");
    setTimeout(() => win.remove(), 300);
  }
}

// Global exposure
window.navigateBrowser = navigateBrowser;
window.renderExplorer = renderExplorer;
window.openFileInNotepad = openFileInNotepad;
window.openDrawingFile = openDrawingFile;
window.openPhotoInViewer = openPhotoInViewer;
window.closePhotoViewer = closePhotoViewer;
window.explorerGoBackBtn = explorerGoBackBtn;
window.explorerNavigateInput = explorerNavigateInput;
window.browserGoBack = browserGoBack;
window.browserReload = browserReload;
window.handleSmartPath = handleSmartPath;
window.toggleEraser = (btn) => {
  const win = btn.closest(".os-window");
  if (win && win.toggleEraser) win.toggleEraser();
};

window.forceRefreshMusicLibrary = async (btn) => {
  const win = btn.closest(".os-window");
  if (!win) return;
  btn.classList.add("ph-spin");
  if (typeof scanMusicLibrary === "function") {
    await scanMusicLibrary();
    if (win.switchView) win.switchView(win.currentView || "library-songs");
    if (typeof renderSidebarPlaylists === "function")
      renderSidebarPlaylists(win);
  }
  btn.classList.remove("ph-spin");
  if (typeof osToast === "function")
    osToast("Library Synced", "ph-arrows-clockwise");
};

function setActiveWindow(win) {
  if (typeof hideOverlays === "function") hideOverlays();
  document
    .querySelectorAll(".os-window")
    .forEach((w) => w.classList.remove("active"));
  win.classList.add("active");
  win.style.zIndex = ++zIndexCounter;
}

function openApp(appId) {
  const data = appData[appId];
  if (!data) return;

  const win = document.createElement("div");
  win.className = "os-window glass active";
  win.dataset.app = appId;
  win.style.width = data.width;
  win.style.height = data.height;

  // Randomize position and ensure it stays below topbar (approx 45px high)
  const randomOffset = Math.floor(Math.random() * 40) - 20;

  const w = parseInt(data.width) || 600;
  const h = parseInt(data.height) || 400;

  const minTop = 45;
  const topPx = Math.max(minTop, window.innerHeight / 2 - h / 2 + randomOffset);
  const leftPx = Math.max(0, window.innerWidth / 2 - w / 2 + randomOffset);

  win.style.top = topPx + "px";
  win.style.left = leftPx + "px";
  win.style.zIndex = ++zIndexCounter;

  win.innerHTML = `
        <div class="window-header">
            <div class="multitasking-dots" title="Window Controls" style="cursor: pointer;">
                <span></span>
                <span></span>
                <span></span>
            </div>
            <div class="multitasking-menu">
                <div class="multitasking-menu-item" data-action="minimize"><i class="ph ph-minus"></i> Minimize</div>
                <div class="multitasking-menu-item" data-action="maximize"><i class="ph ph-corners-out"></i> Maximize</div>
                <div class="multitasking-menu-item danger" data-action="close"><i class="ph ph-x"></i> Close</div>
            </div>
        </div>
        <div class="window-content">
            ${data.content}
        </div>
    `;

  // Initialize Notepad
  if (appId === "Notepad") {
    win.selectedNodes = new Set();
    setTimeout(() => {
      const pathInput = win.querySelector("#Notepad-smart-path");
      const currentPath = win.dataset.currentPath || "/";
      if (pathInput)
        pathInput.value =
          currentPath + (currentPath.endsWith("/") ? "" : "/") + "untitled.txt";
    }, 50);
  }

  // Initialize Drawing App
  if (appId === "drawing") {
    win.selectedNodes = new Set();
    setTimeout(() => {
      const pathInput = win.querySelector("#drawing-smart-path");
      const currentPath = win.dataset.currentPath || "/";
      if (pathInput)
        pathInput.value =
          currentPath + (currentPath.endsWith("/") ? "" : "/") + "untitled.drw";

      initDrawingCanvas(win);
    }, 50);
  }

  // Initialize Photo Viewer
  if (appId === "photoviewer") {
    setTimeout(() => {
      // Photo viewer starts empty, will be populated when opening a file
    }, 50);
  }

  // Initialize Music Player
  if (appId === "musicplayer") {
    setTimeout(() => {
      initMusicPlayer(win);
    }, 50);
  }

  // Initialize Settings
  if (appId === "settings") {
    setTimeout(() => {
      updateStorageDisplay(win);
      // Update storage display every 2 seconds while settings window is open
      const storageInterval = setInterval(() => {
        if (!win.parentNode) {
          clearInterval(storageInterval);
          return;
        }
        updateStorageDisplay(win);
      }, 2000);
    }, 50);
  }

  // Initialize Explorer
  if (appId === "files") {
    win.selectedNodes = new Set();
    setTimeout(() => {
      renderExplorer(win, "/");
      const grid = win.querySelector("#explorer-grid");
      if (grid) {
        grid.addEventListener("click", (e) => {
          if (e.target === grid && grid.dataset.wasDragging !== "true") {
            if (
              typeof ctxMenu !== "undefined" &&
              ctxMenu &&
              ctxMenu.style.display === "block"
            ) {
              hideContextMenu();
              return; // Do nothing else, just close menu
            }
            win.selectedNodes.clear();
            grid
              .querySelectorAll(".file-item.selected")
              .forEach((el) => el.classList.remove("selected"));
          }
        });

        initExplorerMarquee(win, grid);
      }
    }, 50);
  }

  // Initialize Terminal
  if (data.type === "terminal") {
    const input = win.querySelector(".cmd-input");
    const output = win.querySelector(".output");

    win
      .querySelector(".window-content")
      .addEventListener("click", () => input.focus());

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const cmd = input.value.trim();
        if (cmd) {
          const cmdLine = document.createElement("div");
          cmdLine.innerHTML = `<span style="color: var(--success);">➜</span> <span style="color: var(--accent);">~</span> ${cmd}`;
          output.appendChild(cmdLine);
          handleCommand(cmd, output);
        }
        input.value = "";
        win.querySelector(".window-content").scrollTop =
          win.querySelector(".window-content").scrollHeight;
      }
    });
    setTimeout(() => input.focus(), 500);
  }

  // --- Interaction Logic (New) ---
  const header = win.querySelector(".window-header");

  // Focus actions
  win.addEventListener("mousedown", () => setActiveWindow(win));

  // Dragging vs Clicking Logic
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;
  let didMove = false;

  header.addEventListener("mousedown", (e) => {
    isDragging = true;
    didMove = false;
    startX = e.clientX;
    startY = e.clientY;
    initialLeft = win.offsetLeft;
    initialTop = win.offsetTop;
    setActiveWindow(win);
    header.style.cursor = "grabbing";
  });

  // Snap Assist Bar Trigger
  const snapAssistBar = document.getElementById("snap-assist-bar");
  let activeDropZone = null;

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      didMove = true;
      win.classList.remove("maximized");
      win.style.borderRadius = "16px";

      // --- Snap Assist Logic ---
      if (e.clientY < 50) {
        snapAssistBar.classList.add("visible");
      } else if (e.clientY > 150) {
        snapAssistBar.classList.remove("visible");
        if (activeDropZone) {
          activeDropZone.classList.remove("active-drop");
          activeDropZone = null;
        }
      }

      if (snapAssistBar.classList.contains("visible")) {
        const currentPointerEvents = win.style.pointerEvents;
        win.style.pointerEvents = "none";
        const elemBelow = document.elementFromPoint(e.clientX, e.clientY);
        win.style.pointerEvents = currentPointerEvents;

        if (activeDropZone && activeDropZone !== elemBelow) {
          activeDropZone.classList.remove("active-drop");
          activeDropZone = null;
        }

        if (elemBelow && elemBelow.classList.contains("snap-zone")) {
          activeDropZone = elemBelow;
          activeDropZone.classList.add("active-drop");
        }
      }

      win.style.left = `${initialLeft + dx}px`;
      let top = initialTop + dy;
      if (top < 40) top = 40; // 38px topbar + 2px buffer
      win.style.top = `${top}px`;
    }
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      header.style.cursor = "grab";

      // Handle Snap Drop
      if (activeDropZone) {
        const snapType = activeDropZone.getAttribute("data-snap");
        win.style.transition = "all 0.3s var(--ease-out-expo)";

        switch (snapType) {
          case "left":
            win.style.top = "45px";
            win.style.left = "10px";
            win.style.width = "calc(50% - 15px)";
            win.style.height = "calc(100% - 55px)";
            break;
          case "right":
            win.style.top = "45px";
            win.style.left = "calc(50% + 5px)";
            win.style.width = "calc(50% - 15px)";
            win.style.height = "calc(100% - 55px)";
            break;
          case "tl":
            win.style.top = "45px";
            win.style.left = "10px";
            win.style.width = "calc(50% - 15px)";
            win.style.height = "calc(50% - 32px)";
            break;
          case "tr":
            win.style.top = "45px";
            win.style.left = "calc(50% + 5px)";
            win.style.width = "calc(50% - 15px)";
            win.style.height = "calc(50% - 32px)";
            break;
          case "bl":
            win.style.top = "calc(50% + 23px)";
            win.style.left = "10px";
            win.style.width = "calc(50% - 15px)";
            win.style.height = "calc(50% - 32px)";
            break;
          case "br":
            win.style.top = "calc(50% + 23px)";
            win.style.left = "calc(50% + 5px)";
            win.style.width = "calc(50% - 15px)";
            win.style.height = "calc(50% - 32px)";
            break;
          case "maximize":
            win.classList.add("maximized");
            // Keep rounded corners even when maximized, as per user request
            break;
        }

        setTimeout(() => {
          win.style.transition = "";
        }, 300);

        activeDropZone.classList.remove("active-drop");
        activeDropZone = null;
      }

      // Hide Snap Bar
      snapAssistBar.classList.remove("visible");
    }
  });

  // --- Multitasking Menu Logic ---
  const dots = header.querySelector(".multitasking-dots");
  const menu = header.querySelector(".multitasking-menu");

  let dotStartX, dotStartY;
  dots.addEventListener("mousedown", (e) => {
    // Do NOT stop propagation here so the window CAN be dragged natively
    dotStartX = e.clientX;
    dotStartY = e.clientY;
  });

  dots.addEventListener("click", (e) => {
    e.stopPropagation();

    // Ignore click if the user was actually dragging the window
    if (
      Math.abs(e.clientX - dotStartX) > 5 ||
      Math.abs(e.clientY - dotStartY) > 5
    ) {
      return;
    }

    // Close other menus if any
    document.querySelectorAll(".multitasking-menu.active").forEach((m) => {
      if (m !== menu) m.classList.remove("active");
    });
    menu.classList.toggle("active");
  });

  menu.querySelectorAll(".multitasking-menu-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const action = item.getAttribute("data-action");
      if (action === "minimize") {
        win.classList.remove("maximized");
        win.style.borderRadius = "16px";
        win.classList.add("minimized");
      } else if (action === "maximize") {
        if (!win.classList.contains("maximized")) {
          win.classList.add("maximized");
          win.style.borderRadius = "0"; // Sharp corners when full screen
        } else {
          win.classList.remove("maximized");
          win.style.borderRadius = "16px";
        }
      } else if (action === "close") {
        win.classList.add("closing");
        setTimeout(() => win.remove(), 300);
      }
      menu.classList.remove("active");
    });
  });

  // Close menus when clicking anywhere else
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && !dots.contains(e.target)) {
      menu.classList.remove("active");
    }
  });

  // Keep right click context menu disabled on header to avoid native browser menu
  header.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  // --- Resize Handles ---
  // --- Resize Handles ---
  const resizeHandles = ["t", "r", "b", "l", "tl", "tr", "bl", "br"];
  resizeHandles.forEach((type) => {
    const handle = document.createElement("div");
    handle.className = `resize-handle resize-${type}`;
    win.appendChild(handle);

    let isResizing = false;
    let startWidth, startHeight, startX, startY, startLeft, startTop;

    handle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      isResizing = true;

      win.classList.remove("maximized");
      win.style.borderRadius = "16px";

      const rect = win.getBoundingClientRect();
      startWidth = rect.width;
      startHeight = rect.height;
      startLeft = rect.left;
      startTop = rect.top;
      startX = e.clientX;
      startY = e.clientY;

      setActiveWindow(win);
    });

    document.addEventListener("mousemove", (e) => {
      if (!isResizing) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      // Horizontal
      if (type.includes("r")) {
        const width = startWidth + dx;
        if (width > 200) win.style.width = width + "px";
      } else if (type.includes("l")) {
        const width = startWidth - dx;
        if (width > 200) {
          win.style.width = width + "px";
          win.style.left = startLeft + dx + "px";
        }
      }

      // Vertical
      if (type.includes("b")) {
        const height = startHeight + dy;
        if (height > 150) win.style.height = height + "px";
      } else if (type.includes("t")) {
        const height = startHeight - dy;
        if (height > 150) {
          win.style.height = height + "px";
          win.style.top = startTop + dy + "px";
        }
      }
    });

    document.addEventListener("mouseup", () => {
      isResizing = false;
    });
  });

  desktop.appendChild(win);
  setActiveWindow(win);
}

function handleCommand(cmd, outputElement) {
  const response = document.createElement("div");
  response.style.color = "var(--text-main)";
  response.style.marginTop = "5px";
  response.style.lineHeight = "1.5";

  const command = cmd.toLowerCase().trim();

  if (command === "clear") {
    outputElement.innerHTML = "";
    const terminalBody = outputElement.closest(".terminal-body");
    const canvas = terminalBody
      ? terminalBody.querySelector(".matrix-canvas")
      : null;
    if (canvas) {
      clearInterval(parseInt(canvas.dataset.matrixInterval));
      canvas.remove();
    }
    return;
  }

  if (command === "help") {
    response.innerHTML = `
            <div style="color: var(--accent); margin-bottom: 5px;">[ Available Commands ]</div>
            <div style="display: grid; grid-template-columns: 100px 1fr; gap: 10px; font-size: 13px;">
                <span style="color: var(--success);">about</span> <span>System information and philosophy</span>
                <span style="color: var(--success);">neofetch</span> <span>System overview utility</span>
                <span style="color: var(--success);">matrix</span> <span>Enter the digital rain</span>
                <span style="color: var(--success);">ls</span> <span>List directory contents</span>
                <span style="color: var(--success);">whoami</span> <span>Display current user info</span>
                <span style="color: var(--success);">date</span> <span>Current system time</span>
                <span style="color: var(--success);">clear</span> <span>Clear the terminal screen</span>
                <span style="color: var(--success);">echo</span> <span>Print text to the terminal</span>
            </div>
        `;
  } else if (command === "about") {
    response.innerHTML = `
            <div style="color: var(--accent); font-weight: bold; font-size: 18px; margin-bottom: 10px;">RobbieOS Personal Portfolio</div>
            
            <div style="color: var(--success); font-weight: 600; margin-bottom: 4px;">[ Me / Myself ]</div>
            <div style="margin-bottom: 12px; color: var(--text-main);">I'm a 16 year old game and web developer with over 7 years of programming experience. I am passionate about creating immersive digital experiences. I love pushing the boundaries of what's possible in tech.</div>

            <div style="color: var(--success); font-weight: 600; margin-bottom: 4px;">[ Hack Club webOS Event ]</div>
            <div style="margin-bottom: 12px; color: var(--text-main);">This project was created for the Hack Club webOS event, a challenge to build the best operating system in the browser. It is a wonderful journey of UI and UX design.</div>

            <div style="color: var(--success); font-weight: 600; margin-bottom: 4px;">[ The Idea: RobbieOS ]</div>
            <div style="margin-bottom: 12px; color: var(--text-main);">RobbieOS is a vision of a dream-like workspace. It takes inspiration from the best features of macOS, iPadOS, Hyprland, and Windows to create a unique user experience.</div>
            
            <div style="margin-top: 10px; font-style: italic; color: var(--text-muted);">"I like building a webOS :D"</div>
        `;
  } else if (command === "neofetch" || command === "fetch") {
    response.innerHTML = `
            <div style="display: flex; gap: 20px; align-items: flex-start;">
                <pre style="color: var(--accent); font-size: 12px; margin: 0; line-height: 1.1;">
      .---.
     /     \\
    | () () |
     \\  ^  /
      |||||
      |||||
                </pre>
                <div>
                    <div style="color: var(--accent); font-weight: bold;">guest@RobbieOS</div>
                    <div style="color: var(--text-muted);">-----------------</div>
                    <div><span style="color: var(--accent);">OS</span>: RobbieOS v2.0</div>
                    <div><span style="color: var(--accent);">Kernel</span>: Robbie-JS v2.4</div>
                    <div><span style="color: var(--accent);">Uptime</span>: ${Math.floor(performance.now() / 60000)} mins</div>
                    <div><span style="color: var(--accent);">Resolution</span>: ${window.innerWidth}x${window.innerHeight}</div>
                    <div><span style="color: var(--accent);">UI</span>: Robbie-Core Glass</div>
                    <div><span style="color: var(--accent);">Accent</span>: <span style="color: var(--accent);">●</span> <span style="color: var(--accent-secondary);">●</span> <span style="color: var(--success);">●</span></div>
                </div>
            </div>
        `;
  } else if (command === "matrix") {
    startMatrixEffect(outputElement);
    return;
  } else if (command === "ls" || command.startsWith("ls ")) {
    let path = cmd.split(" ")[1] || currentExplorerPath;
    let node = getVFSNode(path);
    if (node && node.type === "dir") {
      const items = Object.keys(node.children).map((name) => {
        const item = node.children[name];
        const color =
          item.type === "dir" ? "var(--accent)" : "var(--text-main)";
        const weight = item.type === "dir" ? "bold" : "normal";
        return `<span style="color: ${color}; font-weight: ${weight}; margin-right: 15px;">${name}${item.type === "dir" ? "/" : ""}</span>`;
      });
      response.innerHTML =
        items.join("") ||
        '<span style="color: var(--text-muted);">Empty directory</span>';
    } else {
      response.innerHTML = `<span style="color: var(--error);">ls: ${path}: No such directory</span>`;
    }
  } else if (command.startsWith("cd ")) {
    let path = cmd.split(" ")[1];
    if (path === "..") {
      explorerGoBack();
      response.innerHTML = `Directory changed to ${currentExplorerPath}`;
    } else if (path === "~" || path === "/") {
      currentExplorerPath = "/";
      document
        .querySelectorAll('.os-window[data-app="files"]')
        .forEach((w) => renderExplorer(w, "/"));
      response.innerHTML = `Directory changed to /`;
    } else {
      let target =
        currentExplorerPath === "/"
          ? "/" + path
          : currentExplorerPath + "/" + path;
      let node = getVFSNode(target);
      if (node && node.type === "dir") {
        currentExplorerPath = target;
        document
          .querySelectorAll('.os-window[data-app="files"]')
          .forEach((w) => renderExplorer(w, target));
        response.innerHTML = `Directory changed to ${currentExplorerPath}`;
      } else {
        response.innerHTML = `<span style="color: var(--error);">cd: ${path}: No such directory</span>`;
      }
    }
  } else if (command.startsWith("cat ")) {
    let filename = cmd.split(" ")[1];
    let path =
      currentExplorerPath === "/"
        ? "/" + filename
        : currentExplorerPath + "/" + filename;
    let node = getVFSNode(path);
    if (node && node.type === "file") {
      response.innerText = node.content;
    } else {
      response.innerHTML = `<span style="color: var(--error);">cat: ${filename}: No such file</span>`;
    }
  } else if (command.startsWith("mkdir ")) {
    let name = cmd.split(" ")[1];
    let path = name.startsWith("/")
      ? name
      : currentExplorerPath === "/"
        ? "/" + name
        : currentExplorerPath + "/" + name;
    let parts = path.split("/").filter((p) => p);
    let folderName = parts.pop();
    let parentPath = "/" + parts.join("/");
    let parent = getVFSNode(parentPath);

    if (parent && parent.type === "dir" && folderName) {
      parent.children[folderName] = { type: "dir", children: {} };
      saveVFS();
      document
        .querySelectorAll('.os-window[data-app="files"]')
        .forEach((w) => renderExplorer(w, currentExplorerPath));
      response.innerHTML = `<span style="color: var(--success);">mkdir: Created directory '${folderName}'</span>`;
    } else {
      response.innerHTML = `<span style="color: var(--error);">mkdir: Invalid path or missing name</span>`;
    }
  } else if (command.startsWith("touch ")) {
    let name = cmd.split(" ")[1];
    let path = name.startsWith("/")
      ? name
      : currentExplorerPath === "/"
        ? "/" + name
        : currentExplorerPath + "/" + name;
    let parts = path.split("/").filter((p) => p);
    let fileName = parts.pop();
    let parentPath = "/" + parts.join("/");
    let parent = getVFSNode(parentPath);

    if (parent && parent.type === "dir" && fileName) {
      parent.children[fileName] = { type: "file", content: "" };
      saveVFS();
      document
        .querySelectorAll('.os-window[data-app="files"]')
        .forEach((w) => renderExplorer(w, currentExplorerPath));
      response.innerHTML = `<span style="color: var(--success);">touch: Created file '${fileName}'</span>`;
    } else {
      response.innerHTML = `<span style="color: var(--error);">touch: Invalid path or missing name</span>`;
    }
  } else if (command.startsWith("mv ")) {
    let parts = cmd.split(" ");
    let src = parts[1];
    let dest = parts[2];
    if (src && dest) {
      let srcPath = src.startsWith("/")
        ? src
        : currentExplorerPath === "/"
          ? "/" + src
          : currentExplorerPath + "/" + src;
      let destPath = dest.startsWith("/")
        ? dest
        : currentExplorerPath === "/"
          ? "/" + dest
          : currentExplorerPath + "/" + dest;
      moveVFSNode(srcPath, destPath);
      response.innerHTML = `<span style="color: var(--success);">mv: Moved ${src} to ${dest}</span>`;
    } else {
      response.innerHTML = `<span style="color: var(--error);">mv: Usage: mv [src] [dest]</span>`;
    }
  } else if (command.startsWith("rm ")) {
    let name = cmd.split(" ")[1];
    let path = name.startsWith("/")
      ? name
      : currentExplorerPath === "/"
        ? "/" + name
        : currentExplorerPath + "/" + name;
    let pathParts = path.split("/").filter((p) => p);
    let targetName = pathParts.pop();
    let parentPath = "/" + pathParts.join("/");
    let parent = getVFSNode(parentPath);

    if (parent && parent.children[targetName]) {
      delete parent.children[targetName];
      saveVFS();
      document
        .querySelectorAll('.os-window[data-app="files"]')
        .forEach((w) => renderExplorer(w, currentExplorerPath));
      response.innerHTML = `<span style="color: var(--success);">rm: Removed '${targetName}'</span>`;
    } else {
      response.innerHTML = `<span style="color: var(--error);">rm: '${name}': No such file or directory</span>`;
    }
  } else if (command === "whoami") {
    response.textContent = "guest";
  } else if (command === "date") {
    response.textContent = new Date().toLocaleString();
  } else if (command.startsWith("echo ")) {
    response.textContent = cmd.substring(5);
  } else {
    response.textContent = `Command not found: ${command}. Type 'help' for options.`;
    response.style.color = "var(--danger)";
  }

  outputElement.appendChild(response);
}

function startMatrixEffect(outputElement) {
  const terminalBody = outputElement.closest(".terminal-body");
  if (!terminalBody) return;

  // Remove existing if any
  const existing = terminalBody.querySelector(".matrix-canvas");
  if (existing) {
    clearInterval(parseInt(existing.dataset.matrixInterval));
    existing.remove();
  }

  const canvas = document.createElement("canvas");
  canvas.className = "matrix-canvas";
  canvas.style.position = "absolute";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.zIndex = "0";
  canvas.style.pointerEvents = "none";
  canvas.style.opacity = "0.8";

  // Ensure terminal content is visible over the animation
  const output = terminalBody.querySelector(".output");
  const inputLine = terminalBody.querySelector(".input-line");
  if (output) {
    output.style.position = "relative";
    output.style.zIndex = "1";
  }
  if (inputLine) {
    inputLine.style.position = "relative";
    inputLine.style.zIndex = "1";
  }

  terminalBody.style.position = "relative";
  terminalBody.prepend(canvas);

  const ctx = canvas.getContext("2d");
  canvas.width = terminalBody.offsetWidth;
  canvas.height = terminalBody.offsetHeight;

  const chars = "0123456789ABCDEFHIJKLMNOPQRSTUVWXYZ$#@%&*";
  const fontSize = 14;
  const columns = Math.floor(canvas.width / fontSize);
  const drops = new Array(columns).fill(0).map(() => Math.random() * -20);

  const draw = () => {
    // Use destination-out to fade previous frames while keeping transparency
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#44cf6c"; // Match RobbieOS green accent
    ctx.font = fontSize + "px monospace";

    for (let i = 0; i < drops.length; i++) {
      const text = chars[Math.floor(Math.random() * chars.length)];
      ctx.fillText(text, i * fontSize, drops[i] * fontSize);

      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i]++;
    }
  };

  const interval = setInterval(draw, 40);
  canvas.dataset.matrixInterval = interval;
}

// --- Context Menu Logic ---
const ctxMenu = document.getElementById("context-menu");

function showContextMenu(e, items) {
  e.preventDefault();
  ctxMenu.innerHTML = "";

  items.forEach((item) => {
    if (item === "separator") {
      const sep = document.createElement("div");
      sep.className = "context-menu-separator";
      ctxMenu.appendChild(sep);
    } else {
      const div = document.createElement("div");
      div.className = `context-menu-item ${item.danger ? "danger" : ""}`;
      div.innerHTML = `<i class="ph ${item.icon}"></i> ${item.text}`;
      div.onclick = () => {
        item.action();
        hideContextMenu();
      };
      ctxMenu.appendChild(div);
    }
  });

  ctxMenu.style.display = "block";

  // Position menu and keep it within bounds
  let x = e.clientX;
  let y = e.clientY;

  if (x + ctxMenu.offsetWidth > window.innerWidth) x -= ctxMenu.offsetWidth;
  if (y + ctxMenu.offsetHeight > window.innerHeight) y -= ctxMenu.offsetHeight;

  ctxMenu.style.left = x + "px";
  ctxMenu.style.top = y + "px";
}

function hideContextMenu() {
  ctxMenu.style.display = "none";
}

document.addEventListener("mousedown", (e) => {
  if (ctxMenu && !ctxMenu.contains(e.target)) {
    hideContextMenu();
  }
});
document.addEventListener("contextmenu", (e) => {
  // Disable default browser menu globally
  e.preventDefault();
  hideContextMenu();
});

// Update renderExplorer to include the custom context menu for files/folders
const originalRenderExplorer = renderExplorer;
renderExplorer = function (win, path) {
  originalRenderExplorer(win, path);

  const items = win.querySelectorAll(".file-item");
  items.forEach((itemDiv) => {
    itemDiv.addEventListener("contextmenu", (e) => {
      e.stopPropagation();
      e.preventDefault();

      const nodePath = itemDiv.dataset.path;

      if (!win.selectedNodes.has(nodePath)) {
        win.selectedNodes.clear();
        win.selectedNodes.add(nodePath);

        // Visual Update Without Full Re-render
        const grid = win.querySelector("#explorer-grid");
        if (grid) {
          grid.querySelectorAll(".file-item").forEach((el) => {
            if (el.dataset.path === nodePath) el.classList.add("selected");
            else el.classList.remove("selected");
          });
        }
      }

      const menuItems = [
        { icon: "ph-copy", text: "Copy", action: () => executeCopy(win) },
        { icon: "ph-scissors", text: "Cut", action: () => executeCut(win) },
        "separator",
        {
          icon: "ph-note-pencil",
          text: "Rename",
          action: () => renameVFSNode(win, nodePath),
        },
        {
          icon: "ph-copy",
          text: "Duplicate",
          action: () => duplicateVFSNode(win, nodePath),
        },
        {
          icon: "ph-palette",
          text: "Change Icon",
          action: () => changeFolderIcon(win, nodePath),
          condition: () => getVFSNode(nodePath).type === "dir",
        },
        {
          icon: "ph-image",
          text: "Set as Desktop Background",
          action: () => {
            const node = getVFSNode(nodePath);
            if (node && node.content) {
              setBackground("custom", node.content);
              osToast("Wallpaper updated", "ph-check");
            }
          },
          condition: () => isImageFile(nodePath),
        },
        {
          icon: "ph-link",
          text: "Copy Path",
          action: () => {
            navigator.clipboard.writeText(nodePath);
            osToast("Path copied to clipboard", "ph-check");
          },
        },
        "separator",
        {
          icon: "ph-trash",
          text: "Delete",
          danger: true,
          action: () => deleteVFSNode(win, nodePath),
        },
        "separator",
        {
          icon: "ph-info",
          text: "Properties",
          action: () => showNodeProperties(nodePath),
        },
      ];

      if (win.selectedNodes.size > 1) {
        showContextMenu(e, [
          {
            icon: "ph-copy",
            text: `Copy Selected (${win.selectedNodes.size})`,
            action: () => executeCopy(win),
          },
          {
            icon: "ph-link",
            text: `Copy All Paths (${win.selectedNodes.size})`,
            action: () => {
              const paths = Array.from(win.selectedNodes).join("\n");
              navigator.clipboard.writeText(paths);
              osToast(`${win.selectedNodes.size} paths copied`, "ph-check");
            },
          },
          {
            icon: "ph-scissors",
            text: `Cut Selected (${win.selectedNodes.size})`,
            action: () => executeCut(win),
          },
          "separator",
          {
            icon: "ph-note-pencil",
            text: `Rename Selected (${win.selectedNodes.size})`,
            action: () => massRename(win),
          },
          {
            icon: "ph-trash",
            text: `Delete Selected (${win.selectedNodes.size})`,
            danger: true,
            action: () => massDelete(win),
          },
        ]);
      } else {
        showContextMenu(
          e,
          menuItems.filter((item) => !item.condition || item.condition()),
        );
      }
      e.stopPropagation();
    });
  });

  const grid = win.querySelector("#explorer-grid");
  if (grid) {
    grid.oncontextmenu = (e) => {
      // If we clicked on an item or child of an item, don't show the grid menu
      if (e.target.closest(".file-item")) return;
      e.stopPropagation();
      e.preventDefault();

      const menuItems = [
        {
          icon: "ph-folder-plus",
          text: "New Folder",
          action: () => {
            osPrompt("Enter folder name:", "New Folder", (name) => {
              if (name) {
                const parent = getVFSNode(win.dataset.currentPath);
                if (parent && parent.type === "dir") {
                  parent.children[name] = { type: "dir", children: {} };
                  saveVFS();
                  renderExplorer(win, win.dataset.currentPath);
                }
              }
            });
          },
        },
        {
          icon: "ph-file-plus",
          text: "New File",
          action: () => {
            osPrompt(
              "Enter file name (e.g. document.txt):",
              "document.txt",
              (name) => {
                if (name) {
                  const parent = getVFSNode(win.dataset.currentPath);
                  if (parent && parent.type === "dir") {
                    parent.children[name] = { type: "file", content: "" };
                    saveVFS();
                    renderExplorer(win, win.dataset.currentPath);
                  }
                }
              },
            );
          },
        },
        "separator",
        {
          icon: "ph-clipboard",
          text: "Paste",
          action: () => executePaste(win),
          condition: () =>
            window.osClipboard && window.osClipboard.paths.length > 0,
        },
        "separator",
        {
          icon: "ph-arrow-clockwise",
          text: "Refresh",
          action: () => renderExplorer(win, win.dataset.currentPath),
        },
      ];

      if (win.selectedNodes && win.selectedNodes.size > 0) {
        menuItems.unshift(
          {
            icon: "ph-copy",
            text: `Copy (${win.selectedNodes.size})`,
            action: () => executeCopy(win),
          },
          {
            icon: "ph-scissors",
            text: `Cut (${win.selectedNodes.size})`,
            action: () => executeCut(win),
          },
          {
            icon: "ph-note-pencil",
            text: `Rename (${win.selectedNodes.size})`,
            action: () => massRename(win),
          },
          {
            icon: "ph-trash",
            text: `Delete (${win.selectedNodes.size})`,
            danger: true,
            action: () => massDelete(win),
          },
          "separator",
        );
      }

      showContextMenu(
        e,
        menuItems.filter((item) => !item.condition || item.condition()),
      );
    };
  }
};

// Clipboard logic
window.osClipboard = { paths: [], action: null };

function executeCopy(win) {
  if (!win.selectedNodes || win.selectedNodes.size === 0) return;
  window.osClipboard.paths = Array.from(win.selectedNodes);
  window.osClipboard.action = "copy";
  osToast(`Copied ${window.osClipboard.paths.length} items`, "ph-copy");
}

function executeCut(win) {
  if (!win.selectedNodes || win.selectedNodes.size === 0) return;
  window.osClipboard.paths = Array.from(win.selectedNodes);
  window.osClipboard.action = "cut";
  osToast(`Cut ${window.osClipboard.paths.length} items`, "ph-scissors");
}

function executePaste(win) {
  if (!window.osClipboard.paths.length) return;
  const targetDir = win.dataset.currentPath;
  const parent = getVFSNode(targetDir);
  if (!parent || parent.type !== "dir") return;

  window.osClipboard.paths.forEach((sourcePath) => {
    const parts = sourcePath.split("/").filter((p) => p);
    const name = parts.pop();
    const node = getVFSNode(sourcePath);
    if (!node) return;

    if (window.osClipboard.action === "copy") {
      // Duplicate logic
      let newName = name;
      let counter = 1;
      while (parent.children[newName]) {
        const extIndex = name.lastIndexOf(".");
        if (extIndex !== -1) {
          newName = `${name.substring(0, extIndex)} (${counter++})${name.substring(extIndex)}`;
        } else {
          newName = `${name} (${counter++})`;
        }
      }
      parent.children[newName] = JSON.parse(JSON.stringify(node));
    } else {
      // Move logic
      moveVFSNode(sourcePath, targetDir);
    }
  });

  if (window.osClipboard.action === "cut") {
    window.osClipboard.paths = [];
    window.osClipboard.action = null;
  }
  saveVFS();
  // Refresh all explorers
  document.querySelectorAll('.os-window[data-app="files"]').forEach((w) => {
    renderExplorer(w, w.dataset.currentPath);
  });
  osToast("Paste completed", "ph-clipboard");
}

// Global keyboard listeners
window.addEventListener("keydown", (e) => {
  // Only handle if an explorer window is active
  const activeWin = document.querySelector(
    '.os-window.active[data-app="files"]',
  );
  if (!activeWin) return;

  // Don't interfere if an input/textarea is focused
  if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;

  if (e.ctrlKey || e.metaKey) {
    if (e.key === "c") {
      e.preventDefault();
      executeCopy(activeWin);
    } else if (e.key === "v") {
      e.preventDefault();
      executePaste(activeWin);
    } else if (e.key === "x") {
      e.preventDefault();
      executeCut(activeWin);
    } else if (e.key === "a") {
      // Select All
      e.preventDefault();
      const grid = activeWin.querySelector("#explorer-grid");
      if (grid) {
        const items = grid.querySelectorAll(".file-item");
        if (!activeWin.selectedNodes) activeWin.selectedNodes = new Set();
        items.forEach((item) => {
          activeWin.selectedNodes.add(item.dataset.path);
        });
        renderExplorer(activeWin, activeWin.dataset.currentPath);
      }
    }
  } else if (e.key === "Delete") {
    if (activeWin.selectedNodes && activeWin.selectedNodes.size > 0) {
      massDelete(activeWin);
    }
  }
});

// Marquee Selection logic
function initExplorerMarquee(win, grid) {
  let marquee = null;
  let startX = 0,
    startY = 0;
  let isDragging = false;
  let didDrag = false;

  grid.onmousedown = (e) => {
    if (e.button !== 0) return; // Left click only
    if (e.target !== grid) return;

    startX = e.clientX;
    startY = e.clientY;
    isDragging = true;
    didDrag = false;
    grid.dataset.wasDragging = "false";

    if (!e.ctrlKey && !e.shiftKey) {
      win.selectedNodes.clear();
      grid
        .querySelectorAll(".file-item")
        .forEach((item) => item.classList.remove("selected"));
    }

    marquee = document.createElement("div");
    marquee.className = "explorer-marquee";
    document.body.appendChild(marquee);
  };

  window.addEventListener("mousemove", (e) => {
    if (!isDragging || !marquee) return;
    didDrag = true;
    grid.dataset.wasDragging = "true";

    const x1 = Math.min(startX, e.clientX);
    const y1 = Math.min(startY, e.clientY);
    const x2 = Math.max(startX, e.clientX);
    const y2 = Math.max(startY, e.clientY);

    marquee.style.left = x1 + "px";
    marquee.style.top = y1 + "px";
    marquee.style.width = x2 - x1 + "px";
    marquee.style.height = y2 - y1 + "px";

    // Real-time selection highlighting
    // Cache bounding rects for performance during drag
    if (!grid.__cachedRects) {
      grid.__cachedRects = [];
      const items = grid.querySelectorAll(".file-item");
      items.forEach((item) => {
        grid.__cachedRects.push({
          element: item,
          rect: item.getBoundingClientRect(),
          path: item.dataset.path,
        });
      });
    }

    const rect = marquee.getBoundingClientRect();
    grid.__cachedRects.forEach((obj) => {
      const itemRect = obj.rect;
      const isOverlap = !(
        rect.right < itemRect.left ||
        rect.left > itemRect.right ||
        rect.bottom < itemRect.top ||
        rect.top > itemRect.bottom
      );

      if (isOverlap) {
        obj.element.classList.add("selected");
        win.selectedNodes.add(obj.path);
      } else if (!e.ctrlKey) {
        obj.element.classList.remove("selected");
        win.selectedNodes.delete(obj.path);
      }
    });
  });

  window.addEventListener("mouseup", () => {
    if (marquee) {
      marquee.remove();
      marquee = null;
      grid.__cachedRects = null; // Clear cache
      if (isDragging && didDrag) {
        // Prevent click event taking away selection
      }
      setTimeout(() => {
        if (grid) grid.dataset.wasDragging = "false";
      }, 0);
    }
    isDragging = false;
  });
}

function handleSmartPath(input, type) {
  let path = input.value.trim();
  if (!path) return;
  if (!path.startsWith("/")) path = "/" + path;

  const node = getVFSNode(path);
  const win = input.closest(".os-window");

  const saveLogic = () => {
    if (type === "txt") {
      const content = win.querySelector("#Notepad-textarea").value;
      saveFileAtPath(path, content, "txt");
    } else if (type === "drw") {
      const canvas = win.querySelector("#drawing-canvas");
      if (canvas) {
        const imageData = canvas.toDataURL("image/png");
        const drawingData = {
          imageData,
          width: canvas.width,
          height: canvas.height,
          timestamp: new Date().toISOString(),
        };
        saveFileAtPath(path, JSON.stringify(drawingData), "drw");
      }
    }
  };

  if (node && node.type === "file") {
    showOSModal({
      title: "File Exists",
      message: `The file "${path}" already exists. Do you want to load from it, or overwrite it with your current work?`,
      okText: "Replace",
      cancelText: "Cancel",
      extraBtnText: "Open/Load",
      onOk: saveLogic,
      onExtra: () => {
        if (type === "txt") openFileInNotepad(path, win);
        else if (type === "drw") openDrawingFile(path, win);
      },
      onCancel: () => {},
    });
  } else {
    saveLogic();
  }
}

function saveFileAtPath(path, content, type) {
  const parts = path.split("/").filter((p) => p);
  const filename = parts.pop();
  const dirPath = "/" + parts.join("/");

  const parent = getVFSNode(dirPath);
  if (parent && parent.type === "dir") {
    parent.children[filename] = {
      type: "file",
      content: content,
      fileType: type,
    };
    saveVFS();
    osToast(`Successfully saved to ${path}`, "ph-check-circle");
    document.querySelectorAll('.os-window[data-app="files"]').forEach((w) => {
      if (w.dataset.currentPath === dirPath) renderExplorer(w, dirPath);
    });
  } else {
    osAlert(`Directory ${dirPath} does not exist.`, "Error");
  }
}

function massRename(win) {
  osPrompt(
    `Rename ${win.selectedNodes.size} items to (e.g. "image"):`,
    "new_name",
    (baseName) => {
      if (!baseName) return;
      let counter = 1;
      const currentPath = win.dataset.currentPath;
      const parent = getVFSNode(currentPath);

      const selectedList = Array.from(win.selectedNodes);
      selectedList.forEach((path) => {
        const node = getVFSNode(path);
        const oldName = path.split("/").pop();
        const ext = oldName.includes(".")
          ? oldName.substring(oldName.lastIndexOf("."))
          : "";
        const newName = `${baseName} (${counter++})${ext}`;

        if (parent.children[oldName]) {
          parent.children[newName] = node;
          delete parent.children[oldName];
        }
      });

      win.selectedNodes.clear();
      saveVFS();
      renderExplorer(win, currentPath);
      osToast(`Renamed ${selectedList.length} items`, "ph-check");
    },
  );
}

function massDelete(win) {
  osConfirm(`Delete ${win.selectedNodes.size} items permanently?`, () => {
    const currentPath = win.dataset.currentPath;
    win.selectedNodes.forEach((path) => {
      const parts = path.split("/").filter((p) => p);
      const name = parts.pop();
      const parent = getVFSNode("/" + parts.join("/"));
      if (parent && parent.children[name]) delete parent.children[name];
    });
    win.selectedNodes.clear();
    saveVFS();
    renderExplorer(win, currentPath);
    osToast(`Deleted items`, "ph-trash");
  });
}

function massMove(win) {
  osToast(`Selected ${win.selectedNodes.size} items to move`, "ph-move");
  window.clipboardItems = Array.from(win.selectedNodes);
  window.clipboardAction = "move";
}

function executeMassMove(win) {
  if (!window.clipboardItems || window.clipboardItems.length === 0) return;
  const targetPath = win.dataset.currentPath;

  window.clipboardItems.forEach((sourcePath) => {
    moveVFSNode(sourcePath, targetPath);
  });

  window.clipboardItems = [];
  osToast("Moved items successfully", "ph-check-circle");
  // Refresh all explorers
  document.querySelectorAll('.os-window[data-app="files"]').forEach((w) => {
    renderExplorer(w, w.dataset.currentPath);
  });
}

function createNewFile(win) {
  const currentPath = win.dataset.currentPath || "/";
  osPrompt("Enter filename:", "new_file.txt", (filename) => {
    if (!filename) return;
    const node = getVFSNode(currentPath);
    if (node && node.type === "dir") {
      if (node.children[filename]) {
        osAlert("A file with that name already exists.", "Error");
        return;
      }
      node.children[filename] = { type: "file", content: "" };
      saveVFS();
      renderExplorer(win, currentPath);
      osToast(`Created file ${filename}`, "ph-file-plus");
    }
  });
}

function createNewFolder(win) {
  const currentPath = win.dataset.currentPath || "/";
  osPrompt("Enter folder name:", "New Folder", (name) => {
    if (!name) return;
    const node = getVFSNode(currentPath);
    if (node && node.type === "dir") {
      if (node.children[name]) {
        osAlert("A folder with that name already exists.", "Error");
        return;
      }
      node.children[name] = { type: "dir", children: {} };
      saveVFS();
      renderExplorer(win, currentPath);
      osToast(`Created folder ${name}`, "ph-folder-plus");
    }
  });
}

function renameVFSNode(win, path) {
  osPrompt("Enter new name:", path.split("/").pop(), (newName) => {
    if (!newName) return;
    const node = getVFSNode(path);
    const parts = path.split("/").filter((p) => p);
    const oldName = parts.pop();
    const parentPath = "/" + parts.join("/");
    const parent = getVFSNode(parentPath);
    if (parent && node) {
      if (parent.children[newName]) {
        osAlert("A file or folder with that name already exists.", "Error");
        return;
      }
      parent.children[newName] = node;
      delete parent.children[oldName];
      saveVFS();
      renderExplorer(win, win.dataset.currentPath);
      osToast(`Renamed to ${newName}`, "ph-check");
    }
  });
}

function deleteVFSNode(win, path) {
  osConfirm(`Are you sure you want to delete ${path.split("/").pop()}?`, () => {
    const parts = path.split("/").filter((p) => p);
    const name = parts.pop();
    const parentPath = "/" + parts.join("/");
    const parent = getVFSNode(parentPath);
    if (parent && parent.children[name]) {
      delete parent.children[name];
      saveVFS();
      renderExplorer(win, win.dataset.currentPath);
      osToast(`Deleted ${name}`, "ph-trash");
    }
  });
}

function duplicateVFSNode(win, path) {
  const node = getVFSNode(path);
  const parts = path.split("/").filter((p) => p);
  const name = parts.pop();
  const parentPath = "/" + parts.join("/");
  const parent = getVFSNode(parentPath);

  if (parent && node) {
    let newName = "copy of " + name;
    let counter = 1;
    while (parent.children[newName]) {
      newName = "copy of " + ++counter + name;
    }
    parent.children[newName] = JSON.parse(JSON.stringify(node));
    saveVFS();
    renderExplorer(win, win.dataset.currentPath);
    osToast(`Duplicated ${name}`, "ph-copy");
  }
}

// --- Custom UI Logic (Overriding Browser Defaults) ---
function osToast(message, icon = "ph-info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "os-toast";
  toast.innerHTML = `<i class="ph ${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showOSModal({
  title,
  message,
  showInput = false,
  inputPlaceholder = "",
  onOk,
  onCancel,
  okText = "OK",
  cancelText = "Cancel",
  extraBtnText = null,
  onExtra = null,
  isHTML = false,
}) {
  const overlay = document.getElementById("os-modal-overlay");
  const titleEl = document.getElementById("os-modal-title");
  const messageEl = document.getElementById("os-modal-message");
  const inputEl = document.getElementById("os-modal-input");
  const actionsEl = overlay.querySelector(".os-modal-actions");

  if (!overlay) return;

  titleEl.innerText = title;

  if (isHTML) {
    messageEl.innerHTML = message;
  } else {
    messageEl.innerText = message;
  }

  if (showInput) {
    inputEl.style.display = "block";
    inputEl.value = inputPlaceholder;
    setTimeout(() => inputEl.select(), 50);
  } else {
    inputEl.style.display = "none";
  }

  // Re-build buttons dynamically to prevent stale state and simplify extra buttons
  actionsEl.innerHTML = `
      <button id="os-modal-cancel" class="Notepad-btn">${cancelText}</button>
      ${extraBtnText ? `<button id="os-modal-extra" class="Notepad-btn">${extraBtnText}</button>` : ""}
      <button id="os-modal-ok" class="Notepad-btn primary">${okText}</button>
  `;

  const okBtn = document.getElementById("os-modal-ok");
  const cancelBtn = document.getElementById("os-modal-cancel");
  const extraBtn = document.getElementById("os-modal-extra");

  cancelBtn.style.display = onCancel ? "block" : "none";

  const cleanUp = () => {
    overlay.classList.remove("active");
  };

  okBtn.addEventListener("click", () => {
    const val = document.getElementById("os-modal-input").value;
    cleanUp();
    if (onOk) onOk(val);
  });

  cancelBtn.addEventListener("click", () => {
    cleanUp();
    if (onCancel) onCancel();
  });

  if (extraBtn) {
    extraBtn.addEventListener("click", () => {
      cleanUp();
      if (onExtra) onExtra();
    });
  }

  overlay.classList.add("active");
}

window.osAlert = (msg, title = "System") =>
  showOSModal({ title, message: msg });
window.osPrompt = (msg, def, onOk) =>
  showOSModal({
    title: "Prompt",
    message: msg,
    showInput: true,
    inputPlaceholder: def,
    onOk,
  });
window.osConfirm = (msg, onOk) =>
  showOSModal({ title: "Confirm", message: msg, onOk, onCancel: () => {} });

function changeFolderIcon(win, path) {
  const node = getVFSNode(path);
  if (!node || node.type !== "dir") return;

  // Create a simple icon picker modal
  let iconGridHTML = `
        <div id="icon-picker-grid" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-top: 15px; max-height: 200px; overflow-y: auto; padding: 5px;">
    `;

  for (let key in iconMap) {
    iconGridHTML += `
            <div class="icon-option" onclick="selectFolderIcon('${path}', '${iconMap[key]}')" 
                 style="cursor: pointer; padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); text-align: center; transition: all 0.2s;">
                <i class="ph ${iconMap[key]}" style="font-size: 24px;"></i>
            </div>
        `;
  }
  iconGridHTML += `</div>`;

  showOSModal({
    title: "Choose Folder Icon",
    message: "Select a custom icon for this folder:",
    onOk: () => {}, // Handled by inline clicks for faster UX
  });

  // Inject the grid into the modal message
  setTimeout(() => {
    const msgEl = document.getElementById("os-modal-message");
    if (msgEl) {
      msgEl.innerHTML = iconGridHTML;

      // Add hover styles dynamically
      const options = document.querySelectorAll(".icon-option");
      options.forEach((opt) => {
        opt.onmouseover = () => {
          opt.style.background = "var(--tint)";
          opt.style.borderColor = "var(--accent)";
        };
        opt.onmouseout = () => {
          opt.style.background = "transparent";
          opt.style.borderColor = "rgba(255,255,255,0.1)";
        };
      });
    }
  }, 50);
}

window.selectFolderIcon = (path, iconClass) => {
  const node = getVFSNode(path);
  if (node) {
    node.icon = iconClass;
    saveVFS();
    document.querySelectorAll('.os-window[data-app="files"]').forEach((win) => {
      renderExplorer(win, win.dataset.currentPath);
    });
    osToast("Folder icon updated!", "ph-palette");
    document.getElementById("os-modal-overlay").classList.remove("active");
  }
};

// Load VFS from IndexedDB (1 GB storage) after DOM and helpers are ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initVFS);
} else {
  initVFS();
}

// Global Message Listener for proxy iframes
window.addEventListener("message", (e) => {
  if (e.data && e.data.type === "browser-navigate") {
    const iframes = document.querySelectorAll(
      '.os-window[data-app="browser"] iframe',
    );
    let targetWin = null;
    iframes.forEach((iframe) => {
      if (iframe.contentWindow === e.source) {
        targetWin = iframe.closest(".os-window");
      }
    });
    if (targetWin) {
      const input = targetWin.querySelector(".browser-address-bar input");
      if (input) {
        input.value = e.data.url;
        navigateBrowser(input);
      }
    }
  }
});

// --- System Info Handlers & Overlays ---
function toggleOverlay(id) {
  const overlay = document.getElementById(id);
  const wasActive = overlay.classList.contains("active");

  hideOverlays();

  if (!wasActive) {
    overlay.classList.add("active");
    if (id === "logo-overlay") updateLogoOverlay();
    if (id === "status-overlay") updateStatusOverlay();
  }
}

function hideOverlays() {
  document
    .querySelectorAll(".topbar-overlay")
    .forEach((el) => el.classList.remove("active"));
}

function updateLogoOverlay() {
  const storageEl = document.getElementById("overlay-storage");
  if (storageEl) {
    const usage = calculateStorageUsage();
    storageEl.innerText = `${usage.totalMB.toFixed(2)} MB / ${VFS_QUOTA_MB} MB`;
  }
}

function updateStatusOverlay() {
  const cpuEl = document.getElementById("overlay-cpu");
  const dateEl = document.getElementById("overlay-date");
  const longDateEl = document.getElementById("overlay-long-date");

  if (cpuEl) cpuEl.innerText = document.getElementById("cpu-usage").innerText;

  const d = new Date();
  if (dateEl)
    dateEl.innerText = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  if (longDateEl)
    longDateEl.innerText = d.toLocaleDateString(undefined, { weekday: "long" });
}

// Global click to close overlays
document.addEventListener("mousedown", (e) => {
  if (
    !e.target.closest(".topbar-overlay") &&
    !e.target.closest(".topbar-left") &&
    !e.target.closest(".topbar-right")
  ) {
    hideOverlays();
  }
});

// Redirect old function names to prevent reference errors if any remain
function showSystemInfo() {
  toggleOverlay("logo-overlay");
}

// --- Music Player Logic (Apple Music Style) ---
let musicLibrary = []; // Cache of all tracks in VFS

function initMusicPlayer(win) {
  const audio = win.querySelector("#main-audio-element");
  const mainContent = win.querySelector("#music-main-content");
  const sidebarPlaylists = win.querySelector("#sidebar-playlists-list");
  const rightPanel = win.querySelector("#music-right-panel");
  const panelTitle = win.querySelector("#panel-title");
  const panelContent = win.querySelector("#panel-content");

  // Header Elements
  const playPauseIcon = win.querySelector("#play-pause-icon");
  const titleEl = win.querySelector("#music-title");
  const artistEl = win.querySelector("#music-artist");
  const artImg = win.querySelector("#music-art-img");
  const artPlaceholder = win.querySelector("#music-art-placeholder");
  const progressBar = win.querySelector("#music-progress");
  const currentTimeEl = win.querySelector("#music-current-time");
  const durationEl = win.querySelector("#music-duration");
  const volumeSlider = win.querySelector(".music-volume-slider");

  // Player State
  win.currentTrack = null;
  win.queue = [];
  win.history = [];
  win.currentView = "listen-now";
  win.activeSourceTracks = musicLibrary; // Current tracks to play through next/shuffle
  win.playlists = JSON.parse(
    localStorage.getItem("robbieos_music_playlists") || "[]",
  );

  // Refresh Track Metadata function
  const updatePlayerUI = (track) => {
    if (!track) return;
    titleEl.textContent = track.title || track.name;
    artistEl.textContent = track.artist || "Unknown Artist";

    if (track.cover) {
      artImg.src = track.cover;
      artImg.style.display = "block";
      artPlaceholder.style.display = "none";
    } else {
      artImg.style.display = "none";
      artPlaceholder.style.display = "flex";
    }

    if (win.currentView === "library-songs") renderSongsView(win);
    else if (win.currentView.startsWith("playlist:")) {
      const plId = win.currentView.split(":")[1];
      renderPlaylistDetail(win, plId);
    } else if (win.currentView === "browse") {
      const browseList = win.querySelector("#browse-song-list");
      if (browseList) {
        browseList.querySelectorAll(".song-row").forEach((row) => {
          if (row.dataset.path === track.path) {
            row.classList.add("playing");
          } else {
            row.classList.remove("playing");
          }
        });
      }
    }
    updateQueueUI();
  };

  const playTrack = async (track, fromQueue = false, sourceContext = null) => {
    if (!track) return;

    if (sourceContext) {
      win.activeSourceTracks = sourceContext;
      win.shufflePool = []; // Invalidate pool if context changes
    }

    // Add to history if playing new song
    if (win.currentTrack && !fromQueue) {
      win.history.push(win.currentTrack);
    }

    win.currentTrack = track;
    audio.src = track.content;
    audio.play().catch((e) => console.error("Playback failed:", e));
    playPauseIcon.className = "ph-fill ph-pause";

    updatePlayerUI(track);
    osToast(`Playing: ${track.title || track.name}`, "ph-music-notes");

    // Update lyrics background if open
    if (
      rightPanel.classList.contains("active") &&
      panelTitle.textContent === "Lyrics"
    ) {
      const bgImg = win.querySelector("#lyrics-bg-img");
      const bgContainer = win.querySelector(".lyrics-bg");
      if (track.cover) {
        bgImg.src = track.cover;
        bgContainer.classList.add("active");
      } else {
        bgContainer.classList.remove("active");
      }
      updateLyricsUI();
    }

    // Attempt to extract metadata if not already present
    if (!track.metadataLoaded) {
      await extractTrackMetadata(track);
      updatePlayerUI(track);
    }
  };

  const togglePlay = () => {
    if (!win.currentTrack) {
      if (win.activeSourceTracks && win.activeSourceTracks.length > 0) {
        playTrack(win.activeSourceTracks[0]);
      } else if (musicLibrary.length > 0) {
        playTrack(musicLibrary[0]);
      }
      return;
    }
    if (audio.paused) {
      audio.play();
      playPauseIcon.className = "ph-fill ph-pause";
    } else {
      audio.pause();
      playPauseIcon.className = "ph-fill ph-play";
    }
  };

  audio.ontimeupdate = () => {
    if (!audio.duration) return;
    const progress = (audio.currentTime / audio.duration) * 100;
    progressBar.style.width = `${progress}%`;
    currentTimeEl.textContent = formatTime(audio.currentTime);
    durationEl.textContent = formatTime(audio.duration);

    // Sync Lyrics
    if (
      rightPanel.classList.contains("active") &&
      panelTitle.textContent === "Lyrics" &&
      win.currentLyrics
    ) {
      let activeIdx = -1;
      for (let i = 0; i < win.currentLyrics.length; i++) {
        if (audio.currentTime >= win.currentLyrics[i].time) {
          activeIdx = i;
        } else {
          break;
        }
      }

      if (activeIdx !== -1 && activeIdx !== win.lastActiveLyricIdx) {
        win.lastActiveLyricIdx = activeIdx;
        const lines = panelContent.querySelectorAll(".lyric-line");
        const lyricsContainer = panelContent.querySelector(".lyrics-container");

        lines.forEach((l, idx) => {
          if (idx === activeIdx) {
            l.classList.add("active");
            if (lyricsContainer) {
              const containerHeight = lyricsContainer.clientHeight;
              const lineTop = l.offsetTop;
              const lineWeight = l.clientHeight;
              lyricsContainer.scrollTo({
                top: lineTop - containerHeight / 2 + lineWeight / 2,
                behavior: "smooth",
              });
            }
          } else {
            l.classList.remove("active");
          }
        });
      }
    }
  };

  audio.onended = () => {
    win.nextTrack();
  };

  win.nextTrack = () => {
    if (win.queue.length > 0) {
      const next = win.queue.shift();
      playTrack(next, true);
    } else if (win.isShuffle && win.activeSourceTracks.length > 1) {
      if (!win.shufflePool || win.shufflePool.length === 0) {
        win.shufflePool = [...win.activeSourceTracks].filter(
          (t) => t.path !== win.currentTrack?.path,
        );
        if (win.shufflePool.length === 0)
          win.shufflePool = [...win.activeSourceTracks];
        // Fisher-Yates shuffle
        for (let i = win.shufflePool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [win.shufflePool[i], win.shufflePool[j]] = [
            win.shufflePool[j],
            win.shufflePool[i],
          ];
        }
      }
      const next = win.shufflePool.pop();
      playTrack(next);
    } else if (win.activeSourceTracks.length > 0) {
      // Simple linear next from current context
      const idx = win.activeSourceTracks.findIndex(
        (t) => t.path === win.currentTrack?.path,
      );
      if (idx !== -1 && idx < win.activeSourceTracks.length - 1) {
        playTrack(win.activeSourceTracks[idx + 1]);
      } else {
        playTrack(win.activeSourceTracks[0]); // Loop to start
      }
    }
  };

  win.prevTrack = () => {
    if (win.history.length > 0) {
      const prev = win.history.pop();
      playTrack(prev, true);
    } else {
      audio.currentTime = 0;
    }
  };

  win.togglePlay = togglePlay;

  win.toggleShuffle = () => {
    win.isShuffle = !win.isShuffle;
    win.shufflePool = [];
    win
      .querySelector("#shuffle-icon")
      .classList.toggle("active", win.isShuffle);
    osToast(`Shuffle ${win.isShuffle ? "On" : "Off"}`, "ph-shuffle");
  };

  // View Controllers
  win.switchView = (view, btn) => {
    win.currentView = view;
    // Update active state in sidebar
    win
      .querySelectorAll(".sidebar-item")
      .forEach((item) => item.classList.remove("active"));
    if (btn) btn.classList.add("active");

    mainContent.innerHTML =
      '<div class="view-loading"><i class="ph ph-spinner ph-spin"></i></div>';

    setTimeout(() => {
      switch (view) {
        case "library-songs":
          renderSongsView(win);
          break;
        case "library-albums":
          renderAlbumsView(win);
          break;
        case "library-artists":
          renderArtistsView(win);
          break;
        case "browse":
          renderBrowseView(win);
          break;
        case "listen-now":
          renderLibraryGrid(win);
          break;
        default:
          if (view.startsWith("playlist:")) {
            const playlistId = view.split(":")[1];
            renderPlaylistDetail(win, playlistId);
          } else {
            renderLibraryGrid(win);
          }
      }
    }, 300);
  };

  win.togglePanel = (type, btn) => {
    if (
      type === null ||
      (rightPanel.classList.contains("active") &&
        panelTitle.textContent.toLowerCase() === type)
    ) {
      rightPanel.classList.remove("active");
      rightPanel.className = "music-right-panel";
      // Hide the immersive background if it was active
      const bgContainer = win.querySelector(".lyrics-bg");
      if (bgContainer) bgContainer.classList.remove("active");
      return;
    }

    rightPanel.classList.add("active");
    panelTitle.textContent = type.charAt(0).toUpperCase() + type.slice(1);

    // Clear old state
    rightPanel.classList.remove("lyrics-mode", "queue-mode");

    if (type === "queue") {
      rightPanel.classList.add("queue-mode");
      const bgContainer = win.querySelector(".lyrics-bg");
      if (bgContainer) bgContainer.classList.remove("active");
      updateQueueUI();
    } else if (type === "lyrics") {
      rightPanel.classList.add("lyrics-mode");
      updateLyricsUI();
    }
  };

  const applyLyricsBackground = () => {
    const bgImg = win.querySelector("#lyrics-bg-img");
    const bgContainer = win.querySelector(".lyrics-bg");
    if (win.currentTrack && win.currentTrack.cover) {
      bgImg.src = win.currentTrack.cover;
      bgContainer.classList.add("active");
    } else {
      bgContainer.classList.remove("active");
    }
  };

  const displayCachedLyrics = () => {
    applyLyricsBackground();
    const container = document.createElement("div");
    container.className = "lyrics-container";
    if (!win.currentLyrics || win.currentLyrics.length === 0) {
      panelContent.innerHTML =
        '<div class="lyrics-container"><div class="lyric-line">Lyrics are unavailable for this track.</div></div>';
      return;
    }
    win.currentLyrics.forEach((l) => {
      const lineEl = document.createElement("div");
      lineEl.className = "lyric-line";
      lineEl.textContent = l.text;
      if (l.time !== -1) {
        lineEl.onclick = () => {
          audio.currentTime = l.time;
          audio.play();
        };
      }
      container.appendChild(lineEl);
    });
    panelContent.innerHTML = "";
    panelContent.appendChild(container);

    const scrollLyricToCenter = (lineEl) => {
      if (!lineEl) return;
      const lyricsContainer = lineEl.parentElement;
      if (!lyricsContainer) return;
      const containerHeight = lyricsContainer.clientHeight;
      const lineTop = lineEl.offsetTop;
      const lineWeight = lineEl.clientHeight;
      lyricsContainer.scrollTo({
        top: lineTop - containerHeight / 2 + lineWeight / 2,
        behavior: "smooth",
      });
    };

    // Scroll active lyric into view if any
    if (win.lastActiveLyricIdx !== undefined && win.lastActiveLyricIdx !== -1) {
      setTimeout(() => {
        const lines = panelContent.querySelectorAll(".lyric-line");
        if (lines[win.lastActiveLyricIdx]) {
          lines[win.lastActiveLyricIdx].classList.add("active");
          scrollLyricToCenter(lines[win.lastActiveLyricIdx]);
        }
      }, 50);
    }
  };

  const updateLyricsUI = async () => {
    if (panelTitle.textContent !== "Lyrics" || !win.currentTrack) return;

    // Check if lyrics already loaded for this track to avoid refetching same track
    if (win.currentTrack.path === win.lastLyricsPath && win.currentLyrics) {
      displayCachedLyrics();
      return;
    }

    panelContent.innerHTML = `
            <div class="lyrics-container">
                <div class="lyric-line active">Looking for lyrics...</div>
            </div>
        `;
    applyLyricsBackground();

    const track = win.currentTrack;
    win.lastLyricsPath = track.path;
    win.lastActiveLyricIdx = -1;

    try {
      const artist = encodeURIComponent(track.artist || "");
      const title = encodeURIComponent(track.title || track.name || "");
      // LRCLIB Get
      const response = await fetch(
        `https://lrclib.net/api/get?artist_name=${artist}&track_name=${title}`,
      );

      if (!response.ok) {
        // Try Search
        const searchRes = await fetch(
          `https://lrclib.net/api/search?q=${artist}+${title}`,
        );
        const searchData = await searchRes.json();
        if (searchData && searchData.length > 0) {
          renderLyrics(searchData[0]);
          return;
        }
        throw new Error("No lyrics found");
      }

      const data = await response.json();
      renderLyrics(data);
    } catch (e) {
      panelContent.innerHTML = `
            <div class="lyrics-container">
                <div class="lyric-line" style="opacity: 0.5;">No lyrics found.</div>
                <div class="lyric-line" style="font-size: 16px; opacity: 0.3;">"${track.title || track.name}"</div>
            </div>
        `;
      applyLyricsBackground();
      win.currentLyrics = [];
    }
  };

  const renderLyrics = (data) => {
    win.currentLyrics = [];

    if (data.syncedLyrics) {
      const lines = data.syncedLyrics.split("\n");
      lines.forEach((line) => {
        const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
        if (match) {
          const mins = parseInt(match[1]);
          const secs = parseFloat(match[2]);
          const time = mins * 60 + secs;
          const text = match[3].trim();
          if (text) {
            win.currentLyrics.push({ time, text });
          }
        }
      });
    } else if (data.plainLyrics) {
      const lines = data.plainLyrics.split("\n");
      lines.forEach((line) => {
        if (line.trim())
          win.currentLyrics.push({ time: -1, text: line.trim() });
      });
    }

    displayCachedLyrics();
  };

  const updateQueueUI = () => {
    if (panelTitle.textContent !== "Queue") return;
    panelContent.innerHTML = "";
    if (win.queue.length === 0) {
      panelContent.innerHTML =
        '<p style="opacity:0.5; font-size:12px;">Queue is empty.</p>';
      return;
    }
    win.queue.forEach((track, idx) => {
      const el = document.createElement("div");
      el.className = "queue-item";
      el.innerHTML = `
                <div class="queue-art" style="background:${track.cover ? "url(" + track.cover + ") center/cover" : "var(--accent)"}"></div>
                <div class="queue-info">
                  <div class="music-track-title" style="font-size:12px;">${track.title || track.name}</div>
                  <div class="music-track-artist" style="font-size:10px;">${track.artist || "Unknown"}</div>
                </div>
                <button class="music-btn-icon small remove-from-queue-btn" title="Remove from Queue">
                  <i class="ph ph-trash"></i>
                </button>
            `;

      const removeBtn = el.querySelector(".remove-from-queue-btn");
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        win.queue.splice(idx, 1);
        updateQueueUI();
        win.dispatchEvent(new CustomEvent("queueChanged"));
      });

      panelContent.appendChild(el);
    });
  };

  win.playTrack = playTrack; // Expose for external use

  // Scan and Initial View
  scanMusicLibrary().then(() => {
    renderLibraryGrid(win);
    renderSidebarPlaylists(win);
  });

  // Listener for Queue changes
  win.addEventListener("queueChanged", () => {
    if (
      rightPanel.classList.contains("active") &&
      panelTitle.textContent === "Queue"
    ) {
      updateQueueUI();
    }
  });

  // Listener for Library Refresh (imports)
  win.addEventListener("libraryRefreshed", () => {
    win.switchView(win.currentView);
    osToast("Library Synced", "ph-arrows-clockwise");
  });
}

async function scanMusicLibrary() {
  musicLibrary = [];
  function traverse(node, path) {
    if (node.type === "dir") {
      for (const name in node.children) {
        traverse(node.children[name], path + (path === "/" ? "" : "/") + name);
      }
    } else if (node.type === "file" && isMusicFile(path)) {
      musicLibrary.push({
        name: path.split("/").pop(),
        path: path,
        content: node.content,
        metadataLoaded: false,
      });
    }
  }
  traverse(vfs, "/");

  // Await metadata extraction for all discovered local tracks
  await Promise.all(musicLibrary.map((t) => extractTrackMetadata(t)));
}

async function extractTrackMetadata(track) {
  if (!track.content || !window.jsmediatags) return;

  return new Promise((resolve) => {
    fetch(track.content)
      .then((res) => res.blob())
      .then((blob) => {
        const audio = new Audio();
        const objectUrl = URL.createObjectURL(blob);
        audio.src = objectUrl;

        const finishProcessing = () => {
          URL.revokeObjectURL(objectUrl);
          track.metadataLoaded = true;
          resolve();
        };

        audio.onloadedmetadata = () => {
          if (
            audio.duration &&
            audio.duration !== Infinity &&
            !isNaN(audio.duration)
          ) {
            const mins = Math.floor(audio.duration / 60);
            const secs = Math.floor(audio.duration % 60)
              .toString()
              .padStart(2, "0");
            track.duration = `${mins}:${secs}`;
          } else {
            track.duration = "--:--";
          }

          window.jsmediatags.read(blob, {
            onSuccess: function (tag) {
              const tags = tag.tags || {};
              track.title = tags.title || track.name;
              track.artist = tags.artist || "Unknown Artist";
              track.album = tags.album || "Unknown Album";

              if (tags.picture) {
                const { data, format } = tags.picture;
                let base64String = "";
                for (let i = 0; i < data.length; i++) {
                  base64String += String.fromCharCode(data[i]);
                }
                track.cover = `data:${format};base64,${window.btoa(base64String)}`;
              }
              finishProcessing();
            },
            onError: function (error) {
              track.title = track.name;
              finishProcessing();
            },
          });
        };

        audio.onerror = () => {
          track.title = track.name;
          track.duration = "--:--";
          finishProcessing();
        };
      })
      .catch((err) => {
        track.title = track.name;
        track.duration = "--:--";
        track.metadataLoaded = true;
        resolve();
      });
  });
}

function renderLibraryGrid(win) {
  const container = win.querySelector("#music-main-content");

  if (musicLibrary.length === 0) {
    container.innerHTML = `
      <h1 style="margin-bottom: 25px; font-weight: 700;">Listen Now</h1>
      <div style="text-align:center; padding: 50px; opacity: 0.5;">
        <i class="ph ph-music-notes" style="font-size: 48px; margin-bottom: 20px; display: block;"></i>
        <p>No music found. Be sure to click on refresh button to sync.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <h1 style="margin-bottom: 25px; font-weight: 700;">Listen Now</h1>
    <div class="music-grid"></div>
  `;
  const grid = container.querySelector(".music-grid");

  // Show all music in a grid
  musicLibrary.forEach((track) => {
    const item = document.createElement("div");
    item.className = "grid-item";
    item.innerHTML = `
      <div class="grid-art">
        ${track.cover ? `<img src="${track.cover}">` : `<div class="music-art-placeholder"><i class="ph-fill ph-music-note"></i></div>`}
      </div>
      <div class="grid-title">${track.title || track.name}</div>
      <div class="grid-subtitle">${track.artist || "Unknown Artist"}</div>
    `;
    item.onclick = () => window.playTrackInMusic(win, track, musicLibrary);
    grid.appendChild(item);
  });
}

async function renderBrowseView(win) {
  const container = win.querySelector("#music-main-content");
  container.innerHTML = `
    <h1 style="margin-bottom: 25px; font-weight: 700;">Discover</h1>
    <div style="text-align:center; padding: 50px; opacity: 0.5;">
        <i class="ph ph-spinner ph-spin" style="font-size: 32px; margin-bottom: 20px; display: block;"></i>
        <p>Loading global hits...</p>
    </div>
  `;

  try {
    const res = await fetch(
      "https://api.audius.co/v1/tracks/trending?app_name=robbieos",
    );
    const data = await res.json();

    // Map Audius responses to RobbieOS track format
    let browseTracks = (data.data || [])
      .map((r) => ({
        path: `https://api.audius.co/v1/tracks/${r.id}/stream?app_name=robbieos`,
        content: `https://api.audius.co/v1/tracks/${r.id}/stream?app_name=robbieos`,
        title: r.title,
        artist: r.user?.name || "Unknown Artist",
        album: "Audius",
        cover: r.artwork
          ? r.artwork["480x480"] || r.artwork["150x150"] || null
          : null,
        duration: r.duration
          ? `${Math.floor(r.duration / 60)}:${Math.floor(r.duration % 60)
              .toString()
              .padStart(2, "0")}`
          : "--:--",
        metadataLoaded: true,
        isOnline: true,
      }))
      .filter((t) => t.content);

    const renderTrackList = (tracks) => {
      container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 25px;">
          <div>
            <h1 style="font-weight: 700;">Discover</h1>
            <div style="opacity:0.6; font-size:14px; margin-top:5px;">Full tracks supplied by Audius Open API</div>
          </div>
          <div style="position:relative; width: 200px;">
            <input type="text" id="browse-search-input" placeholder="Search artists, songs..." style="width:100%; padding:8px 30px 8px 12px; border-radius:15px; border:none; background:rgba(255,255,255,0.1); color:white; font-size:12px;">
            <i class="ph ph-magnifying-glass" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); opacity:0.5;"></i>
          </div>
        </div>
        <div class="song-list" id="browse-song-list">
          <div class="song-row" style="font-weight: 600; font-size: 11px; opacity: 0.5; border-bottom: 1px solid rgba(255,255,255,0.05); margin-bottom: 10px; cursor: default;">
            <div class="song-cell">#</div>
            <div class="song-cell">TITLE</div>
            <div class="song-cell">ARTIST</div>
            <div class="song-cell">ALBUM</div>
            <div class="song-cell"><i class="ph ph-clock"></i></div>
            <div class="song-cell"></div>
          </div>
        </div>
      `;
      const list = container.querySelector("#browse-song-list");
      tracks.forEach((track, i) => {
        const row = document.createElement("div");
        row.className = `song-row ${win.currentTrack?.path === track.path ? "playing" : ""}`;
        row.dataset.path = track.path;
        row.innerHTML = `
          <div class="song-cell">${i + 1}</div>
          <div class="song-cell" style="display:flex; align-items:center; gap:10px;">
            <div style="width:24px; height:24px; min-width:24px; min-height:24px; flex-shrink:0; border-radius:4px; background:${track.cover ? "url(" + track.cover + ") center/cover" : "var(--accent)"}"></div>
            <span>${track.title || track.name}</span>
          </div>
          <div class="song-cell">${track.artist || "Unknown Artist"}</div>
          <div class="song-cell">${track.album || "-"}</div>
          <div class="song-cell">${track.duration || "--:--"}</div>
          <div class="song-cell" style="display: flex; gap: 4px; justify-content: flex-end;">
            <button class="music-btn-icon small add-to-queue-btn" title="Add to Queue" onclick="event.stopPropagation(); window.addRemoteMusicToQueue(this, '${encodeURIComponent(JSON.stringify(track))}')"><i class="ph ph-plus"></i></button>
          </div>
        `;
        row.onclick = () => window.playTrackInMusic(win, track, tracks);
        list.appendChild(row);
      });

      // Setup Search Logic
      const searchInput = container.querySelector("#browse-search-input");
      let searchTimeout;
      searchInput.addEventListener("input", (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
          const query = e.target.value.trim();
          if (!query) {
            renderTrackList(browseTracks); // reset to original
            return;
          }

          list.innerHTML =
            '<div style="text-align:center; padding: 20px; opacity:0.5;"><i class="ph ph-spinner ph-spin" style="font-size: 24px;"></i></div>';
          try {
            const res = await fetch(
              `https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=robbieos`,
            );
            const d = await res.json();
            const searchTracks = (d.data || [])
              .map((r) => ({
                path: `https://api.audius.co/v1/tracks/${r.id}/stream?app_name=robbieos`,
                content: `https://api.audius.co/v1/tracks/${r.id}/stream?app_name=robbieos`,
                title: r.title,
                artist: r.user?.name || "Unknown Artist",
                album: "Audius",
                cover: r.artwork
                  ? r.artwork["480x480"] || r.artwork["150x150"] || null
                  : null,
                duration: r.duration
                  ? `${Math.floor(r.duration / 60)}:${Math.floor(
                      r.duration % 60,
                    )
                      .toString()
                      .padStart(2, "0")}`
                  : "--:--",
                metadataLoaded: true,
                isOnline: true,
              }))
              .filter((t) => t.content);
            renderTrackList(searchTracks);
            // Re-apply value after re-render so user doesn't lose focus/cursor
            const newInput = container.querySelector("#browse-search-input");
            newInput.value = query;
            newInput.focus();
            newInput.setSelectionRange(query.length, query.length);
          } catch (e) {
            list.innerHTML =
              '<div style="text-align:center; padding: 20px; opacity:0.5;">Search failed</div>';
          }
        }, 800);
      });
    };

    renderTrackList(browseTracks);
  } catch (error) {
    container.innerHTML = `
      <h1 style="margin-bottom: 25px; font-weight: 700;">Discover</h1>
      <div style="text-align:center; padding: 50px; opacity: 0.5;">
        <i class="ph ph-wifi-slash" style="font-size: 48px; margin-bottom: 20px; display: block;"></i>
        <p>Could not load online library. Check your connection.</p>
      </div>
    `;
  }
}

function renderSongsView(win, targetTracks = null) {
  const container = win.querySelector("#music-main-content");
  const tracksToRender = targetTracks || musicLibrary;

  if (tracksToRender.length === 0) {
    container.innerHTML = `
      <h1 style="margin-bottom: 25px; font-weight: 700;">Songs</h1>
      <div style="text-align:center; padding: 50px; opacity: 0.5;">
        <i class="ph ph-music-notes" style="font-size: 48px; margin-bottom: 20px; display: block;"></i>
        <p>No music found. Be sure to click on refresh button to sync.</p>
      </div>
    `;
    return;
  }

  const renderTrackList = (tracks) => {
    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 25px;">
        <h1 style="font-weight: 700; margin: 0;">${targetTracks ? targetTracks[0]?.album || targetTracks[0]?.artist : "Songs"}</h1>
        <div style="position:relative; width: 200px;">
          <input type="text" id="library-search-input" placeholder="Search library..." style="width:100%; padding:8px 30px 8px 12px; border-radius:15px; border:none; background:rgba(255,255,255,0.1); color:white; font-size:12px;">
          <i class="ph ph-magnifying-glass" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); opacity:0.5;"></i>
        </div>
      </div>
      <div class="song-list" id="library-song-list">
        <div class="song-row" style="font-weight: 600; font-size: 11px; opacity: 0.5; border-bottom: 1px solid rgba(255,255,255,0.05); margin-bottom: 10px; cursor: default;">
          <div class="song-cell">#</div>
          <div class="song-cell">TITLE</div>
          <div class="song-cell">ARTIST</div>
          <div class="song-cell">ALBUM</div>
          <div class="song-cell"><i class="ph ph-clock"></i></div>
          <div class="song-cell"></div>
        </div>
      </div>
    `;

    const list = container.querySelector("#library-song-list");
    tracks.forEach((track, i) => {
      const row = document.createElement("div");
      row.className = `song-row ${win.currentTrack?.path === track.path ? "playing" : ""}`;
      row.innerHTML = `
        <div class="song-cell">${i + 1}</div>
        <div class="song-cell" style="display:flex; align-items:center; gap:10px;">
          <div style="width:24px; height:24px; min-width:24px; min-height:24px; flex-shrink:0; border-radius:4px; background:${track.cover ? "url(" + track.cover + ") center/cover" : "var(--accent)"}"></div>
          <span>${track.title || track.name}</span>
        </div>
        <div class="song-cell">${track.artist || "Unknown Artist"}</div>
        <div class="song-cell">${track.album || "-"}</div>
        <div class="song-cell">${track.duration || "--:--"}</div>
        <div class="song-cell" style="display: flex; gap: 4px; justify-content: flex-end;">
          <button class="music-btn-icon small add-to-queue-btn" title="Add to Queue" onclick="event.stopPropagation(); window.addMusicToQueue(this, '${track.path.replace(/'/g, "\\'")}')"><i class="ph ph-plus"></i></button>
          <button class="music-btn-icon small add-to-playlist-btn" title="Add to Playlist" onclick="event.stopPropagation(); window.promptAddToPlaylist(event, this, '${track.path.replace(/'/g, "\\'")}')"><i class="ph ph-list-plus"></i></button>
        </div>
      `;
      row.onclick = () => window.playTrackInMusic(win, track, tracks);
      list.appendChild(row);
    });

    const searchInput = container.querySelector("#library-search-input");
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase().trim();
      const filtered = tracksToRender.filter(
        (t) =>
          (t.title || t.name || "").toLowerCase().includes(query) ||
          (t.artist || "").toLowerCase().includes(query) ||
          (t.album || "").toLowerCase().includes(query),
      );
      renderTrackList(filtered);

      const newInput = container.querySelector("#library-search-input");
      newInput.value = query;
      newInput.focus();
    });
  };

  renderTrackList(tracksToRender);
}

function renderAlbumsView(win) {
  const container = win.querySelector("#music-main-content");

  if (musicLibrary.length === 0) {
    container.innerHTML = `
      <h1 style="margin-bottom: 25px; font-weight: 700;">Albums</h1>
        <div style="text-align:center; padding: 50px; opacity: 0.5;">
          <i class="ph ph-record" style="font-size: 48px; margin-bottom: 20px; display: block;"></i>
          <p>No albums found.</p>
        </div>
    `;
    return;
  }

  const albums = [
    ...new Set(musicLibrary.map((t) => t.album || "Unknown Album")),
  ];

  container.innerHTML = `
      <h1 style="margin-bottom: 25px; font-weight: 700;">Albums</h1>
        <div class="music-grid"></div>
    `;
  const grid = container.querySelector(".music-grid");

  albums.forEach((album) => {
    const albumTracks = musicLibrary.filter(
      (t) => (t.album || "Unknown Album") === album,
    );
    const coverTrack = albumTracks.find((t) => t.cover);

    const item = document.createElement("div");
    item.className = "grid-item";
    item.innerHTML = `
      <div class="grid-art">
        ${coverTrack ? `<img src="${coverTrack.cover}">` : `<div class="music-art-placeholder"><i class="ph-fill ph-record"></i></div>`}
      </div>
      <div class="grid-title">${album}</div>
      <div class="grid-subtitle">${albumTracks.length} Songs</div>
    `;
    item.onclick = () => {
      renderSongsView(win, albumTracks);
    };
    grid.appendChild(item);
  });
}

function renderArtistsView(win) {
  const container = win.querySelector("#music-main-content");

  if (musicLibrary.length === 0) {
    container.innerHTML = `
      <h1 style="margin-bottom: 25px; font-weight: 700;">Artists</h1>
        <div style="text-align:center; padding: 50px; opacity: 0.5;">
          <i class="ph ph-microphone-stage" style="font-size: 48px; margin-bottom: 20px; display: block;"></i>
          <p>No artists found.</p>
        </div>
    `;
    return;
  }

  const artists = [
    ...new Set(musicLibrary.map((t) => t.artist || "Unknown Artist")),
  ];

  container.innerHTML = `
      <h1 style="margin-bottom: 25px; font-weight: 700;">Artists</h1>
        <div class="music-grid"></div>
    `;
  const grid = container.querySelector(".music-grid");
  grid.innerHTML = ""; // Clear loading

  artists.forEach((artist) => {
    const artistTracks = musicLibrary.filter(
      (t) => (t.artist || "Unknown Artist") === artist,
    );
    const item = document.createElement("div");
    item.className = "grid-item";
    item.innerHTML = `
      <div class="grid-art" style="border-radius: 50%;">
        <div class="music-art-placeholder" style="background:#444;"><i class="ph-fill ph-user"></i></div>
      </div>
      <div class="grid-title" style="text-align:center;">${artist}</div>
    `;
    item.onclick = () => {
      renderSongsView(win, artistTracks);
    };
    container.querySelector(".music-grid").appendChild(item);
  });
}

function renderPlaylistDetail(win, plId) {
  const playlist = win.playlists.find((p) => p.id === plId);
  if (!playlist) return;

  const container = win.querySelector("#music-main-content");
  const plImage = playlist.image || null;
  container.innerHTML = `
      <div style="display:flex; gap:30px; margin-bottom:40px;">
        <div onclick="window.changeMusicPlaylistImage(this, '${plId}')" style="width:200px; height:200px; border-radius:12px; background:${plImage ? "url(" + plImage + ") center/cover" : "rgba(255,255,255,0.08)"}; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:60px; color:#fff; box-shadow:0 10px 30px rgba(0,0,0,0.3); overflow:hidden;">
            ${plImage ? "" : '<i class="ph ph-plus" style="opacity:0.3;"></i>'}
        </div>
        <div style="display:flex; flex-direction:column; justify-content:flex-end;">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                <div style="font-size:12px; font-weight:700;">PLAYLIST</div>
                <div style="display:flex; gap:6px;">
                    <button class="music-btn-icon small" title="Rename Playlist" onclick="event.stopPropagation(); window.renameMusicPlaylist(this, '${plId}')"><i class="ph ph-pencil-simple"></i></button>
                    <button class="music-btn-icon small" title="Delete Playlist" onclick="event.stopPropagation(); window.deleteMusicPlaylist(this, '${plId}')"><i class="ph ph-trash" style="color:var(--danger)"></i></button>
                </div>
            </div>
            <h1 style="font-size:48px; font-weight:800; margin-bottom:10px;">${playlist.name}</h1>
            <div style="opacity:0.6; font-size:14px;">${playlist.tracks.length} Songs</div>
        </div>
      </div>
      <div class="song-list">
        <div class="song-row" style="font-weight: 600; font-size: 11px; opacity: 0.5; border-bottom: 1px solid rgba(255,255,255,0.05); margin-bottom: 10px; cursor: default;">
          <div class="song-cell">#</div>
          <div class="song-cell">TITLE</div>
          <div class="song-cell">ARTIST</div>
          <div class="song-cell">ALBUM</div>
          <div class="song-cell"><i class="ph ph-clock"></i></div>
          <div class="song-cell"></div>
        </div>
      </div>
    `;

  const list = container.querySelector(".song-list");
  if (playlist.tracks.length === 0) {
    list.innerHTML =
      '<p style="padding:40px; text-align:center; opacity:0.5;">This playlist is empty. Add songs from your library.</p>';
  } else {
    playlist.tracks.forEach((trackPath, i) => {
      const track = musicLibrary.find((t) => t.path === trackPath);
      if (!track) return;
      const row = document.createElement("div");
      row.className = `song-row ${win.currentTrack?.path === track.path ? "playing" : ""}`;
      row.innerHTML = `
                <div class="song-cell">${i + 1}</div>
                <div class="song-cell" style="display:flex; align-items:center; gap:10px;">
                    <div style="width:24px; height:24px; border-radius:4px; background:${track.cover ? "url(" + track.cover + ") center/cover" : "var(--accent)"}"></div>
                    <span>${track.title || track.name}</span>
                </div>
                <div class="song-cell">${track.artist || "Unknown Artist"}</div>
                <div class="song-cell">${track.album || "-"}</div>
                <div class="song-cell">${track.duration || "--:--"}</div>
                <div class="song-cell" style="display: flex; gap: 4px; justify-content: flex-end;">
                    <button class="music-btn-icon small add-to-queue-btn" title="Add to Queue" onclick="event.stopPropagation(); window.addMusicToQueue(this, '${track.path.replace(/'/g, "\\'")}')"><i class="ph ph-plus"></i></button>
                    <button class="music-btn-icon small add-to-playlist-btn" title="Add to Playlist" onclick="event.stopPropagation(); window.promptAddToPlaylist(event, this, '${track.path.replace(/'/g, "\\'")}')"><i class="ph ph-list-plus"></i></button>
                    <button class="music-btn-icon small" title="Remove from Playlist" onclick="event.stopPropagation(); window.removeFromPlaylist('${playlist.id}', '${track.path.replace(/'/g, "\\'")}')"><i class="ph ph-minus"></i></button>
                </div>
      `;
      row.onclick = () => {
        // Build the full track objects for context
        const contextTracks = playlist.tracks
          .map((p) => musicLibrary.find((t) => t.path === p))
          .filter((t) => t);
        window.playTrackInMusic(win, track, contextTracks);
      };
      list.appendChild(row);
    });
  }
}

function renderSidebarPlaylists(win) {
  const list = win.querySelector("#sidebar-playlists-list");
  if (!list) return;
  list.innerHTML = "";

  win.playlists.forEach((pl) => {
    const el = document.createElement("div");
    el.className = "sidebar-item";
    el.innerHTML = `<i class="ph ph-list-bullets"></i> ${pl.name}`;
    el.onclick = () => win.switchView(`playlist:${pl.id}`, el);
    el.oncontextmenu = (e) => {
      e.stopPropagation();
      showContextMenu(e, [
        {
          icon: "ph-pencil-simple",
          text: "Rename Playlist",
          action: () => window.renameMusicPlaylist(el, pl.id),
        },
        {
          icon: "ph-trash",
          text: "Delete Playlist",
          danger: true,
          action: () => window.deleteMusicPlaylist(el, pl.id),
        },
      ]);
    };
    list.appendChild(el);
  });
}

function createMusicPlaylist(btn) {
  const win = btn.closest(".os-window");
  osPrompt("Enter playlist name:", "New Playlist", (name) => {
    if (!name || name.trim() === "") return;
    const newPl = {
      id: "pl_" + Date.now(),
      name: name.trim(),
      tracks: [],
    };
    win.playlists.push(newPl);
    localStorage.setItem(
      "robbieos_music_playlists",
      JSON.stringify(win.playlists),
    );
    renderSidebarPlaylists(win);
    osToast(`Created playlist "${name}"`, "ph-list-bullets");
  });
}

function handleMusicImport(e, input) {
  window.handleMusicImportGlobal(e, input);
}

// Global Exports
window.addRemoteMusicToQueue = (btn, trackJson) => {
  const win = btn.closest(".os-window");
  const track = JSON.parse(decodeURIComponent(trackJson));
  if (win && track) {
    if (!win.queue) win.queue = [];
    win.queue.push(track);
    osToast("Added to queue from Browse", "ph-list-numbers");

    const rightPanel = win.querySelector("#music-right-panel");
    const panelTitle = win.querySelector("#panel-title");
    const isQueueOpen =
      rightPanel &&
      rightPanel.classList.contains("active") &&
      panelTitle.textContent === "Queue";

    if (win.togglePanel && !isQueueOpen) {
      win.togglePanel("queue");
    } else if (isQueueOpen) {
      win.dispatchEvent(new CustomEvent("queueChanged"));
    }
  }
};

window.switchMusicView = (view, btn) => {
  const win = btn.closest(".os-window");
  if (win && win.switchView) win.switchView(view, btn);
};

window.toggleMusicPanel = (type, btn) => {
  const win = btn.closest(".os-window");
  if (win && win.togglePanel) win.togglePanel(type, btn);
};

window.addMusicToQueue = (btn, path) => {
  const win = btn.closest(".os-window");
  const track = musicLibrary.find((t) => t.path === path);
  if (win && track) {
    if (!win.queue) win.queue = [];
    win.queue.push(track);
    osToast("Added to queue", "ph-list-numbers");

    // Only open the panel if it's not already open as 'queue'
    const rightPanel = win.querySelector("#music-right-panel");
    const panelTitle = win.querySelector("#panel-title");
    const isQueueOpen =
      rightPanel &&
      rightPanel.classList.contains("active") &&
      panelTitle.textContent === "Queue";

    if (win.togglePanel && !isQueueOpen) {
      win.togglePanel("queue");
    } else if (isQueueOpen) {
      win.dispatchEvent(new CustomEvent("queueChanged"));
    }
  }
};

window.toggleMusicShuffle = (btn) => {
  const win = btn.closest(".os-window");
  if (win && win.toggleShuffle) win.toggleShuffle();
};

window.togglePlayMusic = (btn) => {
  const win = btn.closest(".os-window");
  if (win && win.togglePlay) win.togglePlay();
};

window.nextMusic = (btn) => {
  const win = btn.closest(".os-window");
  if (win && win.nextTrack) win.nextTrack();
};

window.prevMusic = (btn) => {
  const win = btn.closest(".os-window");
  if (win && win.prevTrack) win.prevTrack();
};

window.setMusicVolume = (input) => {
  const win = input.closest(".os-window");
  const audio = win.querySelector("#main-audio-element");
  if (audio) {
    audio.volume = input.value;

    // Visual feedback via icon
    const prevEl = input.previousElementSibling;
    const nextEl = input.nextElementSibling;
    if (input.value == 0 && prevEl) prevEl.className = "ph ph-speaker-x";
    else if (input.value < 0.5 && prevEl)
      prevEl.className = "ph ph-speaker-low";
    else if (prevEl) prevEl.className = "ph ph-speaker-high";
  }
};

window.seekMusic = (e, bar) => {
  const win = bar.closest(".os-window");
  const audio = win.querySelector("#main-audio-element");
  if (!audio || !audio.duration) return;

  const rect = bar.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const MathClamp = Math.max(0, Math.min(x / rect.width, 1));
  audio.currentTime = MathClamp * audio.duration;
};

window.importMusic = (btn) => {
  const win = btn.closest(".os-window");
  const input = win.querySelector(".music-import-input");
  if (input) input.click();
};

window.promptAddToPlaylist = (e, btn, path) => {
  const win = btn.closest(".os-window");
  if (!win || !win.playlists || win.playlists.length === 0) {
    osAlert(
      "No playlists available. Create one first from the Playlists sidebar section!",
      "Error",
    );
    return;
  }

  const items = win.playlists.map((pl) => {
    return {
      text: pl.name,
      icon: "ph-list-bullets",
      action: () => {
        const track = musicLibrary.find((t) => t.path === path);
        if (track && !pl.tracks.includes(track.path)) {
          pl.tracks.push(track.path);
          localStorage.setItem(
            "robbieos_music_playlists",
            JSON.stringify(win.playlists),
          );
          osToast(`Added to "${pl.name}"`, "ph-check-circle");

          if (win.currentView === `playlist:${pl.id}`) {
            win.switchView(win.currentView);
          }
        } else if (track) {
          osToast(`Already in "${pl.name}"`, "ph-info");
        }
      },
    };
  });

  showContextMenu(e, items);
};

window.removeFromPlaylist = (plId, path) => {
  const win = document.querySelector('.os-window[data-app="musicplayer"]');
  if (!win) return;
  const pl = win.playlists.find((p) => p.id === plId);
  if (!pl) return;

  pl.tracks = pl.tracks.filter((p) => p !== path);
  localStorage.setItem(
    "robbieos_music_playlists",
    JSON.stringify(win.playlists),
  );
  osToast("Removed from playlist", "ph-trash");

  if (win.currentView === `playlist:${plId}`) {
    win.switchView(win.currentView);
  }
};

window.deleteMusicPlaylist = (btn, plId) => {
  const win = btn.closest(".os-window");
  osConfirm("Delete this playlist permanently?", () => {
    win.playlists = win.playlists.filter((p) => p.id !== plId);
    localStorage.setItem(
      "robbieos_music_playlists",
      JSON.stringify(win.playlists),
    );
    renderSidebarPlaylists(win);
    if (win.currentView === `playlist:${plId}`) {
      win.switchView("library-songs");
    }
    osToast("Playlist deleted", "ph-trash");
  });
};

window.renameMusicPlaylist = (btn, plId) => {
  const win = btn.closest(".os-window");
  const pl = win.playlists.find((p) => p.id === plId);
  if (!pl) return;

  osPrompt("Rename Playlist", pl.name, (newName) => {
    if (!newName || newName.trim() === "" || newName === pl.name) return;
    pl.name = newName.trim();
    localStorage.setItem(
      "robbieos_music_playlists",
      JSON.stringify(win.playlists),
    );
    renderSidebarPlaylists(win);
    if (win.currentView === `playlist:${plId}`) {
      renderPlaylistDetail(win, plId);
    }
    osToast("Playlist renamed", "ph-pencil-simple");
  });
};

window.changeMusicPlaylistImage = (btn, plId) => {
  const win = btn.closest(".os-window");
  const pl = win.playlists.find((p) => p.id === plId);
  if (!pl) return;

  osPrompt(
    "Enter VFS path for playlist cover (e.g. /music/cover.jpg):",
    pl.imagePath || "",
    (path) => {
      if (path === null) return; // Cancelled
      if (path === "") {
        pl.image = null;
        pl.imagePath = null;
        localStorage.setItem(
          "robbieos_music_playlists",
          JSON.stringify(win.playlists),
        );
        renderPlaylistDetail(win, plId);
        osToast("Playlist image cleared", "ph-image");
        return;
      }

      const node = getVFSNode(path);
      if (node && node.type === "file" && isImageFile(path)) {
        pl.image = node.content; // The dataURL
        pl.imagePath = path;
        localStorage.setItem(
          "robbieos_music_playlists",
          JSON.stringify(win.playlists),
        );
        renderPlaylistDetail(win, plId);
        osToast("Playlist image updated", "ph-image");
      } else {
        osAlert(
          "Invalid image path. Make sure it's a file in your /pictures or /music folders.",
          "File Not Found",
        );
      }
    },
  );
};

// Override old global helper
window.playTrackInWin = (win, path) => {
  const track = musicLibrary.find((t) => t.path === path);
  if (win && track && win.playTrack) {
    win.playTrack(track, false, musicLibrary);
  }
};

window.forceRefreshMusicLibrary = async (btn) => {
  const win = btn.closest(".os-window");
  if (btn) btn.classList.add("ph-spin");
  await scanMusicLibrary();
  if (win) {
    win.dispatchEvent(new CustomEvent("libraryRefreshed"));
  } else {
    osToast("Library Synced", "ph-check-circle");
  }
  if (btn) setTimeout(() => btn.classList.remove("ph-spin"), 1000);
};

window.playTrackInMusic = (win, track, context = null) => {
  if (win && win.playTrack) {
    if (win.currentTrack === track) {
      win.togglePlay();
    } else {
      win.playTrack(track, false, context);
    }
  }
};

window.handleMusicImportGlobal = async (e, input) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  const win = input.closest(".os-window");
  osToast(`Scanning ${files.length} tracks...`, "ph-magnifying-glass");

  let imported = 0;
  for (let file of files) {
    const reader = new FileReader();
    reader.onload = async (event) => {
      const path = `/ music / ${file.name} `;
      if (!getVFSNode(path)) {
        await saveVFS(path, event.target.result, "file");
        imported++;
      }
    };
    reader.readAsDataURL(file);
  }

  setTimeout(async () => {
    await scanMusicLibrary();
    if (win) {
      win.dispatchEvent(new CustomEvent("libraryRefreshed"));
    } else {
      osToast("Library Synced", "ph-check-circle");
    }
  }, 1000);
};

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isMusicFile(name) {
  const ext = name.split(".").pop().toLowerCase();
  return ["mp3", "m4a", "wav", "ogg", "aac"].includes(ext);
}

function formatTime(seconds) {
  if (isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")} `;
}
