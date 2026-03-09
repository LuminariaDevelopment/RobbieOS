# RobbieOS

RobbieOS is a web-based operating system inspired by the best parts of MacOS, iPadOS, Hyprland, and Windows 11. Built with HTML, CSS, and JavaScript. 
## Core Features

### Desktop Environment
The system uses a custom-built window manager that handles window layering, active states, and multitasking. It includes a dynamic dock at the bottom for quick access to apps and a top bar that provides real-time system information, a system clock, and quick-access overlays.

### Virtual File System (VFS)
RobbieOS implements a virtual file system stored via IndexedDB. This allows users to create files and folders, upload local images or documents, and move or delete data with persistent storage across sessions.

### Integrated Applications
- **File Explorer**: Browse the VFS, manage directories, and drag-and-drop local files for immediate upload. 
- **Terminal**: A CLI environment for interacting with the system via text commands.
- **Music Player**: A fully functional audio app with library synchronization, volume controls, and metadata support using jsmediatags.
- **Notepad**: A text editor for creating and editing .txt files within the virtual file system.
- **Drawing App**: A canvas-based application for basic digital sketching and drawing.
- **Photo Viewer**: A simple utility for viewing image files stored in the file system.
- **Browser**: A functional web browser integrated into the desktop environment for navigating external sites.
- **Settings**: Manage system preferences, customize desktop backgrounds (including live video backgrounds), and monitor storage usage metrics.

### System Utilities
- **Quickfind**: A system-wide search tool activated via keyboard shortcuts for fast access to apps and files.
- **Snap Assist**: Windows can be snapped to the sides or corners of the screen for efficient multi-window management.
- **Status Overlays**: Quick access menus in the top bar for monitoring CPU, battery, and connection status.

## Compatibility
RobbieOS is optimized for modern desktop browsers. Mobile support is included with a specialized UI layout, though the full desktop experience is recommended for total functionality.
