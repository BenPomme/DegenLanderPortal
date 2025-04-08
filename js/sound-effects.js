//===============================================
// DegenlanderPortal Sound Effects System
//===============================================

const DegenSound = {
  // Main audio contexts and settings
  context: null,
  masterVolume: 0.7,
  isMuted: false,
  soundEnabled: true,
  
  // Sound banks
  sounds: {
    // UI sounds
    ui: {
      click: { url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3' },
      hover: { url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3' },
      success: { url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3' },
      error: { url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3' }
    },
    
    // Game specific sounds
    game: {
      explosion: { url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3' },
      collect: { url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3' },
      jump: { url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3' },
      land: { url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3' },
      levelUp: { url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3' },
      powerUp: { url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3' },
      shoot: { url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3' },
      thrust: { url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3' }
    }
  },
  
  // Loaded buffers
  buffers: {},
  
  // Initialize the audio system
  init: function() {
    // Create AudioContext
    try {
      window.AudioContext = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContext();
    } catch (e) {
      console.warn('Web Audio API not supported in this browser');
      this.soundEnabled = false;
      return;
    }
    
    // Load all sounds
    this.preloadSounds();
    
    // Set up master volume control
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.masterGain.connect(this.context.destination);
    
    // Add volume control UI if not exists
    if (!document.getElementById('sound-controls')) {
      this.createSoundControls();
    }
  },
  
  // Create sound control panel
  createSoundControls: function() {
    const controls = document.createElement('div');
    controls.id = 'sound-controls';
    controls.style.position = 'fixed';
    controls.style.bottom = '10px';
    controls.style.right = '10px';
    controls.style.zIndex = '1000';
    controls.style.backgroundColor = 'var(--panel-color, #222)';
    controls.style.padding = '10px';
    controls.style.borderRadius = '5px';
    controls.style.border = '1px solid var(--border-color, #0f0)';
    controls.style.display = 'flex';
    controls.style.alignItems = 'center';
    controls.style.gap = '10px';
    
    // Volume slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.1';
    slider.value = this.masterVolume;
    slider.style.width = '100px';
    
    // Mute button
    const muteBtn = document.createElement('button');
    muteBtn.innerHTML = '🔊';
    muteBtn.style.backgroundColor = 'transparent';
    muteBtn.style.border = '1px solid var(--border-color, #0f0)';
    muteBtn.style.color = 'var(--text-color, #0f0)';
    muteBtn.style.padding = '5px 10px';
    muteBtn.style.borderRadius = '5px';
    muteBtn.style.cursor = 'pointer';
    
    // Event listeners
    slider.addEventListener('input', (e) => {
      this.setVolume(e.target.value);
    });
    
    muteBtn.addEventListener('click', () => {
      this.toggleMute();
      muteBtn.innerHTML = this.isMuted ? '🔇' : '🔊';
    });
    
    controls.appendChild(slider);
    controls.appendChild(muteBtn);
    
    document.body.appendChild(controls);
  },
  
  // Preload all sounds
  preloadSounds: function() {
    const loadSound = (key, sound) => {
      fetch(sound.url)
        .then(response => response.arrayBuffer())
        .then(arrayBuffer => this.context.decodeAudioData(arrayBuffer))
        .then(audioBuffer => {
          this.buffers[key] = audioBuffer;
        })
        .catch(error => console.error('Error loading sound', key, error));
    };
    
    // Load UI sounds
    Object.entries(this.sounds.ui).forEach(([key, sound]) => {
      loadSound('ui_' + key, sound);
    });
    
    // Load game sounds
    Object.entries(this.sounds.game).forEach(([key, sound]) => {
      loadSound('game_' + key, sound);
    });
  },
  
  // Play a sound
  play: function(category, name, options = {}) {
    if (!this.soundEnabled || this.isMuted) return;
    
    // Resume context if it was suspended (due to browser autoplay policy)
    if (this.context.state === 'suspended') {
      this.context.resume();
    }
    
    const soundKey = category + '_' + name;
    if (!this.buffers[soundKey]) {
      console.warn('Sound not loaded:', soundKey);
      return;
    }
    
    // Create source
    const source = this.context.createBufferSource();
    source.buffer = this.buffers[soundKey];
    
    // Create gain node for this sound
    const gainNode = this.context.createGain();
    gainNode.gain.value = options.volume !== undefined ? options.volume : 1;
    
    // Connect nodes
    source.connect(gainNode);
    gainNode.connect(this.masterGain);
    
    // Start playback
    source.start(0);
    
    // Handle looping
    if (options.loop) {
      source.loop = true;
    }
    
    // Return the source for stopping later
    return source;
  },
  
  // Set master volume
  setVolume: function(value) {
    this.masterVolume = value;
    if (this.masterGain) {
      this.masterGain.gain.value = value;
    }
    
    // Save to localStorage
    localStorage.setItem('soundVolume', value);
  },
  
  // Toggle mute
  toggleMute: function() {
    this.isMuted = !this.isMuted;
    
    // Save to localStorage
    localStorage.setItem('soundMuted', this.isMuted);
    
    return this.isMuted;
  },
  
  // Generate a beep sound (for quick effects)
  beep: function(frequency = 440, duration = 0.2, type = 'sine', volume = 1) {
    if (!this.soundEnabled || this.isMuted) return;
    
    // Resume context if it was suspended
    if (this.context.state === 'suspended') {
      this.context.resume();
    }
    
    const oscillator = this.context.createOscillator();
    const gainNode = this.context.createGain();
    
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gainNode.gain.value = volume;
    
    oscillator.connect(gainNode);
    gainNode.connect(this.masterGain);
    
    oscillator.start();
    
    // Fade out for smooth ending
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
    oscillator.stop(this.context.currentTime + duration);
  }
};

// Auto-initialize when script is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Initialize with volume from localStorage if available
  if (localStorage.getItem('soundVolume')) {
    DegenSound.masterVolume = parseFloat(localStorage.getItem('soundVolume'));
  }
  
  if (localStorage.getItem('soundMuted')) {
    DegenSound.isMuted = localStorage.getItem('soundMuted') === 'true';
  }
  
  DegenSound.init();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DegenSound;
}