/**
 * Project Manager Module
 *
 * Provides UI for organizing citations into projects with Kanban view.
 * Features:
 * - Create, edit, delete projects
 * - Kanban view (To Read / Reading / Cited columns)
 * - Assign citations to projects
 * - Tag-based organization
 * - Drag and drop between columns
 *
 * @module features/citations/project-manager
 * @version 1.0.0
 */

import { CitationStorage, ProjectStorage } from './citation-storage.js';
import { formatInText } from './citation-formatter.js';
import { showSuccessToast, showErrorToast } from './citation-ui.js';
import { sanitizeHTML } from '../../utils/sanitize.js';
import { attachInteractiveHandler, attachQuietHandler } from '../../utils/event-handlers.js';

/**
 * Citation status for Kanban columns
 */
const CitationStatus = {
  TO_READ: 'to_read',
  READING: 'reading',
  CITED: 'cited',
};

/**
 * Project Manager class
 * Manages project organization and Kanban view
 */
class ProjectManager {
  constructor() {
    this.modal = null;
    this.projects = [];
    this.currentProject = null;
    this.citations = [];
    this.draggedCitation = null;
  }

  /**
   * Open the Project Manager modal
   */
  async open() {
    // Load data
    this.projects = await ProjectStorage.getAll();
    this.citations = await CitationStorage.getAll();

    // Create and show modal
    this.modal = this.createModal();
    document.body.appendChild(this.modal);

    // Apply styles
    this.applyStyles();

    // Render initial content
    this.renderProjectList();
    this.renderKanban();

    // Focus
    setTimeout(() => {
      const firstProject = this.modal.querySelector('.proj-item');
      if (firstProject) {
        firstProject.focus();
      }
    }, 100);
  }

  /**
   * Close the modal
   */
  close() {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }

