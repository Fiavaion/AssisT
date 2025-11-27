/**
 * Accordion Manager for AssisT Popup
 * Handles collapsible sections with state persistence and keyboard navigation
 *
 * @module AccordionManager
 */

class AccordionManager {
  constructor() {
    this.sections = new Map();
    this.storageKey = 'assist_accordion_state';
    this.headers = [];
    this.animationDuration = {
      expand: 200,
      collapse: 150,
    };
  }

  /**
   * Initialize all accordion sections
   */
  async init() {
    const accordionSections = document.querySelectorAll('.accordion-section');

    if (accordionSections.length === 0) {
      console.warn('AccordionManager: No accordion sections found');
      return;
    }

    const savedState = await this.loadState();

    accordionSections.forEach(section => {
      const sectionId = section.dataset.section;
      const header = section.querySelector('.accordion-header');
      const content = section.querySelector('.accordion-content');
      const icon = header?.querySelector('.accordion-icon');

      if (!header || !content) {
        return;
      }

      this.sections.set(sectionId, {
        element: section,
        header,
        content,
        icon,
        isExpanded: false,
      });

      this.headers.push(header);

      // Initial collapsed state
      content.style.maxHeight = '0';
      content.style.overflow = 'hidden';
      content.style.transition = `max-height ${this.animationDuration.collapse}ms ease-in`;

      // Event listeners
      header.addEventListener('click', () => this.toggle(sectionId));
      header.addEventListener('keydown', e => this.handleKeydown(e));
    });

    // Apply saved or default state
    if (savedState && Object.keys(savedState).length > 0) {
      for (const [sectionId, isExpanded] of Object.entries(savedState)) {
        if (this.sections.has(sectionId) && isExpanded) {
          this.expand(sectionId, false);
        }
      }
    } else {
      // Default: expand "reading" section
      if (this.sections.has('reading')) {
        this.expand('reading', false);
      }
    }
  }

  toggle(sectionId) {
    const section = this.sections.get(sectionId);
    if (!section) {
      return;
    }

    if (section.isExpanded) {
      this.collapse(sectionId);
    } else {
      this.expand(sectionId);
    }
  }

  expand(sectionId, animate = true) {
    const section = this.sections.get(sectionId);
    if (!section || section.isExpanded) {
      return;
    }

    const { header, content, icon } = section;

    header.setAttribute('aria-expanded', 'true');

    const contentHeight = content.scrollHeight;

    content.style.transition = animate
      ? `max-height ${this.animationDuration.expand}ms ease-out`
      : 'none';
    content.style.maxHeight = `${contentHeight}px`;

    if (icon) {
      icon.style.transition = animate
        ? `transform ${this.animationDuration.expand}ms ease-out`
        : 'none';
      icon.style.transform = 'rotate(180deg)';
    }

    section.isExpanded = true;
    this.saveState();

    if (!animate) {
      setTimeout(() => {
        content.style.transition = `max-height ${this.animationDuration.collapse}ms ease-in`;
      }, 0);
    }
  }

  collapse(sectionId) {
    const section = this.sections.get(sectionId);
    if (!section || !section.isExpanded) {
      return;
    }

    const { header, content, icon } = section;

    header.setAttribute('aria-expanded', 'false');
    content.style.transition = `max-height ${this.animationDuration.collapse}ms ease-in`;
    content.style.maxHeight = '0';

    if (icon) {
      icon.style.transition = `transform ${this.animationDuration.collapse}ms ease-in`;
      icon.style.transform = 'rotate(0deg)';
    }

    section.isExpanded = false;
    this.saveState();
  }

  async saveState() {
    const state = {};
    this.sections.forEach((section, sectionId) => {
      state[sectionId] = section.isExpanded;
    });

    try {
      await chrome.storage.local.set({ [this.storageKey]: state });
    } catch (error) {
      console.error('AccordionManager: Failed to save state', error);
    }
  }

  async loadState() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      return result[this.storageKey] || {};
    } catch (error) {
      console.error('AccordionManager: Failed to load state', error);
      return {};
    }
  }

  handleKeydown(event) {
    const currentHeader = event.target;
    const currentIndex = this.headers.indexOf(currentHeader);
    if (currentIndex === -1) {
      return;
    }

    let handled = false;

    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        const sectionId = Array.from(this.sections.entries()).find(
          ([_, section]) => section.header === currentHeader
        )?.[0];
        if (sectionId) {
          this.toggle(sectionId);
        }
        handled = true;
        break;

      case 'ArrowDown':
        event.preventDefault();
        if (currentIndex < this.headers.length - 1) {
          this.headers[currentIndex + 1].focus();
        }
        handled = true;
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (currentIndex > 0) {
          this.headers[currentIndex - 1].focus();
        }
        handled = true;
        break;

      case 'Home':
        event.preventDefault();
        this.headers[0].focus();
        handled = true;
        break;

      case 'End':
        event.preventDefault();
        this.headers[this.headers.length - 1].focus();
        handled = true;
        break;
    }

    if (handled) {
      event.stopPropagation();
    }
  }
}

// Create and export singleton
export const accordionManager = new AccordionManager();
