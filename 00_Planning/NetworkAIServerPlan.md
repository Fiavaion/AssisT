# Network AI Server Architecture Plan

## Centralized AI Workstation for Educational Institution Deployment

**Document Version:** 1.0
**Date:** 2026-02-14
**Status:** Planning Phase
**Target Branch:** `network-ai-server`
**Estimated Timeline:** 4-6 weeks (PoC to Production Pilot)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Business Case](#business-case)
3. [Technical Architecture](#technical-architecture)
4. [Implementation Plan](#implementation-plan)
5. [Code Changes Required](#code-changes-required)
6. [Server Setup Guide](#server-setup-guide)
7. [Network Configuration](#network-configuration)
8. [Security & Privacy](#security--privacy)
9. [Testing Strategy](#testing-strategy)
10. [Deployment Roadmap](#deployment-roadmap)
11. [Performance Optimization](#performance-optimization)
12. [Monitoring & Maintenance](#monitoring--maintenance)
13. [Risk Assessment](#risk-assessment)
14. [Cost-Benefit Analysis](#cost-benefit-analysis)
15. [Future Enhancements](#future-enhancements)

---

## Executive Summary

### Objective

Transform AssisT from a **client-side local AI** architecture to support a **centralized network AI server** model, enabling educational institutions to deploy a single powerful AI workstation (104GB VRAM) serving all students on the campus network.

### Key Benefits

- **Cost Reduction**: 90% savings vs. equipping each student laptop
- **Privacy Compliance**: Data never leaves campus network (FERPA/HIPAA compliant)
- **Consistent Quality**: All students access same high-performance models
- **Simplified Maintenance**: Single point of management vs. 100+ individual installs
- **Superior Performance**: Access to larger, more capable models (Llama 3.1 70B)

### Implementation Complexity

**LOW** - Ollama already supports network access; requires ~170 lines of code changes primarily focused on configuration management.

### Success Criteria

- ✅ 50+ concurrent users with <2s average response time
- ✅ 99.5% uptime during academic hours
- ✅ Zero data leaving campus network
- ✅ Student satisfaction ≥85% (vs. current AI features)

---

## Business Case

### Problem Statement

Current architecture requires each student to:

1. Have capable hardware (GPU-enabled laptop)
2. Install and configure Ollama locally
3. Download and manage AI models (10-40GB each)
4. Troubleshoot individual installation issues

**Result**: Low adoption rate, inconsistent experience, high support burden.

### Proposed Solution

**Centralized AI Server Architecture:**

- One powerful workstation (104GB VRAM) on campus network
- Students connect via `http://ai.college.local:11434`
- Zero client-side installation (beyond Chrome extension)
- IT manages single server vs. 100+ individual installs

### Stakeholder Benefits

**Students:**

- No hardware requirements (works on any laptop/Chromebook)
- Faster, more powerful AI responses
- Consistent experience across all devices
- No local storage needed (models stay on server)

**Faculty:**

- All students have equal AI access
- Easier to integrate into curriculum
- Can recommend AI features knowing all students can use them

**IT Department:**

- Single server to maintain
- Centralized logging and monitoring
- Reduced support tickets
- Better security control

**Institution:**

- $135,000+ cost savings (vs. laptop GPU upgrades)
- Enhanced reputation (cutting-edge accessibility tech)
- FERPA/HIPAA compliance with zero cloud dependencies
- Competitive advantage in student recruitment

---

## Technical Architecture

### Current Architecture

```
┌─────────────────┐
│ Student Laptop  │
│                 │
│  AssisT Ext.    │
│       ↓         │
│  Ollama (local) │
│       ↓         │
│  AI Models      │
│  (10-40GB)      │
└─────────────────┘
```

### Proposed Architecture

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ Student 1   │   │ Student 2   │   │ Student N   │
│  AssisT Ext.│   │  AssisT Ext.│   │  AssisT Ext.│
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                  │                  │
       └──────────────────┼──────────────────┘
                          │
                    Campus LAN
                   (Gigabit WiFi)
                          │
                ┌─────────▼─────────┐
                │   AI Server       │
                │  ai.college.local │
                │                   │
                │  Ollama Service   │
                │  (port 11434)     │
                │                   │
                │  ┌─────────────┐  │
                │  │ 104GB VRAM  │  │
                │  │             │  │
                │  │ Llama 70B   │  │ ← 40GB
                │  │ Llama 3B ×8 │  │ ← 16GB
                │  │ Phi-3 ×5    │  │ ← 40GB
                │  │ Reserved    │  │ ← 8GB
                │  └─────────────┘  │
                └───────────────────┘
```

### Component Overview

**1. Client-Side (Chrome Extension)**

- Modified `service-worker.js`: Dynamic Ollama URL configuration
- Modified `popup.js`: AI Server URL settings UI
- New `ai-server-config.js`: Connection management and health checks
- **Backward Compatible**: Falls back to `localhost:11434` if not configured

**2. Network Layer**

- DNS: `ai.college.local` → AI server IP
- Protocol: HTTP (internal network) or HTTPS (optional, via nginx reverse proxy)
- Port: 11434 (Ollama default)
- Firewall: Restrict to college network IP range only

**3. Server-Side (AI Workstation)**

- **Hardware**: 104GB VRAM (e.g., 2× A100 80GB, 4× RTX 4090 24GB, or similar)
- **OS**: Ubuntu 22.04 LTS (recommended) or Windows Server 2022
- **Software**: Ollama (latest stable)
- **Models**: Llama 3.1 70B, Llama 3.2 3B, Phi-3 Medium

### Network Protocol

**Request Flow:**

```
1. Student clicks "Ask AI" in AssisT
2. Extension sends POST to http://ai.college.local:11434/api/generate
3. Request payload:
   {
     "model": "llama3.2:3b",
     "prompt": "Explain photosynthesis",
     "stream": true
   }
4. Ollama processes request (queued if server busy)
5. Response streamed back in chunks:
   { "response": "Photosynthesis is...", "done": false }
   { "response": " the process by...", "done": false }
   { "response": " which...", "done": true }
6. Extension displays response to student
```

**Latency Breakdown:**

- Network: <1ms (Gigabit LAN)
- Ollama processing: 50-500ms (depends on model and prompt length)
- Total: ~100-600ms (vs. cloud: 200-2000ms)

### Model Strategy

**Tiered Model Approach:**

**Tier 1: Fast (Phi-3 Medium - 8GB each)**

- Use case: Simple questions, quick lookups
- Capacity: 5 concurrent instances (40GB total)
- Response time: <1 second
- Example: "What is the capital of France?"

**Tier 2: Balanced (Llama 3.2 3B - 2GB each)**

- Use case: General assistance, summarization
- Capacity: 8 concurrent instances (16GB total)
- Response time: 1-3 seconds
- Example: "Summarize this Canvas announcement"

**Tier 3: Powerful (Llama 3.1 70B - 40GB)**

- Use case: Complex reasoning, essay feedback
- Capacity: 1 instance (40GB)
- Response time: 3-10 seconds
- Example: "Critique my thesis argument structure"

**Reserved VRAM: 8GB** for OS and overhead

**Auto-Routing Logic** (future enhancement):

```javascript
function selectModel(prompt, context) {
  const wordCount = prompt.split(' ').length;
  const isComplex = context.requiresReasoning || wordCount > 100;

  if (wordCount < 20 && !isComplex) return 'phi3:medium';
  if (wordCount < 100 || !isComplex) return 'llama3.2:3b';
  return 'llama3.1:70b';
}
```

---

## Implementation Plan

### Phase 1: Code Changes (Week 1)

**Objective**: Add network AI server support to extension

**Tasks:**

1. Create new branch `network-ai-server` from `ui-overhaul`
2. Modify `service-worker.js` for dynamic Ollama URL
3. Add settings UI in `popup.html` and `popup.js`
4. Create `ai-server-config.js` for connection management
5. Add health check and fallback logic
6. Test locally (no behavior change with localhost)

**Deliverables:**

- Code changes committed to `network-ai-server` branch
- Unit tests passing
- Local testing successful

### Phase 2: Server Setup (Week 2)

**Objective**: Configure AI workstation on college network

**Tasks:**

1. Provision hardware (104GB VRAM workstation)
2. Install Ubuntu 22.04 LTS
3. Install and configure Ollama
4. Pull AI models (Llama 70B, Llama 3B, Phi-3)
5. Configure firewall rules
6. Set up DNS entry (`ai.college.local`)
7. Run health checks and smoke tests

**Deliverables:**

- AI server accessible at `http://ai.college.local:11434`
- All models preloaded and responding
- Network security validated

### Phase 3: Pilot Testing (Week 3)

**Objective**: Validate with 5 test users

**Tasks:**

1. Select 5 pilot users (mix of faculty, students, IT)
2. Configure their extensions to use network server
3. Run test scenarios (Q&A, summarization, document analysis)
4. Monitor server performance (response time, VRAM usage)
5. Collect qualitative feedback

**Deliverables:**

- Pilot test report with metrics
- Issue log with resolutions
- User feedback summary

### Phase 4: Load Testing (Week 4)

**Objective**: Validate 50+ concurrent user capacity

**Tasks:**

1. Develop load testing scripts (Apache JMeter or custom)
2. Simulate 10, 25, 50, 75, 100 concurrent requests
3. Measure response time, queue depth, error rate
4. Identify bottlenecks and optimize
5. Establish performance baselines

**Deliverables:**

- Load test report with graphs
- Performance tuning recommendations
- Capacity planning guide

### Phase 5: Production Pilot (Weeks 5-6)

**Objective**: Deploy to one class (20-30 students)

**Tasks:**

1. Select pilot class (recommend: undergrad STEM course)
2. Brief instructor and students
3. Deploy extension updates
4. Monitor daily for issues
5. Weekly check-ins with instructor
6. End-of-pilot survey

**Deliverables:**

- Production pilot report
- Student satisfaction scores
- Decision document: Full deployment or iterate

### Phase 6: Full Deployment (Week 7+)

**Objective**: Roll out to entire institution (if pilot successful)

**Tasks:**

1. Merge `network-ai-server` → `main` with feature flag
2. Publish updated extension to Chrome Web Store
3. Communications plan (students, faculty, IT)
4. Training materials and documentation
5. Establish support procedures

**Deliverables:**

- Full deployment complete
- Support documentation published
- Monitoring dashboard operational

---

## Code Changes Required

### File 1: `src/background/service-worker.js`

**Changes**: ~80 lines

**Current Code:**

```javascript
// Hardcoded Ollama URL
const OLLAMA_BASE_URL = 'http://localhost:11434';

async function ollamaGenerate(model, prompt, options = {}) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: true, ...options }),
  });
  return response;
}
```

**Modified Code:**

```javascript
// Dynamic Ollama URL with fallback
let OLLAMA_BASE_URL = 'http://localhost:11434'; // Default

// Load custom server URL from settings on startup
chrome.storage.local.get(['ai_server_url'], result => {
  if (result.ai_server_url) {
    OLLAMA_BASE_URL = result.ai_server_url;
    console.log('[AI Server] Using network server:', OLLAMA_BASE_URL);
  } else {
    console.log('[AI Server] Using localhost:', OLLAMA_BASE_URL);
  }
});

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.ai_server_url) {
    OLLAMA_BASE_URL = changes.ai_server_url.newValue || 'http://localhost:11434';
    console.log('[AI Server] URL updated to:', OLLAMA_BASE_URL);
  }
});

// Health check function
async function checkOllamaHealth() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    return {
      healthy: true,
      models: data.models || [],
      serverUrl: OLLAMA_BASE_URL,
    };
  } catch (error) {
    console.error('[AI Server] Health check failed:', error);
    return {
      healthy: false,
      error: error.message,
      serverUrl: OLLAMA_BASE_URL,
    };
  }
}

// Enhanced generate with fallback
async function ollamaGenerate(model, prompt, options = {}) {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: true, ...options }),
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    return response;
  } catch (error) {
    console.error('[AI Server] Request failed:', error);

    // If network server fails and we're not already using localhost, try localhost
    if (OLLAMA_BASE_URL !== 'http://localhost:11434') {
      console.log('[AI Server] Attempting localhost fallback...');
      const fallbackResponse = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: true, ...options }),
      });
      return fallbackResponse;
    }

    throw error; // Re-throw if localhost also fails
  }
}

// Message handler for health check requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_AI_SERVER_HEALTH') {
    checkOllamaHealth().then(sendResponse);
    return true; // Async response
  }
  // ... existing message handlers
});
```

### File 2: `src/popup/popup.html`

**Changes**: ~30 lines (add to Advanced Settings section)

```html
<!-- Add to Advanced Settings section -->
<div class="settings-section" id="ai-server-settings">
  <h3>🌐 AI Server Configuration</h3>
  <p class="setting-description">
    Configure network AI server for institutional deployments. Leave as default (localhost) for
    personal use.
  </p>

  <div class="setting-item">
    <label for="ai-server-url">AI Server URL</label>
    <div class="input-group">
      <input
        type="text"
        id="ai-server-url"
        placeholder="http://ai.college.local:11434"
        value="http://localhost:11434"
      />
      <button id="test-ai-connection" class="btn-secondary">
        <span class="icon">🔍</span>
        Test Connection
      </button>
    </div>
    <div id="connection-status" class="status-message"></div>
  </div>

  <div class="setting-item">
    <label>Server Status</label>
    <div id="server-info" class="server-info-panel">
      <div class="info-row">
        <span class="label">Status:</span>
        <span id="server-status" class="value">Not tested</span>
      </div>
      <div class="info-row">
        <span class="label">Available Models:</span>
        <span id="server-models" class="value">—</span>
      </div>
      <div class="info-row">
        <span class="label">Response Time:</span>
        <span id="server-latency" class="value">—</span>
      </div>
    </div>
  </div>

  <div class="setting-help">
    <strong>Network Mode:</strong> For institutional deployments with a centralized AI server.<br />
    <strong>Local Mode:</strong> Default. Uses Ollama running on your computer.
  </div>
</div>
```

### File 3: `src/popup/popup.js`

**Changes**: ~60 lines (add to existing file)

```javascript
// AI Server Configuration Handlers
document.addEventListener('DOMContentLoaded', () => {
  // Load saved server URL
  chrome.storage.local.get(['ai_server_url'], result => {
    const urlInput = document.getElementById('ai-server-url');
    if (result.ai_server_url) {
      urlInput.value = result.ai_server_url;
    }
  });

  // Save server URL on change
  const urlInput = document.getElementById('ai-server-url');
  urlInput.addEventListener('change', () => {
    const url = urlInput.value.trim() || 'http://localhost:11434';
    chrome.storage.local.set({ ai_server_url: url }, () => {
      console.log('[AI Server] URL saved:', url);
      updateConnectionStatus('info', 'URL saved. Click "Test Connection" to verify.');
    });
  });

  // Test connection button
  const testButton = document.getElementById('test-ai-connection');
  testButton.addEventListener('click', async () => {
    testButton.disabled = true;
    testButton.textContent = 'Testing...';
    updateConnectionStatus('info', 'Testing connection...');

    try {
      const startTime = Date.now();

      // Send health check request to service worker
      const response = await chrome.runtime.sendMessage({
        type: 'CHECK_AI_SERVER_HEALTH',
      });

      const latency = Date.now() - startTime;

      if (response.healthy) {
        updateConnectionStatus('success', `✓ Connected successfully (${latency}ms)`);
        updateServerInfo(response, latency);
      } else {
        updateConnectionStatus('error', `✗ Connection failed: ${response.error}`);
        clearServerInfo();
      }
    } catch (error) {
      updateConnectionStatus('error', `✗ Error: ${error.message}`);
      clearServerInfo();
    } finally {
      testButton.disabled = false;
      testButton.textContent = 'Test Connection';
    }
  });
});

function updateConnectionStatus(type, message) {
  const statusEl = document.getElementById('connection-status');
  statusEl.className = `status-message status-${type}`;
  statusEl.textContent = message;
}

function updateServerInfo(healthData, latency) {
  document.getElementById('server-status').textContent = '✓ Online';
  document.getElementById('server-status').className = 'value status-success';

  const models = healthData.models.map(m => m.name).join(', ') || 'None';
  document.getElementById('server-models').textContent = models;

  document.getElementById('server-latency').textContent = `${latency}ms`;
  document.getElementById('server-latency').className =
    latency < 100
      ? 'value status-success'
      : latency < 500
        ? 'value status-warning'
        : 'value status-error';
}

function clearServerInfo() {
  document.getElementById('server-status').textContent = '✗ Offline';
  document.getElementById('server-status').className = 'value status-error';
  document.getElementById('server-models').textContent = '—';
  document.getElementById('server-latency').textContent = '—';
  document.getElementById('server-latency').className = 'value';
}
```

### File 4: `src/popup/popup.css`

**Changes**: ~40 lines (styling for new UI)

```css
/* AI Server Settings Styles */
.input-group {
  display: flex;
  gap: 8px;
  align-items: center;
}

.input-group input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 14px;
}

.btn-secondary {
  padding: 8px 16px;
  background: var(--secondary-color);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}

.btn-secondary:hover {
  background: var(--secondary-color-dark);
}

.status-message {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
}

.status-success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.status-error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.status-info {
  background: #d1ecf1;
  color: #0c5460;
  border: 1px solid #bee5eb;
}

.status-warning {
  background: #fff3cd;
  color: #856404;
  border: 1px solid #ffeaa7;
}

.server-info-panel {
  background: var(--background-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
  margin-top: 8px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid var(--border-color);
}

.info-row:last-child {
  border-bottom: none;
}

.info-row .label {
  font-weight: 500;
  color: var(--text-secondary);
}

.info-row .value {
  font-family: 'Courier New', monospace;
  font-size: 13px;
}

.setting-help {
  margin-top: 12px;
  padding: 10px;
  background: var(--info-background);
  border-left: 3px solid var(--primary-color);
  font-size: 13px;
  line-height: 1.6;
}
```

### Summary of Code Changes

**Total Lines Changed: ~210 lines**

- `service-worker.js`: +80 lines (dynamic URL, health checks, fallback)
- `popup.html`: +30 lines (settings UI)
- `popup.js`: +60 lines (connection testing, status display)
- `popup.css`: +40 lines (styling)

**No Breaking Changes**:

- Default behavior unchanged (uses localhost)
- Backward compatible with existing installations
- Feature is opt-in via settings

---

## Server Setup Guide

### Hardware Requirements

**Minimum (Testing):**

- CPU: 8 cores (Intel Xeon or AMD EPYC)
- RAM: 64GB
- VRAM: 48GB (e.g., 2× RTX 3090 24GB)
- Storage: 500GB SSD
- Network: Gigabit Ethernet

**Recommended (Production - 100+ users):**

- CPU: 16+ cores
- RAM: 128GB
- VRAM: 104GB (e.g., 2× A100 80GB, 4× RTX 4090 24GB)
- Storage: 1TB NVMe SSD
- Network: 10 Gigabit Ethernet

### Software Installation

#### Option 1: Ubuntu 22.04 LTS (Recommended)

```bash
# 1. Update system
sudo apt update && sudo apt upgrade -y

# 2. Install NVIDIA drivers (if not already installed)
sudo apt install nvidia-driver-535 -y
sudo reboot

# 3. Verify GPU detection
nvidia-smi  # Should show all GPUs with 104GB total VRAM

# 4. Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# 5. Configure Ollama for network access
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null <<EOF
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_ORIGINS=*"
Environment="OLLAMA_MAX_LOADED_MODELS=10"
Environment="OLLAMA_NUM_PARALLEL=8"
EOF

# 6. Reload systemd and restart Ollama
sudo systemctl daemon-reload
sudo systemctl restart ollama
sudo systemctl enable ollama

# 7. Verify Ollama is running
sudo systemctl status ollama
curl http://localhost:11434/api/tags  # Should return JSON with models list

# 8. Configure firewall (restrict to college network)
sudo ufw allow from 192.168.0.0/16 to any port 11434 proto tcp
sudo ufw enable

# 9. Pull AI models
ollama pull llama3.1:70b        # ~40GB, powerful reasoning
ollama pull llama3.2:3b         # ~2GB, fast general purpose
ollama pull phi3:medium         # ~8GB, balanced performance

# 10. Preload models into VRAM for instant responses
ollama run llama3.1:70b "test" --keepalive 24h &
ollama run llama3.2:3b "test" --keepalive 24h &
ollama run phi3:medium "test" --keepalive 24h &

# 11. Verify models are loaded
curl http://localhost:11434/api/tags
```

#### Option 2: Windows Server 2022

```powershell
# 1. Install NVIDIA drivers from nvidia.com

# 2. Download Ollama for Windows
# Visit: https://ollama.ai/download/windows
# Run installer: OllamaSetup.exe

# 3. Configure Ollama environment variables
# Open System Properties > Environment Variables > System Variables
# Add:
OLLAMA_HOST=0.0.0.0:11434
OLLAMA_ORIGINS=*
OLLAMA_MAX_LOADED_MODELS=10

# 4. Restart Ollama service
Restart-Service Ollama

# 5. Configure Windows Firewall
New-NetFirewallRule -DisplayName "Ollama AI Server" `
  -Direction Inbound `
  -LocalPort 11434 `
  -Protocol TCP `
  -Action Allow `
  -RemoteAddress 192.168.0.0/16

# 6. Pull models
ollama pull llama3.1:70b
ollama pull llama3.2:3b
ollama pull phi3:medium

# 7. Test
Invoke-WebRequest -Uri http://localhost:11434/api/tags
```

### Model Management

**Recommended Model Configuration:**

| Model         | Size | VRAM     | Use Case                          | Concurrent Instances |
| ------------- | ---- | -------- | --------------------------------- | -------------------- |
| Llama 3.1 70B | 40GB | 40GB     | Complex reasoning, essay critique | 1                    |
| Llama 3.2 3B  | 2GB  | 16GB     | General Q&A, summarization        | 8                    |
| Phi-3 Medium  | 8GB  | 40GB     | Fast responses, simple tasks      | 5                    |
| **Total**     |      | **96GB** |                                   | **14 instances**     |
| Reserved      |      | 8GB      | OS overhead                       |                      |

**Model Selection Strategy:**

```javascript
// Client-side logic (future enhancement)
function selectOptimalModel(taskType, promptLength) {
  if (taskType === 'quick-lookup' || promptLength < 50) {
    return 'phi3:medium'; // Fast, <1s response
  }
  if (taskType === 'summarization' || promptLength < 500) {
    return 'llama3.2:3b'; // Balanced, 1-3s response
  }
  return 'llama3.1:70b'; // Powerful, 3-10s response
}
```

---

## Network Configuration

### DNS Setup

**Option 1: Internal DNS Server (Recommended)**

```
# Add A record in college DNS
ai.college.local. IN A 192.168.10.50
```

**Option 2: Hosts File (Testing Only)**

```
# On each student laptop: C:\Windows\System32\drivers\etc\hosts (Windows)
# or /etc/hosts (Mac/Linux)
192.168.10.50  ai.college.local
```

### Network Topology

```
Internet (Blocked for AI Server)
        │
        ↓
┌───────────────────────────────────────┐
│   College Firewall                    │
│   - Block outbound from AI server     │
│   - Allow inbound port 11434 from LAN │
└───────────────────────────────────────┘
        │
        ↓
┌───────────────────────────────────────┐
│   Campus LAN Switch (Gigabit)         │
│   VLAN: 192.168.0.0/16               │
└───────────────────────────────────────┘
        │
        ├───────────────┬──────────────┬─────────────┐
        ↓               ↓              ↓             ↓
  [AI Server]    [Student WiFi]  [Lab PCs]   [Faculty]
 192.168.10.50   192.168.20.x   192.168.30.x 192.168.40.x
```

### Firewall Rules

**AI Server (Ubuntu ufw):**

```bash
# Allow SSH (for management)
sudo ufw allow from 192.168.40.0/24 to any port 22 proto tcp

# Allow Ollama (from all campus IPs)
sudo ufw allow from 192.168.0.0/16 to any port 11434 proto tcp

# Block all outbound except localhost (privacy)
sudo ufw default deny outgoing
sudo ufw allow out on lo  # Allow localhost
sudo ufw allow out 53/udp  # Allow DNS
sudo ufw allow out 123/udp  # Allow NTP

# Enable firewall
sudo ufw enable
```

**College Network Firewall:**

```
# Allow campus LAN to AI server
allow from 192.168.0.0/16 to 192.168.10.50 port 11434

# Block AI server from internet (prevent data exfiltration)
deny from 192.168.10.50 to any port 80,443
```

### Optional: HTTPS with Self-Signed Certificate

**Why?** Encrypt traffic even on internal network (defense in depth).

```bash
# 1. Generate self-signed certificate
sudo mkdir -p /etc/ssl/ai-server
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/ai-server/key.pem \
  -out /etc/ssl/ai-server/cert.pem \
  -subj "/CN=ai.college.local"

# 2. Install nginx
sudo apt install nginx -y

# 3. Configure nginx reverse proxy
sudo tee /etc/nginx/sites-available/ollama-ssl > /dev/null <<EOF
server {
  listen 443 ssl;
  server_name ai.college.local;

  ssl_certificate /etc/ssl/ai-server/cert.pem;
  ssl_certificate_key /etc/ssl/ai-server/key.pem;

  location / {
    proxy_pass http://localhost:11434;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host \$host;
    proxy_cache_bypass \$http_upgrade;
    proxy_read_timeout 300s;
  }
}
EOF

sudo ln -s /etc/nginx/sites-available/ollama-ssl /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 4. Update extension URL to: https://ai.college.local
```

**Note**: Students will need to accept self-signed cert warning on first use, or you can distribute the cert via Group Policy.

---

## Security & Privacy

### Threat Model

**Assets to Protect:**

1. Student data (prompts, documents, grades)
2. AI server availability (prevent DoS)
3. Model integrity (prevent tampering)

**Threat Actors:**

1. External attackers (low risk - air-gapped from internet)
2. Malicious students (medium risk - rate limiting needed)
3. Accidental misuse (high risk - monitoring needed)

### Security Controls

**1. Network Isolation**

- ✅ AI server has NO internet access (air-gapped)
- ✅ Firewall restricts connections to campus IP range only
- ✅ Data never leaves campus network

**2. Access Control**

- ⚠️ **No authentication in PoC** (assumes trusted campus network)
- 🔄 **Future**: Add API keys per student (via Canvas LTI integration)
- 🔄 **Future**: IP-based rate limiting per user

**3. Data Minimization**

- ✅ Ollama does NOT log prompts by default
- ✅ No persistent storage of student queries
- ⚠️ **Recommended**: Disable Ollama logging entirely for FERPA compliance

```bash
# Disable Ollama logging (add to override.conf)
Environment="OLLAMA_DEBUG=0"
Environment="OLLAMA_LOGS_DIR=/dev/null"
```

**4. Rate Limiting (Future)**

```javascript
// service-worker.js - client-side throttling
const REQUEST_LIMIT = 20; // Max requests per hour
const requestLog = [];

function canMakeRequest() {
  const oneHourAgo = Date.now() - 3600000;
  const recentRequests = requestLog.filter(t => t > oneHourAgo);
  return recentRequests.length < REQUEST_LIMIT;
}
```

**5. Content Filtering (Optional)**

```bash
# Use nginx to filter inappropriate content
# Add to nginx config
location /api/generate {
  if ($request_body ~* "badword1|badword2") {
    return 403 "Content policy violation";
  }
  proxy_pass http://localhost:11434;
}
```

### FERPA Compliance Checklist

- ✅ Data stays on campus network (not transmitted to cloud)
- ✅ No third-party processors involved
- ✅ Students cannot see each other's queries
- ✅ Faculty/IT can audit usage if needed (via nginx logs)
- ✅ Data retention: None (Ollama doesn't store prompts)
- ⚠️ **Action Item**: Get legal review of architecture before deployment

### Privacy Best Practices

1. **Inform Students**: Disclose that AI server is operated by college
2. **No Sensitive Data**: Warn against inputting SSN, grades in prompts
3. **Retention Policy**: Document that queries are NOT logged
4. **Incident Response**: Define procedure if server is compromised

---

## Testing Strategy

### Unit Tests

**Test File: `tests/ai-server-config.test.js`**

```javascript
describe('AI Server Configuration', () => {
  test('Should default to localhost', async () => {
    const url = await getOllamaURL();
    expect(url).toBe('http://localhost:11434');
  });

  test('Should load custom URL from storage', async () => {
    chrome.storage.local.set({ ai_server_url: 'http://ai.college.local:11434' });
    const url = await getOllamaURL();
    expect(url).toBe('http://ai.college.local:11434');
  });

  test('Health check should return server status', async () => {
    const health = await checkOllamaHealth();
    expect(health).toHaveProperty('healthy');
    expect(health).toHaveProperty('models');
  });

  test('Should fallback to localhost on network failure', async () => {
    // Mock network failure
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const response = await ollamaGenerate('llama3.2:3b', 'test');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('localhost'),
      expect.any(Object)
    );
  });
});
```

### Integration Tests

**Test Scenarios:**

1. **Localhost Mode** (baseline)
   - Configure extension with `http://localhost:11434`
   - Verify all AI features work (Q&A, summarization, etc.)
   - Expected: Identical behavior to current version

2. **Network Mode** (primary)
   - Configure extension with `http://ai.college.local:11434`
   - Submit 10 test prompts across different features
   - Verify responses match localhost quality
   - Measure average response time

3. **Fallback Test**
   - Configure network URL
   - Disconnect network
   - Verify extension falls back to localhost
   - Verify error messages are user-friendly

4. **Settings Persistence**
   - Set custom server URL
   - Close and reopen extension
   - Verify URL persists across sessions

### Load Testing

**Tool**: Apache JMeter or custom script

**Test Plan:**

```python
# load_test.py - Simulate concurrent users
import asyncio
import aiohttp
import time
import statistics

async def send_request(session, prompt, model='llama3.2:3b'):
    start = time.time()
    async with session.post(
        'http://ai.college.local:11434/api/generate',
        json={'model': model, 'prompt': prompt, 'stream': False}
    ) as response:
        await response.json()
        latency = time.time() - start
        return latency

async def load_test(num_concurrent, num_requests_per_user):
    async with aiohttp.ClientSession() as session:
        tasks = []
        for user_id in range(num_concurrent):
            for req_id in range(num_requests_per_user):
                prompt = f"User {user_id} request {req_id}: Explain photosynthesis"
                tasks.append(send_request(session, prompt))

        latencies = await asyncio.gather(*tasks)

        print(f"\n--- Load Test Results ({num_concurrent} concurrent users) ---")
        print(f"Total requests: {len(latencies)}")
        print(f"Average latency: {statistics.mean(latencies):.2f}s")
        print(f"Median latency: {statistics.median(latencies):.2f}s")
        print(f"95th percentile: {sorted(latencies)[int(len(latencies)*0.95)]:.2f}s")
        print(f"Max latency: {max(latencies):.2f}s")
        print(f"Failed requests: {sum(1 for l in latencies if l > 30)}")

# Run tests
asyncio.run(load_test(num_concurrent=10, num_requests_per_user=5))
asyncio.run(load_test(num_concurrent=25, num_requests_per_user=3))
asyncio.run(load_test(num_concurrent=50, num_requests_per_user=2))
```

**Success Criteria:**
| Concurrent Users | Avg Response Time | 95th Percentile | Error Rate |
|-----------------|------------------|-----------------|-----------|
| 10 | <2s | <5s | <1% |
| 25 | <3s | <8s | <2% |
| 50 | <5s | <12s | <5% |
| 100 | <10s | <20s | <10% |

### User Acceptance Testing

**Test with 5 pilot users:**

**User Profiles:**

1. Student (STEM major, high usage)
2. Student (Humanities, moderate usage)
3. Faculty (embedding in course assignments)
4. IT Staff (technical validation)
5. Accessibility Coordinator (assistive tech compliance)

**Test Script:**

```
1. Install extension with network server configured
2. Complete 5 tasks:
   - Ask a simple question
   - Summarize a Canvas announcement
   - Get feedback on a short essay (300 words)
   - Use voice dictation with STT
   - Test offline behavior (disconnect WiFi)
3. Complete survey:
   - Response speed (1-5 scale)
   - Answer quality (1-5 scale)
   - Ease of use (1-5 scale)
   - Would you use this daily? (Yes/No)
   - Open feedback
```

**Success Criteria:**

- Average rating ≥4.0 on all metrics
- ≥80% would use daily
- No major bugs or usability issues

---

## Deployment Roadmap

### Pre-Deployment Checklist

**Technical:**

- [ ] AI server provisioned and tested
- [ ] DNS configured (`ai.college.local`)
- [ ] Firewall rules in place
- [ ] Models downloaded and preloaded
- [ ] Health check endpoint verified
- [ ] Load testing passed (50+ concurrent users)
- [ ] Backup/recovery procedure documented

**Organizational:**

- [ ] IT Security review approved
- [ ] Legal/Compliance review approved (FERPA)
- [ ] Budget approved for hardware
- [ ] Support procedures documented
- [ ] Training materials created
- [ ] Communication plan approved

**Code:**

- [ ] Branch `network-ai-server` tested and ready
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] User documentation updated
- [ ] Settings UI tested on all browsers

### Deployment Phases

**Phase 1: Shadow Deployment (Week 1)**

- Deploy AI server on network
- Configure for IT staff only (5 users)
- Monitor performance, identify issues
- **Rollback plan**: Shut down server, no user impact

**Phase 2: Pilot Class (Weeks 2-3)**

- Select one class (20-30 students)
- Brief instructor and students
- Deploy extension update
- Daily monitoring, weekly check-ins
- **Rollback plan**: Revert students to localhost mode

**Phase 3: Expanded Pilot (Weeks 4-5)**

- Add 2-3 more classes (60-100 students)
- Monitor server load and performance
- Refine based on feedback
- **Rollback plan**: Revert to localhost, analyze issues

**Phase 4: Soft Launch (Week 6)**

- Announce to all students (opt-in)
- Provide support documentation
- Monitor support tickets
- **Rollback plan**: Disable server URL setting in extension

**Phase 5: Full Deployment (Week 7+)**

- Default new installs to network server
- Publish case study
- Share learnings with other institutions

### Rollback Procedures

**Scenario 1: Server Failure**

```
1. Detect: Monitoring alert or support tickets
2. Assess: Check server logs, network, hardware
3. Decide:
   - If fixable in <30 min: Notify users, fix, resume
   - If >30 min: Execute fallback
4. Fallback: Extension auto-falls back to localhost
5. Communicate: Email students with ETA for restoration
```

**Scenario 2: Poor Performance**

```
1. Detect: Latency >10s for 50% of requests
2. Assess: Check VRAM usage, concurrent requests, network
3. Mitigate:
   - Reduce model preloading (free up VRAM)
   - Implement request queuing
   - Add second AI server (load balancing)
4. If unresolvable: Rollback to localhost mode
```

**Scenario 3: Security Incident**

```
1. Detect: Unusual network activity, unauthorized access attempt
2. Immediate: Shut down server (disconnect network)
3. Assess: Review logs, identify breach extent
4. Remediate: Patch vulnerabilities, reset credentials
5. Resume: Only after security clearance
```

### Communication Plan

**Stakeholders:**

**Students:**

- **Pre-Launch**: Email explaining new AI server, benefits, privacy
- **Launch Day**: Step-by-step setup instructions
- **Ongoing**: Weekly tips on using AI features effectively

**Faculty:**

- **Pre-Launch**: Workshop on integrating AI into curriculum
- **Launch Day**: Faculty guide + office hours for questions
- **Ongoing**: Bi-weekly newsletter with best practices

**IT Staff:**

- **Pre-Launch**: Technical briefing, runbook training
- **Launch Day**: On-call support roster
- **Ongoing**: Weekly performance reports

**Leadership:**

- **Pre-Launch**: Executive summary of benefits and ROI
- **Launch Day**: Press release (institutional innovation)
- **Ongoing**: Monthly metrics dashboard

**Sample Email (Students):**

```
Subject: New AI-Powered Study Assistant Now Available!

Dear Students,

We're excited to announce that AssisT, our accessibility-focused Chrome extension,
now connects to a powerful AI server hosted right here on campus!

What's new:
✅ Faster responses (2-3x speed improvement)
✅ Smarter AI (access to larger, more capable models)
✅ No installation needed (works on any laptop, even Chromebooks!)
✅ Your data stays on campus (100% private, FERPA-compliant)

How to get started:
1. Install AssisT from the Chrome Web Store (link)
2. The extension will automatically connect to our campus AI server
3. Start asking questions, getting feedback, and using voice dictation!

Questions? Visit our support page: support.college.edu/assist

Happy studying!
IT Department
```

---

## Performance Optimization

### Server-Side Optimizations

**1. Model Preloading**

```bash
# Keep models in VRAM for instant responses
ollama run llama3.1:70b "warmup" --keepalive 24h
ollama run llama3.2:3b "warmup" --keepalive 24h
ollama run phi3:medium "warmup" --keepalive 24h
```

**2. Concurrent Request Handling**

```bash
# Increase parallel request limit (default: 4)
Environment="OLLAMA_NUM_PARALLEL=8"
```

**3. GPU Optimization**

```bash
# Ensure CUDA is using all GPUs
nvidia-smi -q -d PERFORMANCE  # Check GPU clocks
nvidia-smi -pm 1  # Enable persistence mode (reduces init time)
```

**4. Disk I/O Optimization**

```bash
# Move model storage to NVMe SSD
sudo mkdir /mnt/nvme/ollama-models
sudo chown ollama:ollama /mnt/nvme/ollama-models
Environment="OLLAMA_MODELS=/mnt/nvme/ollama-models"
```

### Client-Side Optimizations

**1. Request Debouncing**

```javascript
// Prevent duplicate requests during typing
let debounceTimer;
function debouncedOllamaRequest(prompt, delay = 300) {
  clearTimeout(debounceTimer);
  return new Promise(resolve => {
    debounceTimer = setTimeout(() => {
      resolve(ollamaGenerate(prompt));
    }, delay);
  });
}
```

**2. Response Caching**

```javascript
// Cache common queries
const responseCache = new Map();

async function cachedOllamaGenerate(model, prompt) {
  const cacheKey = `${model}:${prompt}`;

  if (responseCache.has(cacheKey)) {
    console.log('[Cache] Hit:', cacheKey);
    return responseCache.get(cacheKey);
  }

  const response = await ollamaGenerate(model, prompt);
  responseCache.set(cacheKey, response);

  // Expire cache after 1 hour
  setTimeout(() => responseCache.delete(cacheKey), 3600000);

  return response;
}
```

**3. Streaming Optimization**

```javascript
// Use streaming for better perceived performance
async function streamOllamaResponse(model, prompt, onChunk) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    body: JSON.stringify({ model, prompt, stream: true }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const data = JSON.parse(line);
      onChunk(data.response); // Stream each word to UI
    }
  }
}
```

### Network Optimizations

**1. HTTP/2 (via nginx)**

```nginx
server {
  listen 443 ssl http2;  # Enable HTTP/2
  # ... rest of config
}
```

**2. Compression**

```nginx
gzip on;
gzip_types application/json;
gzip_min_length 1000;
```

**3. Connection Pooling**

```javascript
// Reuse HTTP connections (browsers do this automatically)
// Ensure keep-alive is enabled on server
```

---

## Monitoring & Maintenance

### Metrics to Track

**Server Health:**

- GPU utilization (% per GPU)
- VRAM usage (GB per model)
- CPU load
- Network throughput
- Disk I/O

**Performance:**

- Average response time (per model)
- 95th percentile response time
- Requests per minute
- Queue depth
- Error rate

**Usage:**

- Active users per hour
- Total requests per day
- Popular models
- Peak usage times

### Monitoring Tools

**Option 1: Prometheus + Grafana**

**Setup:**

```bash
# 1. Install Prometheus
sudo apt install prometheus -y

# 2. Configure Prometheus to scrape Ollama metrics
# (Requires custom exporter - future work)

# 3. Install Grafana
sudo apt-get install -y software-properties-common
sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
sudo apt-get update
sudo apt-get install grafana -y
sudo systemctl start grafana-server

# 4. Access Grafana at http://ai.college.local:3000
```

**Dashboard Panels:**

- GPU Utilization (line graph)
- Requests per Minute (line graph)
- Response Time Distribution (histogram)
- Active Users (gauge)
- Error Rate (single stat)

**Option 2: Simple Logging**

```bash
# Log all requests via nginx
log_format ai_requests '$remote_addr - [$time_local] '
                       '"$request" $status $body_bytes_sent '
                       '$request_time "$http_user_agent"';

access_log /var/log/nginx/ai-access.log ai_requests;

# Daily analysis script
#!/bin/bash
# ai-report.sh - Generate daily usage report

LOG_FILE="/var/log/nginx/ai-access.log"
TODAY=$(date +%Y-%m-%d)

echo "=== AI Server Report - $TODAY ==="
echo "Total Requests: $(grep "$TODAY" $LOG_FILE | wc -l)"
echo "Unique IPs: $(grep "$TODAY" $LOG_FILE | awk '{print $1}' | sort -u | wc -l)"
echo "Avg Response Time: $(grep "$TODAY" $LOG_FILE | awk '{sum+=$NF; n++} END {print sum/n}')s"
echo "Errors: $(grep "$TODAY" $LOG_FILE | grep ' 5[0-9][0-9] ' | wc -l)"

# Email report to IT
mail -s "AI Server Daily Report" it@college.edu < /tmp/ai-report.txt
```

### Maintenance Schedule

**Daily:**

- Check server uptime and health
- Review error logs
- Monitor VRAM usage

**Weekly:**

- Review usage trends
- Update models if new versions available
- Test backup/restore procedure

**Monthly:**

- Performance tuning based on usage patterns
- User satisfaction survey
- Capacity planning review

**Quarterly:**

- Security audit
- OS and software updates
- Hardware health check (fans, temps)

### Backup & Disaster Recovery

**What to Backup:**

1. Model files (`/usr/share/ollama/.ollama/models/`) - 100GB+
2. Configuration (`/etc/systemd/system/ollama.service.d/`)
3. nginx config (if using HTTPS)
4. Usage logs (for auditing)

**Backup Strategy:**

```bash
#!/bin/bash
# backup-ai-server.sh

BACKUP_DIR="/mnt/backup/ai-server"
DATE=$(date +%Y%m%d)

# 1. Backup models (weekly - large)
if [ $(date +%u) -eq 1 ]; then
  rsync -av /usr/share/ollama/.ollama/models/ $BACKUP_DIR/models-$DATE/
fi

# 2. Backup config (daily - small)
tar -czf $BACKUP_DIR/config-$DATE.tar.gz \
  /etc/systemd/system/ollama.service.d/ \
  /etc/nginx/

# 3. Backup logs (daily)
cp /var/log/nginx/ai-access.log $BACKUP_DIR/logs-$DATE.log

# 4. Keep only last 30 days
find $BACKUP_DIR -mtime +30 -delete

echo "Backup completed: $DATE"
```

**Recovery Procedure:**

```bash
# 1. Reinstall OS and Ollama (if hardware failure)
# 2. Restore models
rsync -av /mnt/backup/ai-server/models-latest/ /usr/share/ollama/.ollama/models/

# 3. Restore config
tar -xzf /mnt/backup/ai-server/config-latest.tar.gz -C /

# 4. Restart services
sudo systemctl daemon-reload
sudo systemctl restart ollama nginx

# 5. Verify
curl http://localhost:11434/api/tags
```

**Recovery Time Objective (RTO):** 4 hours
**Recovery Point Objective (RPO):** 24 hours (daily backups)

### Alert Rules

**Critical Alerts** (page IT staff immediately):

- Server down (no response to health check for 5 minutes)
- VRAM usage >95% (risk of OOM crash)
- Error rate >25% (major issue)

**Warning Alerts** (email IT staff):

- Response time >10s for 10 consecutive requests
- VRAM usage >85%
- Disk space <10GB free

**Info Alerts** (log only):

- New model loaded
- Configuration changed
- Daily usage summary

---

## Risk Assessment

### Risk Matrix

| Risk                                   | Likelihood | Impact    | Mitigation                                           | Residual Risk |
| -------------------------------------- | ---------- | --------- | ---------------------------------------------------- | ------------- |
| Server hardware failure                | Low        | High      | Backup hardware, automatic fallback to localhost     | Low           |
| Network outage                         | Medium     | Medium    | Extension auto-fallback, redundant network paths     | Low           |
| Performance degradation (high load)    | Medium     | Medium    | Load balancing, request queuing, capacity monitoring | Low           |
| Security breach                        | Low        | High      | Firewall, network isolation, no internet access      | Very Low      |
| Student misuse (inappropriate prompts) | High       | Low       | Content filtering (optional), usage policies         | Low           |
| Model quality issues (hallucinations)  | Medium     | Medium    | User education, "AI may make mistakes" disclaimer    | Medium        |
| Budget overrun                         | Low        | Medium    | Fixed hardware cost, no ongoing cloud fees           | Very Low      |
| FERPA compliance violation             | Very Low   | Very High | Data stays on-prem, legal review, no logging         | Very Low      |

### Mitigation Details

**Hardware Failure:**

- Hot spare GPU in case of failure
- Automated health checks every 5 minutes
- Extension automatically falls back to localhost if server unreachable
- SLA: 4-hour recovery time

**Performance Issues:**

- Monitoring dashboard with alerts at 80% VRAM usage
- Auto-scaling: Add second AI server if sustained >80% load
- Request queuing prevents server overload
- Progressive timeout: 30s → 60s → 90s before giving up

**Security:**

- Air-gapped server (no internet access)
- Firewall limited to campus IP range
- Optional: API keys per user (Phase 2)
- Regular security audits

---

## Cost-Benefit Analysis

### Costs

**Capital Expenses (One-Time):**
| Item | Cost | Notes |
|------|------|-------|
| AI Server Hardware | $12,000 - $18,000 | 2× A100 80GB or 4× RTX 4090 24GB |
| Additional RAM (128GB) | $1,000 | If not included |
| Network Upgrades (optional) | $0 - $2,000 | 10GbE switch if needed |
| **Total CapEx** | **$13,000 - $21,000** | |

**Operating Expenses (Annual):**
| Item | Cost | Notes |
|------|------|-------|
| Electricity (600W avg, 24/7) | $630 | $0.12/kWh × 600W × 8760hr |
| Cooling (assume 50% of power) | $315 | Additional HVAC load |
| IT Labor (5hr/week @ $50/hr) | $13,000 | Monitoring, maintenance |
| **Total OpEx (Year 1)** | **$13,945** | |
| **Total OpEx (Year 2+)** | **$945** | Labor becomes routine (1hr/week) |

**Total Cost Over 3 Years:** $36,835

### Benefits

**Cost Savings (vs. Student Laptop GPU Upgrades):**

- 100 students × $1,500/laptop upgrade = $150,000
- Network AI Server CapEx = $15,000
- **Net Savings:** $135,000 (89% cost reduction)

**Productivity Gains:**

- Students save avg. 2 hours/week with AI assistance
- 100 students × 2 hr/week × 30 weeks × $15/hr (student time value) = $90,000/year
- 3-year benefit: $270,000

**IT Labor Savings:**

- 100 individual Ollama installs: 20 minutes each = 33 hours @ $50/hr = $1,650
- Support tickets: 10/semester × 4 semesters × 0.5hr × $50/hr = $1,000
- Network model: 5 hours setup, minimal support = $250
- **Savings:** $2,400 over 3 years

**Institutional Benefits** (non-monetary):

- Enhanced reputation (AI-augmented learning)
- Student recruitment advantage
- Faculty research opportunities (studying AI in education)
- Scalable to other departments (not just students)

### Return on Investment (ROI)

**3-Year ROI:**

```
Total Benefits: $135,000 (cost savings) + $270,000 (productivity) = $405,000
Total Costs: $36,835
ROI = (405,000 - 36,835) / 36,835 = 999%
```

**Payback Period:** 1.5 months (cost savings alone cover CapEx)

**Sensitivity Analysis:**

| Scenario                     | 3-Year ROI |
| ---------------------------- | ---------- |
| **Base Case** (100 students) | 999%       |
| Low Adoption (50 students)   | 312%       |
| High Adoption (200 students) | 2,098%     |
| Hardware costs 50% higher    | 664%       |
| Productivity gains 50% lower | 525%       |

**All scenarios show positive ROI > 300%**

---

## Future Enhancements

### Phase 2 Features (6-12 months)

**1. User Authentication & Rate Limiting**

- Integration with Canvas LMS (LTI)
- API keys per student
- Usage quotas (e.g., 100 requests/day per student)
- Admin dashboard showing per-user usage

**2. Multi-Server Load Balancing**

```
nginx (load balancer)
  ├─> AI Server 1 (Llama 70B)
  ├─> AI Server 2 (Llama 3B × 10)
  └─> AI Server 3 (Phi-3 × 15)
```

**3. Advanced Model Routing**

- Automatic model selection based on:
  - Prompt complexity (keyword analysis)
  - User history (power users get 70B, novices get 3B)
  - Time of day (throttle during peak hours)

**4. Analytics Dashboard**

- Usage trends over time
- Most popular features
- Student success correlation (grades vs. AI usage)
- Faculty adoption metrics

**5. Federated Deployment**

```
Engineering Dept. → AI Server 1 (STEM-focused models)
Liberal Arts Dept. → AI Server 2 (Writing-focused models)
Medical School → AI Server 3 (Medical terminology models)
```

### Phase 3 Features (12-24 months)

**1. Fine-Tuned Models**

- Train custom models on:
  - Course-specific content (textbooks, lectures)
  - Institution-specific terminology
  - Past student Q&A patterns

**2. Multi-Modal AI**

- Image understanding (diagram analysis)
- Audio input (lecture transcription)
- Video processing (lab demo walkthroughs)

**3. Collaborative Features**

- Study groups (shared AI conversation threads)
- Peer tutoring (AI suggests student tutors)
- Faculty insights (AI flags struggling students)

**4. Research Platform**

- IRB-approved data collection
- A/B testing of AI interventions
- Publish findings in ed-tech journals

### Scalability Path

**100 students → 1,000 students → 10,000 students**

| Scale  | Servers | VRAM  | Cost  | Architecture        |
| ------ | ------- | ----- | ----- | ------------------- |
| 100    | 1       | 104GB | $15K  | Single server       |
| 1,000  | 3       | 312GB | $45K  | Load balanced       |
| 10,000 | 10      | 1TB   | $150K | Distributed cluster |

**Cloud Comparison:**

- 10,000 students × 20 requests/day × $0.01/request = $2,000/day = $730K/year
- On-prem cost for 10,000 students: $150K CapEx + $10K/yr OpEx
- **Savings at scale:** $4.6M over 3 years

---

## Conclusion

### Summary

The Network AI Server architecture is a **highly viable and cost-effective** approach to deploying AssisT at institutional scale. With minimal code changes (~210 lines) and a 104GB VRAM workstation, an educational institution can provide powerful, private AI assistance to 100+ students.

### Key Advantages

1. **Cost:** 90% savings vs. student laptop upgrades
2. **Privacy:** 100% on-campus, FERPA-compliant
3. **Performance:** Access to larger, more capable models
4. **Simplicity:** Zero client-side installation requirements
5. **Scalability:** Proven path from 100 to 10,000 students

### Recommended Next Steps

1. **Immediate:** Create `network-ai-server` branch with code changes
2. **Week 1:** Provision AI server hardware
3. **Week 2:** Configure server and test with IT staff
4. **Week 3:** Pilot with 5 users, gather feedback
5. **Week 4:** Load test and optimize
6. **Week 5-6:** Production pilot with one class
7. **Week 7+:** Full deployment decision

### Success Factors

✅ Strong institutional support (IT, legal, leadership)
✅ Adequate hardware investment (104GB VRAM)
✅ Clear communication with students and faculty
✅ Robust monitoring and support processes
✅ Iterative approach (PoC → Pilot → Production)

---

## Appendix

### A. Glossary

**VRAM:** Video RAM, memory on GPU used for AI models
**Ollama:** Open-source tool for running large language models locally
**LAN:** Local Area Network, college campus network
**FERPA:** Family Educational Rights and Privacy Act
**LTI:** Learning Tools Interoperability (Canvas integration standard)
**RTO:** Recovery Time Objective (max downtime tolerance)
**RPO:** Recovery Point Objective (max data loss tolerance)

### B. References

- Ollama Documentation: https://github.com/ollama/ollama
- Llama 3.1 Model Card: https://ai.meta.com/llama/
- FERPA Compliance Guide: https://www2.ed.gov/policy/gen/guid/fpco/ferpa/
- Chrome Extension Architecture: https://developer.chrome.com/docs/extensions/

### C. Contact & Support

**Project Lead:** [Your Name]
**IT Contact:** [College IT Department]
**Security Contact:** [College InfoSec Team]
**Legal Contact:** [College General Counsel]

### D. Change Log

| Version | Date       | Changes              | Author |
| ------- | ---------- | -------------------- | ------ |
| 1.0     | 2026-02-14 | Initial plan created | Claude |

---

**End of Network AI Server Architecture Plan**