  /**
   * Create the main modal structure
   */
  createModal() {
    const overlay = document.createElement('div');
    overlay.className = 'proj-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'proj-modal-title');

    overlay.innerHTML = sanitizeHTML(`
      <div class="proj-modal">
        <div class="proj-modal-header">
          <h2 id="proj-modal-title">
            <span class="proj-icon">📁</span>
            Project Manager
          </h2>
          <button class="proj-close-btn" aria-label="Close">✕</button>
        </div>

        <div class="proj-layout">
          <!-- Sidebar: Project List -->
          <div class="proj-sidebar">
            <div class="proj-sidebar-header">
              <h3>Projects</h3>
              <button class="proj-new-btn" title="Create new project">+ New</button>
            </div>
            <div class="proj-list" id="proj-list">
              <!-- Projects rendered here -->
            </div>
            <div class="proj-sidebar-footer">
              <button class="proj-all-btn ${!this.currentProject ? 'active' : ''}">
                📚 All Citations (${this.citations.length})
              </button>
            </div>
          </div>

          <!-- Main: Kanban Board -->
          <div class="proj-main">
            <div class="proj-kanban-header">
              <h3 id="proj-kanban-title">
                ${this.currentProject ? this.currentProject.name : 'All Citations'}
              </h3>
              ${
                this.currentProject
                  ? `
                <div class="proj-kanban-actions">
                  <button class="proj-edit-btn" title="Edit project">✏️</button>
                  <button class="proj-delete-btn" title="Delete project">🗑️</button>
                </div>
              `
                  : ''
              }
            </div>

            <div class="proj-kanban" id="proj-kanban">
              <div class="proj-kanban-column" data-status="${CitationStatus.TO_READ}">
                <div class="proj-column-header">
                  <span class="proj-column-icon">📖</span>
                  <span class="proj-column-title">To Read</span>
                  <span class="proj-column-count" id="count-to-read">0</span>
                </div>
                <div class="proj-column-cards" data-status="${CitationStatus.TO_READ}">
                  <!-- Cards rendered here -->
                </div>
              </div>

              <div class="proj-kanban-column" data-status="${CitationStatus.READING}">
                <div class="proj-column-header">
                  <span class="proj-column-icon">📝</span>
                  <span class="proj-column-title">Reading</span>
                  <span class="proj-column-count" id="count-reading">0</span>
                </div>
                <div class="proj-column-cards" data-status="${CitationStatus.READING}">
                  <!-- Cards rendered here -->
                </div>
              </div>

              <div class="proj-kanban-column" data-status="${CitationStatus.CITED}">
                <div class="proj-column-header">
                  <span class="proj-column-icon">✅</span>
                  <span class="proj-column-title">Cited</span>
                  <span class="proj-column-count" id="count-cited">0</span>
                </div>
                <div class="proj-column-cards" data-status="${CitationStatus.CITED}">
                  <!-- Cards rendered here -->
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `);

    // Event listeners
    this.attachEventListeners(overlay);

    return overlay;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners(overlay) {
    // Close button
    const closeBtn = overlay.querySelector('.proj-close-btn');
    attachQuietHandler(closeBtn, 'Project Manager Close', () => this.close());

    // Click outside
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        this.close();
      }
    });

    // ESC to close
    const handleEsc = e => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);

    // New project button
    const newBtn = overlay.querySelector('.proj-new-btn');
    attachInteractiveHandler(newBtn, 'New Project', () => this.showCreateProjectModal());

    // All citations button
    const allBtn = overlay.querySelector('.proj-all-btn');
    attachInteractiveHandler(allBtn, 'All Citations', () => {
      this.currentProject = null;
      this.renderProjectList();
      this.renderKanban();
    });

    // Edit project button
    const editBtn = overlay.querySelector('.proj-edit-btn');
    if (editBtn) {
      attachInteractiveHandler(editBtn, 'Edit Project', () => this.showEditProjectModal());
    }

    // Delete project button
    const deleteBtn = overlay.querySelector('.proj-delete-btn');
    if (deleteBtn) {
      attachInteractiveHandler(deleteBtn, 'Delete Project', () => this.deleteProject());
    }

    // Drag and drop on columns
    this.setupDragAndDrop(overlay);
  }

  /**
   * Setup drag and drop for Kanban cards
   */
  setupDragAndDrop(overlay) {
    const columns = overlay.querySelectorAll('.proj-column-cards');

    columns.forEach(column => {
      column.addEventListener('dragover', e => {
        e.preventDefault();
        column.classList.add('drag-over');
      });

      column.addEventListener('dragleave', e => {
        e.preventDefault();
        column.classList.remove('drag-over');
      });

      column.addEventListener('drop', async e => {
        e.preventDefault();
        column.classList.remove('drag-over');

        if (this.draggedCitation) {
          const newStatus = column.dataset.status;
          await this.updateCitationStatus(this.draggedCitation, newStatus);
          this.draggedCitation = null;
          this.renderKanban();
        }
      });
    });
  }

  /**
   * Render the project list in sidebar
   */
  renderProjectList() {
    const container = this.modal.querySelector('#proj-list');

    if (this.projects.length === 0) {
      container.innerHTML = sanitizeHTML(`
        <div class="proj-empty">
          <p>No projects yet</p>
          <p class="proj-empty-hint">Click "+ New" to create one</p>
        </div>
      `);
      return;
    }

    container.innerHTML = sanitizeHTML(
      this.projects
        .map(
          project => `
      <div class="proj-item ${this.currentProject?.id === project.id ? 'active' : ''}"
           data-id="${project.id}"
           tabindex="0"
           role="button">
        <span class="proj-item-icon">📁</span>
        <div class="proj-item-content">
          <span class="proj-item-name">${this.escapeHTML(project.name)}</span>
          <span class="proj-item-count">${this.getProjectCitationCount(project.id)} citations</span>
        </div>
      </div>
    `
        )
        .join('')
    );

    // Add click listeners
    container.querySelectorAll('.proj-item').forEach(item => {
      attachInteractiveHandler(item, `Project Item: ${item.dataset.id}`, () => {
        const projectId = item.dataset.id;
        this.currentProject = this.projects.find(p => String(p.id) === projectId);
        this.renderProjectList();
        this.renderKanban();
        this.updateKanbanHeader();
      });

      item.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          item.click();
        }
      });
    });

    // Update "All Citations" button state
    const allBtn = this.modal.querySelector('.proj-all-btn');
    if (allBtn) {
      allBtn.classList.toggle('active', !this.currentProject);
      allBtn.innerHTML = `📚 All Citations (${this.citations.length})`;
    }
  }

  /**
   * Update Kanban header
   */
  updateKanbanHeader() {
    const header = this.modal.querySelector('.proj-kanban-header');
    header.innerHTML = sanitizeHTML(`
      <h3 id="proj-kanban-title">
        ${this.currentProject ? this.escapeHTML(this.currentProject.name) : 'All Citations'}
      </h3>
      ${
        this.currentProject
          ? `
        <div class="proj-kanban-actions">
          <button class="proj-edit-btn" title="Edit project">✏️</button>
          <button class="proj-delete-btn" title="Delete project">🗑️</button>
        </div>
      `
          : ''
      }
    `);

    // Re-attach event listeners
    const editBtn = header.querySelector('.proj-edit-btn');
    if (editBtn) {
      attachInteractiveHandler(editBtn, 'Edit Project', () => this.showEditProjectModal());
    }

    const deleteBtn = header.querySelector('.proj-delete-btn');
    if (deleteBtn) {
      attachInteractiveHandler(deleteBtn, 'Delete Project', () => this.deleteProject());
    }
  }

  /**
   * Get citation count for a project
   */
  getProjectCitationCount(projectId) {
    return this.citations.filter(c => c.projectId === String(projectId)).length;
  }

  /**
   * Get citations for current view (project or all)
   */
  getCurrentCitations() {
    if (this.currentProject) {
      return this.citations.filter(c => c.projectId === String(this.currentProject.id));
    }
    return this.citations;
  }

  /**
   * Render Kanban board
   */
  renderKanban() {
    const citations = this.getCurrentCitations();

    // Group by status
    const toRead = citations.filter(
      c => !c.citationStatus || c.citationStatus === CitationStatus.TO_READ
    );
    const reading = citations.filter(c => c.citationStatus === CitationStatus.READING);
    const cited = citations.filter(c => c.citationStatus === CitationStatus.CITED);

    // Render columns
    this.renderColumn(CitationStatus.TO_READ, toRead);
    this.renderColumn(CitationStatus.READING, reading);
    this.renderColumn(CitationStatus.CITED, cited);

    // Update counts
    this.modal.querySelector('#count-to-read').textContent = toRead.length;
    this.modal.querySelector('#count-reading').textContent = reading.length;
    this.modal.querySelector('#count-cited').textContent = cited.length;
  }

  /**
   * Render a single Kanban column
   */
  renderColumn(status, citations) {
    const container = this.modal.querySelector(`.proj-column-cards[data-status="${status}"]`);

    if (citations.length === 0) {
      container.innerHTML = sanitizeHTML(`
        <div class="proj-card-empty">
          Drop citations here
        </div>
      `);
      return;
    }

    container.innerHTML = sanitizeHTML(
      citations.map(citation => this.renderCard(citation)).join('')
    );

    // Add drag listeners
    container.querySelectorAll('.proj-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        this.draggedCitation = this.citations.find(c => String(c.id) === card.dataset.id);
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });
    });
  }

  /**
   * Render a single citation card
   */
  renderCard(citation) {
    const inText = formatInText(citation);
    const truncatedTitle =
      citation.title.length > 60 ? citation.title.substring(0, 60) + '...' : citation.title;

    return `
      <div class="proj-card" data-id="${citation.id}" draggable="true">
        <div class="proj-card-title">${this.escapeHTML(truncatedTitle)}</div>
        <div class="proj-card-author">${this.escapeHTML(citation.authors[0] || 'Unknown')}</div>
        <div class="proj-card-intext">${inText}</div>
        ${
          !this.currentProject
            ? `
          <div class="proj-card-project">
            ${citation.projectId ? this.getProjectName(citation.projectId) : 'No project'}
          </div>
        `
            : ''
        }
      </div>
    `;
  }

  /**
   * Get project name by ID
   */
  getProjectName(projectId) {
    const project = this.projects.find(p => String(p.id) === String(projectId));
    return project ? `📁 ${project.name}` : '';
  }

  /**
   * Update citation status
   */
  async updateCitationStatus(citation, newStatus) {
    try {
      await CitationStorage.update(String(citation.id), { citationStatus: newStatus });
      // Update local cache
      const idx = this.citations.findIndex(c => c.id === citation.id);
      if (idx !== -1) {
        this.citations[idx].citationStatus = newStatus;
      }
      showSuccessToast(`Moved to ${this.getStatusLabel(newStatus)}`);
    } catch (error) {
      console.error('[ProjectManager] Error updating status:', error);
      showErrorToast('Failed to move citation');
    }
  }

  /**
   * Get human-readable status label
   */
  getStatusLabel(status) {
    const labels = {
      [CitationStatus.TO_READ]: 'To Read',
      [CitationStatus.READING]: 'Reading',
      [CitationStatus.CITED]: 'Cited',
    };
    return labels[status] || status;
  }

  /**
   * Show create project modal
   */
  async showCreateProjectModal() {
    const name = prompt('Enter project name:');
    if (!name?.trim()) {
      return;
    }

    try {
      const projectId = await ProjectStorage.create(name.trim());
      this.projects = await ProjectStorage.getAll();
      this.currentProject = this.projects.find(p => String(p.id) === projectId);
      this.renderProjectList();
      this.renderKanban();
      this.updateKanbanHeader();
      showSuccessToast('Project created!');
    } catch (error) {
      console.error('[ProjectManager] Error creating project:', error);
      showErrorToast('Failed to create project');
    }
  }

  /**
   * Show edit project modal
   */
  async showEditProjectModal() {
    if (!this.currentProject) {
      return;
    }

    const name = prompt('Edit project name:', this.currentProject.name);
    if (!name?.trim() || name === this.currentProject.name) {
      return;
    }

    try {
      await ProjectStorage.update(String(this.currentProject.id), { name: name.trim() });
      this.currentProject.name = name.trim();
      this.projects = await ProjectStorage.getAll();
      this.renderProjectList();
      this.updateKanbanHeader();
      showSuccessToast('Project updated!');
    } catch (error) {
      console.error('[ProjectManager] Error updating project:', error);
      showErrorToast('Failed to update project');
    }
  }

  /**
   * Delete current project
   */
  async deleteProject() {
    if (!this.currentProject) {
      return;
    }

    const count = this.getProjectCitationCount(this.currentProject.id);
    const msg =
      count > 0
        ? `Delete "${this.currentProject.name}"? ${count} citation(s) will be unassigned.`
        : `Delete "${this.currentProject.name}"?`;

    if (!confirm(msg)) {
      return;
    }

    try {
      await ProjectStorage.delete(String(this.currentProject.id));

      // Update local cache
      this.citations = this.citations.map(c => {
        if (c.projectId === String(this.currentProject.id)) {
          return { ...c, projectId: null };
        }
        return c;
      });

      this.projects = await ProjectStorage.getAll();
      this.currentProject = null;
      this.renderProjectList();
      this.renderKanban();
      this.updateKanbanHeader();
      showSuccessToast('Project deleted');
    } catch (error) {
      console.error('[ProjectManager] Error deleting project:', error);
      showErrorToast('Failed to delete project');
    }
  }

  /**
   * Escape HTML
   */
  escapeHTML(str) {
    if (!str) {
      return '';
    }
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Apply styles
   */
  applyStyles() {
    if (document.getElementById('proj-manager-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'proj-manager-styles';
    style.textContent = `
      .proj-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999996;
        padding: 20px;
      }

      .proj-modal {
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        width: 100%;
        max-width: 1000px;
        height: 80vh;
        display: flex;
        flex-direction: column;
      }

      .proj-modal-header {
        padding: 16px 24px;
        border-bottom: 1px solid #e0e0e0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .proj-modal-header h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .proj-close-btn {
        background: none;
        border: none;
        font-size: 24px;
        color: #666;
        cursor: pointer;
        padding: 4px;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        transition: background 0.2s;
      }

      .proj-close-btn:hover {
        background: #f5f5f5;
      }

      .proj-layout {
        display: flex;
        flex: 1;
        overflow: hidden;
      }

      /* Sidebar */
      .proj-sidebar {
        width: 240px;
        border-right: 1px solid #e0e0e0;
        display: flex;
        flex-direction: column;
        background: #f9f9f9;
      }

      .proj-sidebar-header {
        padding: 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #e0e0e0;
      }

      .proj-sidebar-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: #666;
        text-transform: uppercase;
      }

      .proj-new-btn {
        background: #2196f3;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
        transition: background 0.2s;
      }

      .proj-new-btn:hover {
        background: #1976d2;
      }

      .proj-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
      }

      .proj-item {
        padding: 12px;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        transition: background 0.2s;
        margin-bottom: 4px;
      }

      .proj-item:hover {
        background: #e8e8e8;
      }

      .proj-item.active {
        background: #e3f2fd;
      }

      .proj-item-icon {
        font-size: 18px;
      }

      .proj-item-content {
        flex: 1;
        min-width: 0;
      }

      .proj-item-name {
        display: block;
        font-weight: 500;
        color: #333;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .proj-item-count {
        font-size: 12px;
        color: #888;
      }

      .proj-sidebar-footer {
        padding: 12px;
        border-top: 1px solid #e0e0e0;
      }

      .proj-all-btn {
        width: 100%;
        padding: 12px;
        background: white;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        text-align: left;
        transition: all 0.2s;
      }

      .proj-all-btn:hover {
        background: #f5f5f5;
      }

      .proj-all-btn.active {
        background: #e3f2fd;
        border-color: #2196f3;
      }

      .proj-empty {
        text-align: center;
        padding: 24px 16px;
        color: #888;
      }

      .proj-empty-hint {
        font-size: 12px;
        color: #aaa;
        margin-top: 4px;
      }

      /* Main content */
      .proj-main {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .proj-kanban-header {
        padding: 16px 24px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #e0e0e0;
      }

      .proj-kanban-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }

      .proj-kanban-actions {
        display: flex;
        gap: 8px;
      }

      .proj-kanban-actions button {
        background: none;
        border: 1px solid #e0e0e0;
        padding: 6px 10px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .proj-kanban-actions button:hover {
        background: #f5f5f5;
      }

      .proj-delete-btn:hover {
        background: #ffebee !important;
        border-color: #f44336 !important;
      }

      /* Kanban board */
      .proj-kanban {
        display: flex;
        flex: 1;
        gap: 16px;
        padding: 16px 24px;
        overflow-x: auto;
      }

      .proj-kanban-column {
        flex: 1;
        min-width: 220px;
        max-width: 300px;
        background: #f5f5f5;
        border-radius: 10px;
        display: flex;
        flex-direction: column;
      }

      .proj-column-header {
        padding: 12px 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        border-bottom: 1px solid #e0e0e0;
      }

      .proj-column-icon {
        font-size: 16px;
      }

      .proj-column-title {
        font-weight: 600;
        font-size: 14px;
        color: #333;
      }

      .proj-column-count {
        margin-left: auto;
        background: #e0e0e0;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
        color: #666;
      }

      .proj-column-cards {
        flex: 1;
        padding: 12px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 100px;
      }

      .proj-column-cards.drag-over {
        background: #e3f2fd;
      }

      .proj-card-empty {
        text-align: center;
        padding: 24px 16px;
        color: #aaa;
        font-size: 13px;
        border: 2px dashed #ddd;
        border-radius: 8px;
      }

      /* Citation cards */
      .proj-card {
        background: white;
        border-radius: 8px;
        padding: 12px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        cursor: grab;
        transition: box-shadow 0.2s, transform 0.2s;
      }

      .proj-card:hover {
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
        transform: translateY(-1px);
      }

      .proj-card.dragging {
        opacity: 0.5;
        transform: rotate(2deg);
      }

      .proj-card-title {
        font-weight: 500;
        font-size: 13px;
        color: #333;
        margin-bottom: 6px;
        line-height: 1.3;
      }

      .proj-card-author {
        font-size: 12px;
        color: #666;
        margin-bottom: 8px;
      }

      .proj-card-intext {
        font-family: monospace;
        font-size: 11px;
        background: #f0f7ff;
        padding: 4px 8px;
        border-radius: 4px;
        color: #0066cc;
      }

      .proj-card-project {
        margin-top: 8px;
        font-size: 11px;
        color: #888;
      }
    `;
    document.head.appendChild(style);
  }
}

// Singleton instance
let projectManager = null;

/**
 * Open the Project Manager
 */
export async function openProjectManager() {
  if (projectManager?.modal) {
    return;
  }

  projectManager = new ProjectManager();
  await projectManager.open();
}

/**
 * Close the Project Manager
 */
export function closeProjectManager() {
  if (projectManager) {
    projectManager.close();
    projectManager = null;
  }
}

export default {
  openProjectManager,
  closeProjectManager,
  ProjectManager,
  CitationStatus,
};
