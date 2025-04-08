// DegenlanderPortal Theme System
// Provides consistent styling and theme toggling across games

const DegenTheme = {
  // Theme variables
  colors: {
    dark: {
      bg: '#111',
      text: '#0f0',
      accent: '#f00',
      hover: '#fff',
      panel: '#222',
      border: '#0f0',
      altBg: '#222',
      highlight: '#330'
    },
    light: {
      bg: '#f5f5f5',
      text: '#0a5',
      accent: '#d00',
      hover: '#333',
      panel: '#fff',
      border: '#0a5',
      altBg: '#e5e5e5',
      highlight: '#efe5c0'
    }
  },
  
  // Initialize theme system
  init: function() {
    // Create CSS variables
    this.applyTheme();
    
    // Add theme toggle button if not exists
    if (!document.getElementById('theme-toggle')) {
      this.createToggleButton();
    }
    
    // Listen for storage events to sync theme across tabs
    window.addEventListener('storage', (e) => {
      if (e.key === 'theme') {
        this.applyTheme(e.newValue);
      }
    });
  },
  
  // Create and append theme toggle button
  createToggleButton: function() {
    const navBar = document.querySelector('.nav-bar') || this.createNavBar();
    
    const button = document.createElement('button');
    button.id = 'theme-toggle';
    button.style.backgroundColor = 'transparent';
    button.style.border = '1px solid var(--text-color)';
    button.style.color = 'var(--text-color)';
    button.style.padding = '5px 10px';
    button.style.borderRadius = '5px';
    button.style.cursor = 'pointer';
    button.style.marginLeft = '20px';
    
    // Set text based on current theme
    const currentTheme = localStorage.getItem('theme') || 'dark';
    button.textContent = currentTheme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
    
    // Add event listener
    button.addEventListener('click', () => {
      this.toggleTheme();
    });
    
    navBar.appendChild(button);
    return button;
  },
  
  // Create navigation bar if not exists
  createNavBar: function() {
    const navBar = document.createElement('div');
    navBar.className = 'nav-bar';
    navBar.style.backgroundColor = 'var(--panel-color)';
    navBar.style.padding = '10px 0';
    navBar.style.position = 'sticky';
    navBar.style.top = '0';
    navBar.style.zIndex = '100';
    navBar.style.borderBottom = '2px solid var(--border-color)';
    navBar.style.display = 'flex';
    navBar.style.justifyContent = 'center';
    navBar.style.alignItems = 'center';
    
    // Add default navigation links
    const links = [
      { href: '/index.html', text: 'Home' },
      { href: '/leaderboard.html', text: 'Leaderboard' },
      { href: '/Games/AntsSimulator/index.html', text: 'Ants Simulator' },
      { href: '/Games/NerdSoccer/PenFootballGameWithWallBounce.html', text: 'Nerd Soccer' }
    ];
    
    links.forEach(link => {
      const a = document.createElement('a');
      a.href = link.href;
      a.textContent = link.text;
      a.style.color = 'var(--text-color)';
      a.style.textDecoration = 'none';
      a.style.margin = '0 15px';
      a.style.fontSize = '1em';
      a.style.transition = 'all 0.2s ease';
      navBar.appendChild(a);
    });
    
    // Insert at top of body
    document.body.insertBefore(navBar, document.body.firstChild);
    return navBar;
  },
  
  // Apply current theme to document
  applyTheme: function(themeName) {
    const theme = themeName || localStorage.getItem('theme') || 'dark';
    document.body.className = theme + '-mode';
    
    // Set CSS variables
    const colors = this.colors[theme];
    for (const [key, value] of Object.entries(colors)) {
      document.documentElement.style.setProperty(`--${key}-color`, value);
    }
    
    // Update button text if it exists
    const button = document.getElementById('theme-toggle');
    if (button) {
      button.textContent = theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
    }
  },
  
  // Toggle between dark and light themes
  toggleTheme: function() {
    const currentTheme = localStorage.getItem('theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    localStorage.setItem('theme', newTheme);
    this.applyTheme(newTheme);
  },
  
  // Add common CSS styles to document
  addCommonStyles: function() {
    const style = document.createElement('style');
    style.textContent = `
      /* Base theme variables */
      :root {
        --bg-color: #111;
        --text-color: #0f0;
        --accent-color: #f00;
        --hover-color: #fff;
        --panel-color: #222;
        --border-color: #0f0;
        --altBg-color: #222;
        --highlight-color: #330;
      }
      
      .dark-mode {
        --bg-color: #111;
        --text-color: #0f0;
        --accent-color: #f00;
        --hover-color: #fff;
        --panel-color: #222;
        --border-color: #0f0;
        --altBg-color: #222;
        --highlight-color: #330;
      }
      
      .light-mode {
        --bg-color: #f5f5f5;
        --text-color: #0a5;
        --accent-color: #d00;
        --hover-color: #333;
        --panel-color: #fff;
        --border-color: #0a5;
        --altBg-color: #e5e5e5;
        --highlight-color: #efe5c0;
      }
      
      body {
        background-color: var(--bg-color);
        color: var(--text-color);
        font-family: 'Press Start 2P', 'Courier New', monospace;
        margin: 0;
        padding: 0;
        transition: background-color 0.3s, color 0.3s;
      }
      
      /* Navigation bar */
      .nav-bar {
        background-color: var(--panel-color);
        padding: 10px 0;
        position: sticky;
        top: 0;
        z-index: 100;
        border-bottom: 2px solid var(--border-color);
        display: flex;
        justify-content: center;
        align-items: center;
      }
      
      .nav-bar a {
        color: var(--text-color);
        text-decoration: none;
        margin: 0 15px;
        font-size: 1em;
        transition: all 0.2s ease;
      }
      
      .nav-bar a:hover {
        color: var(--hover-color);
        text-shadow: 0 0 8px var(--text-color);
      }
      
      /* Theme toggle button */
      #theme-toggle {
        background-color: transparent;
        border: 1px solid var(--text-color);
        color: var(--text-color);
        padding: 5px 10px;
        border-radius: 5px;
        cursor: pointer;
        margin-left: 20px;
        font-family: inherit;
        transition: background-color 0.2s, color 0.2s;
      }
      
      #theme-toggle:hover {
        background-color: var(--text-color);
        color: var(--bg-color);
      }
      
      /* Common button style */
      .degen-btn {
        background-color: var(--panel-color);
        color: var(--text-color);
        border: 2px solid var(--border-color);
        padding: 10px 20px;
        font-family: inherit;
        font-size: 1em;
        border-radius: 5px;
        cursor: pointer;
        transition: all 0.3s ease;
      }
      
      .degen-btn:hover {
        background-color: var(--text-color);
        color: var(--bg-color);
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(var(--text-color), 0.5);
      }
      
      /* Common container style */
      .degen-container {
        background-color: var(--panel-color);
        border: 2px solid var(--border-color);
        border-radius: 5px;
        padding: 20px;
        margin: 20px auto;
        box-shadow: 0 0 10px var(--border-color);
      }
      
      /* Mobile responsiveness */
      @media (max-width: 768px) {
        .nav-bar {
          flex-direction: column;
          padding: 10px;
        }
        
        .nav-bar a {
          margin: 5px 15px;
        }
        
        #theme-toggle {
          margin-top: 10px;
          margin-left: 0;
        }
      }
    `;
    
    document.head.appendChild(style);
  }
};

// Auto-initialize when script is loaded
document.addEventListener('DOMContentLoaded', () => {
  DegenTheme.addCommonStyles();
  DegenTheme.init();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DegenTheme;
}