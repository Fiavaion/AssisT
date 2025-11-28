/**
 * Custom Vocabulary Manager for Speech-to-Text
 *
 * Manages custom word lists for improved recognition accuracy.
 * Stores vocabulary in IndexedDB using Dexie.js.
 *
 * Features:
 * - Custom word list storage with IndexedDB
 * - CRUD operations for vocabulary
 * - Import/export vocabulary (TXT, JSON)
 * - Subject-specific presets (Medical, Legal, Academic, STEM)
 * - Auto-learn from corrections
 * - Phonetic spelling hints (pronunciation guide)
 *
 * @module VocabularyManager
 * @version 1.0.0
 */

import Dexie from 'dexie';

/**
 * Vocabulary entry type
 * @typedef {Object} VocabularyEntry
 * @property {number} id - Auto-generated ID
 * @property {string} word - The word or phrase
 * @property {string} phonetic - Phonetic pronunciation hint
 * @property {string} category - Category (custom, medical, legal, academic, stem)
 * @property {string[]} tags - User-defined tags
 * @property {number} frequency - Usage frequency (for auto-learned words)
 * @property {boolean} autoLearned - Whether word was auto-learned from correction
 * @property {number} createdAt - Timestamp
 * @property {number} updatedAt - Timestamp
 */

/**
 * Subject-specific vocabulary presets
 */
export const VocabularyPresets = {
  MEDICAL: 'medical',
  LEGAL: 'legal',
  ACADEMIC: 'academic',
  STEM: 'stem',
  CUSTOM: 'custom',
};

/**
 * Medical vocabulary preset (common medical terms)
 */
const MEDICAL_VOCABULARY = [
  { word: 'acetaminophen', phonetic: 'uh-see-tuh-MIN-oh-fen' },
  { word: 'adenocarcinoma', phonetic: 'ad-uh-no-kar-suh-NO-muh' },
  { word: 'amoxicillin', phonetic: 'uh-mok-suh-SIL-in' },
  { word: 'anaphylaxis', phonetic: 'an-uh-fuh-LAK-sis' },
  { word: 'antibiotic', phonetic: 'an-tee-by-OT-ik' },
  { word: 'arrhythmia', phonetic: 'uh-RITH-mee-uh' },
  { word: 'benzodiazepine', phonetic: 'ben-zo-dy-AZ-uh-peen' },
  { word: 'biopsy', phonetic: 'BY-op-see' },
  { word: 'cardiovascular', phonetic: 'kar-dee-oh-VAS-kyoo-lar' },
  { word: 'catheter', phonetic: 'KATH-uh-ter' },
  { word: 'chemotherapy', phonetic: 'kee-moh-THER-uh-pee' },
  { word: 'cholesterol', phonetic: 'kuh-LES-tuh-rol' },
  { word: 'colonoscopy', phonetic: 'ko-luh-NOS-kuh-pee' },
  { word: 'CT scan', phonetic: 'see-tee skan' },
  { word: 'diabetes', phonetic: 'dy-uh-BEE-teez' },
  { word: 'dialysis', phonetic: 'dy-AL-uh-sis' },
  { word: 'echocardiogram', phonetic: 'ek-oh-KAR-dee-oh-gram' },
  { word: 'electrocardiogram', phonetic: 'ee-lek-troh-KAR-dee-oh-gram' },
  { word: 'endoscopy', phonetic: 'en-DOS-kuh-pee' },
  { word: 'epidural', phonetic: 'ep-ih-DOOR-ul' },
  { word: 'fibromyalgia', phonetic: 'fy-broh-my-AL-juh' },
  { word: 'gastroenterology', phonetic: 'gas-troh-en-ter-OL-uh-jee' },
  { word: 'hematology', phonetic: 'hee-muh-TOL-uh-jee' },
  { word: 'hypertension', phonetic: 'hy-per-TEN-shun' },
  { word: 'ibuprofen', phonetic: 'eye-byoo-PRO-fen' },
  { word: 'immunosuppressant', phonetic: 'im-yoo-noh-suh-PRES-unt' },
  { word: 'intravenous', phonetic: 'in-truh-VEE-nus' },
  { word: 'laparoscopy', phonetic: 'lap-uh-ROS-kuh-pee' },
  { word: 'leukemia', phonetic: 'loo-KEE-mee-uh' },
  { word: 'mammogram', phonetic: 'MAM-oh-gram' },
  { word: 'meningitis', phonetic: 'men-in-JY-tis' },
  { word: 'metformin', phonetic: 'met-FOR-min' },
  { word: 'MRI', phonetic: 'em-ar-eye' },
  { word: 'oncology', phonetic: 'on-KOL-uh-jee' },
  { word: 'ophthalmology', phonetic: 'of-thal-MOL-uh-jee' },
  { word: 'orthopedic', phonetic: 'or-thuh-PEE-dik' },
  { word: 'osteoporosis', phonetic: 'os-tee-oh-puh-RO-sis' },
  { word: 'pathology', phonetic: 'puh-THOL-uh-jee' },
  { word: 'penicillin', phonetic: 'pen-uh-SIL-in' },
  { word: 'pneumonia', phonetic: 'noo-MO-nyuh' },
  { word: 'prednisone', phonetic: 'PRED-nih-sone' },
  { word: 'pulmonary', phonetic: 'PUL-muh-nair-ee' },
  { word: 'radiology', phonetic: 'ray-dee-OL-uh-jee' },
  { word: 'rheumatoid', phonetic: 'ROO-muh-toyd' },
  { word: 'scoliosis', phonetic: 'sko-lee-O-sis' },
  { word: 'stethoscope', phonetic: 'STETH-uh-skope' },
  { word: 'ultrasound', phonetic: 'UL-truh-sound' },
  { word: 'vaccination', phonetic: 'vak-suh-NAY-shun' },
];

/**
 * Legal vocabulary preset (common legal terms)
 */
const LEGAL_VOCABULARY = [
  { word: 'acquittal', phonetic: 'uh-KWIT-ul' },
  { word: 'adjudication', phonetic: 'uh-joo-dih-KAY-shun' },
  { word: 'affidavit', phonetic: 'af-ih-DAY-vit' },
  { word: 'amicus curiae', phonetic: 'uh-MEE-kus KYOOR-ee-eye' },
  { word: 'appellant', phonetic: 'uh-PEL-unt' },
  { word: 'arraignment', phonetic: 'uh-RAYN-ment' },
  { word: 'bailiff', phonetic: 'BAY-lif' },
  { word: 'certiorari', phonetic: 'ser-shee-oh-RAR-ee' },
  { word: 'codicil', phonetic: 'KOD-ih-sil' },
  { word: 'contempt', phonetic: 'kun-TEMPT' },
  { word: 'counterclaim', phonetic: 'KOWN-ter-klaym' },
  { word: 'de facto', phonetic: 'day FAK-toh' },
  { word: 'de jure', phonetic: 'day JOOR-ee' },
  { word: 'defendant', phonetic: 'dih-FEN-dunt' },
  { word: 'deposition', phonetic: 'dep-oh-ZI-shun' },
  { word: 'easement', phonetic: 'EEZ-ment' },
  { word: 'eminent domain', phonetic: 'EM-ih-nunt doh-MAYN' },
  { word: 'estoppel', phonetic: 'es-TOP-ul' },
  { word: 'ex parte', phonetic: 'eks PAR-tay' },
  { word: 'fiduciary', phonetic: 'fih-DOO-shee-air-ee' },
  { word: 'habeas corpus', phonetic: 'HAY-bee-us KOR-pus' },
  { word: 'indictment', phonetic: 'in-DYT-ment' },
  { word: 'injunction', phonetic: 'in-JUNK-shun' },
  { word: 'jurisprudence', phonetic: 'joor-is-PROO-dunss' },
  { word: 'lien', phonetic: 'LEEN' },
  { word: 'litigation', phonetic: 'lit-ih-GAY-shun' },
  { word: 'mandamus', phonetic: 'man-DAY-mus' },
  { word: 'misfeasance', phonetic: 'mis-FEE-zunss' },
  { word: 'notarize', phonetic: 'NO-tuh-rize' },
  { word: 'plaintiff', phonetic: 'PLAYN-tif' },
  { word: 'precedent', phonetic: 'PRES-uh-dent' },
  { word: 'pro bono', phonetic: 'proh BO-noh' },
  { word: 'probate', phonetic: 'PRO-bayt' },
  { word: 'quid pro quo', phonetic: 'kwid proh KWOH' },
  { word: 'statute', phonetic: 'STACH-oot' },
  { word: 'subpoena', phonetic: 'suh-PEE-nuh' },
  { word: 'tort', phonetic: 'TORT' },
  { word: 'voir dire', phonetic: 'vwahr DEER' },
];

/**
 * Academic vocabulary preset (common academic terms)
 */
const ACADEMIC_VOCABULARY = [
  { word: 'abstract', phonetic: 'AB-strakt' },
  { word: 'accreditation', phonetic: 'uh-kred-ih-TAY-shun' },
  { word: 'algorithm', phonetic: 'AL-guh-rith-um' },
  { word: 'anthology', phonetic: 'an-THOL-uh-jee' },
  { word: 'bibliography', phonetic: 'bib-lee-OG-ruh-fee' },
  { word: 'citation', phonetic: 'sy-TAY-shun' },
  { word: 'colloquium', phonetic: 'kuh-LO-kwee-um' },
  { word: 'curriculum', phonetic: 'kuh-RIK-yoo-lum' },
  { word: 'dissertation', phonetic: 'dis-er-TAY-shun' },
  { word: 'empirical', phonetic: 'em-PIR-ih-kul' },
  { word: 'epistemology', phonetic: 'eh-pis-tuh-MOL-uh-jee' },
  { word: 'ethnography', phonetic: 'eth-NOG-ruh-fee' },
  { word: 'heuristic', phonetic: 'hyoo-RIS-tik' },
  { word: 'hypothesis', phonetic: 'hy-POTH-uh-sis' },
  { word: 'interdisciplinary', phonetic: 'in-ter-DIS-uh-plin-air-ee' },
  { word: 'methodology', phonetic: 'meth-ud-OL-uh-jee' },
  { word: 'paradigm', phonetic: 'PAIR-uh-dym' },
  { word: 'pedagogy', phonetic: 'PED-uh-go-jee' },
  { word: 'peer review', phonetic: 'PEER rih-VYOO' },
  { word: 'phenomenology', phonetic: 'feh-nom-en-OL-uh-jee' },
  { word: 'postulate', phonetic: 'POS-choo-layt' },
  { word: 'praxis', phonetic: 'PRAK-sis' },
  { word: 'qualitative', phonetic: 'KWOL-ih-tay-tiv' },
  { word: 'quantitative', phonetic: 'KWON-tih-tay-tiv' },
  { word: 'rubric', phonetic: 'ROO-brik' },
  { word: 'seminal', phonetic: 'SEM-ih-nul' },
  { word: 'symposium', phonetic: 'sim-PO-zee-um' },
  { word: 'synthesis', phonetic: 'SIN-thuh-sis' },
  { word: 'taxonomy', phonetic: 'tak-SON-uh-mee' },
  { word: 'thesis', phonetic: 'THEE-sis' },
  { word: 'zeitgeist', phonetic: 'ZYT-gyst' },
];

/**
 * STEM vocabulary preset (Science, Technology, Engineering, Math)
 */
const STEM_VOCABULARY = [
  { word: 'algorithm', phonetic: 'AL-guh-rith-um' },
  { word: 'amplitude', phonetic: 'AM-plih-tood' },
  { word: 'asymptote', phonetic: 'AS-im-toht' },
  { word: 'boolean', phonetic: 'BOO-lee-un' },
  { word: 'calculus', phonetic: 'KAL-kyoo-lus' },
  { word: 'catalyst', phonetic: 'KAT-uh-list' },
  { word: 'centrifugal', phonetic: 'sen-TRIF-yoo-gul' },
  { word: 'coefficient', phonetic: 'koh-uh-FISH-unt' },
  { word: 'covalent', phonetic: 'koh-VAY-lunt' },
  { word: 'cytoplasm', phonetic: 'SY-toh-plaz-um' },
  { word: 'derivative', phonetic: 'dih-RIV-uh-tiv' },
  { word: 'deoxyribonucleic', phonetic: 'dee-ok-see-ry-bo-noo-KLEE-ik' },
  { word: 'electromagnetic', phonetic: 'ee-lek-troh-mag-NET-ik' },
  { word: 'entropy', phonetic: 'EN-truh-pee' },
  { word: 'equilibrium', phonetic: 'ee-kwuh-LIB-ree-um' },
  { word: 'exponent', phonetic: 'ek-SPO-nunt' },
  { word: 'factorial', phonetic: 'fak-TOR-ee-ul' },
  { word: 'fibonacci', phonetic: 'fib-uh-NAH-chee' },
  { word: 'genome', phonetic: 'JEE-nohm' },
  { word: 'helix', phonetic: 'HEE-liks' },
  { word: 'hypothesis', phonetic: 'hy-POTH-uh-sis' },
  { word: 'integer', phonetic: 'IN-tuh-jer' },
  { word: 'isotope', phonetic: 'EYE-suh-tohp' },
  { word: 'kinetic', phonetic: 'kih-NET-ik' },
  { word: 'logarithm', phonetic: 'LOG-uh-rith-um' },
  { word: 'mitochondria', phonetic: 'my-toh-KON-dree-uh' },
  { word: 'molecule', phonetic: 'MOL-uh-kyool' },
  { word: 'nanotechnology', phonetic: 'nan-oh-tek-NOL-uh-jee' },
  { word: 'nucleus', phonetic: 'NOO-klee-us' },
  { word: 'osmosis', phonetic: 'oz-MO-sis' },
  { word: 'oxidation', phonetic: 'ok-sih-DAY-shun' },
  { word: 'photosynthesis', phonetic: 'foh-toh-SIN-thuh-sis' },
  { word: 'polynomial', phonetic: 'pol-ee-NO-mee-ul' },
  { word: 'probability', phonetic: 'prob-uh-BIL-ih-tee' },
  { word: 'quadratic', phonetic: 'kwod-RAT-ik' },
  { word: 'quantum', phonetic: 'KWON-tum' },
  { word: 'semiconductor', phonetic: 'sem-ee-kun-DUK-ter' },
  { word: 'theorem', phonetic: 'THEE-ur-um' },
  { word: 'thermodynamics', phonetic: 'ther-moh-dy-NAM-iks' },
  { word: 'topology', phonetic: 'tuh-POL-uh-jee' },
  { word: 'variable', phonetic: 'VAIR-ee-uh-bul' },
  { word: 'velocity', phonetic: 'vuh-LOS-ih-tee' },
  { word: 'wavelength', phonetic: 'WAYV-length' },
];

/**
 * Initialize Dexie database for vocabulary
 */
class VocabularyDatabase extends Dexie {
  constructor() {
    super('AssistVocabulary');

    this.version(1).stores({
      vocabulary: '++id, word, category, *tags, autoLearned, createdAt',
      settings: 'key',
    });

    this.vocabulary = this.table('vocabulary');
    this.settings = this.table('settings');
  }
}

// Singleton instance
let db = null;

/**
 * Get or create database instance
 * @returns {VocabularyDatabase}
 */
function getDatabase() {
  if (!db) {
    db = new VocabularyDatabase();
  }
  return db;
}

/**
 * Vocabulary Manager class
 */
export class VocabularyManager {
  constructor(options = {}) {
    this.settings = {
      autoLearnEnabled: options.autoLearnEnabled !== undefined ? options.autoLearnEnabled : true,
      autoLearnThreshold: options.autoLearnThreshold || 3, // Times a correction must occur
      maxVocabularySize: options.maxVocabularySize || 10000,
      enabledCategories: options.enabledCategories || [VocabularyPresets.CUSTOM],
    };

    this.db = getDatabase();
    this.correctionTracker = new Map(); // Track corrections for auto-learning
    this.cachedVocabulary = null;
    this.cacheExpiry = null;

    // Callbacks
    this.onWordAdded = options.onWordAdded || (() => {});
    this.onWordRemoved = options.onWordRemoved || (() => {});
    this.onError = options.onError || (() => {});
  }

  /**
   * Initialize manager and load settings
   */
  async initialize() {
    try {
      const savedSettings = await this.db.settings.get('vocabularySettings');
      if (savedSettings) {
        this.settings = { ...this.settings, ...savedSettings.value };
      }
      console.log('[VocabularyManager] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[VocabularyManager] Initialization failed:', error);
      this.onError(error);
      return false;
    }
  }

  /**
   * Save settings to IndexedDB
   */
  async saveSettings() {
    try {
      await this.db.settings.put({
        key: 'vocabularySettings',
        value: this.settings,
      });
    } catch (error) {
      console.error('[VocabularyManager] Failed to save settings:', error);
      this.onError(error);
    }
  }

  // ==========================================
  // CRUD Operations
  // ==========================================

  /**
   * Add a word to vocabulary
   * @param {string} word - The word or phrase
   * @param {Object} options - Additional options
   * @returns {Promise<number>} - Entry ID
   */
  async addWord(word, options = {}) {
    if (!word || typeof word !== 'string') {
      throw new Error('Word must be a non-empty string');
    }

    const normalizedWord = word.trim().toLowerCase();

    // Check for duplicates
    const existing = await this.db.vocabulary
      .where('word')
      .equalsIgnoreCase(normalizedWord)
      .first();

    if (existing) {
      // Update frequency if exists
      await this.db.vocabulary.update(existing.id, {
        frequency: (existing.frequency || 0) + 1,
        updatedAt: Date.now(),
      });
      return existing.id;
    }

    const entry = {
      word: word.trim(),
      phonetic: options.phonetic || '',
      category: options.category || VocabularyPresets.CUSTOM,
      tags: options.tags || [],
      frequency: 1,
      autoLearned: options.autoLearned || false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const id = await this.db.vocabulary.add(entry);
    this.invalidateCache();

    this.onWordAdded({ ...entry, id });
    console.log(`[VocabularyManager] Added word: "${word}"`);

    return id;
  }

  /**
   * Add multiple words at once
   * @param {Array<{word: string, phonetic?: string}>} words
   * @param {string} category
   * @returns {Promise<number>} - Number of words added
   */
  async addWords(words, category = VocabularyPresets.CUSTOM) {
    const entries = words.map(w => ({
      word: typeof w === 'string' ? w.trim() : w.word.trim(),
      phonetic: typeof w === 'string' ? '' : w.phonetic || '',
      category,
      tags: [],
      frequency: 1,
      autoLearned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    // Filter out duplicates
    const existingWords = await this.db.vocabulary.toArray();
    const existingSet = new Set(existingWords.map(e => e.word.toLowerCase()));

    const newEntries = entries.filter(e => !existingSet.has(e.word.toLowerCase()));

    if (newEntries.length > 0) {
      await this.db.vocabulary.bulkAdd(newEntries);
      this.invalidateCache();
      console.log(`[VocabularyManager] Added ${newEntries.length} words`);
    }

    return newEntries.length;
  }

  /**
   * Get a word by ID
   * @param {number} id
   * @returns {Promise<VocabularyEntry|null>}
   */
  async getWord(id) {
    return this.db.vocabulary.get(id);
  }

  /**
   * Get all vocabulary entries
   * @param {Object} options - Query options
   * @returns {Promise<VocabularyEntry[]>}
   */
  async getAllWords(options = {}) {
    let collection = this.db.vocabulary.toCollection();

    // Filter by category
    if (options.category) {
      collection = this.db.vocabulary.where('category').equals(options.category);
    }

    // Filter by auto-learned
    if (options.autoLearned !== undefined) {
      collection = collection.filter(entry => entry.autoLearned === options.autoLearned);
    }

    const entries = await collection.toArray();

    // Sort
    const sortBy = options.sortBy || 'word';
    const sortOrder = options.sortOrder || 'asc';

    entries.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];

      if (typeof aVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return entries;
  }

  /**
   * Update a word entry
   * @param {number} id
   * @param {Object} updates
   * @returns {Promise<boolean>}
   */
  async updateWord(id, updates) {
    const existing = await this.db.vocabulary.get(id);
    if (!existing) {
      return false;
    }

    await this.db.vocabulary.update(id, {
      ...updates,
      updatedAt: Date.now(),
    });

    this.invalidateCache();
    return true;
  }

  /**
   * Delete a word by ID
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  async deleteWord(id) {
    const existing = await this.db.vocabulary.get(id);
    if (!existing) {
      return false;
    }

    await this.db.vocabulary.delete(id);
    this.invalidateCache();

    this.onWordRemoved(existing);
    console.log(`[VocabularyManager] Deleted word: "${existing.word}"`);

    return true;
  }

  /**
   * Delete multiple words
   * @param {number[]} ids
   * @returns {Promise<number>} - Number deleted
   */
  async deleteWords(ids) {
    await this.db.vocabulary.bulkDelete(ids);
    this.invalidateCache();
    return ids.length;
  }

  /**
   * Search vocabulary
   * @param {string} query
   * @returns {Promise<VocabularyEntry[]>}
   */
  async search(query) {
    if (!query) {
      return [];
    }

    const normalizedQuery = query.toLowerCase();
    const entries = await this.db.vocabulary.toArray();

    return entries.filter(
      entry =>
        entry.word.toLowerCase().includes(normalizedQuery) ||
        (entry.phonetic && entry.phonetic.toLowerCase().includes(normalizedQuery)) ||
        entry.tags.some(tag => tag.toLowerCase().includes(normalizedQuery))
    );
  }

  /**
   * Clear all vocabulary
   * @param {string} category - Optional category to clear
   */
  async clear(category = null) {
    if (category) {
      await this.db.vocabulary.where('category').equals(category).delete();
    } else {
      await this.db.vocabulary.clear();
    }
    this.invalidateCache();
    console.log(`[VocabularyManager] Cleared vocabulary${category ? ` (${category})` : ''}`);
  }

  // ==========================================
  // Preset Vocabulary
  // ==========================================

  /**
   * Load a vocabulary preset
   * @param {string} preset - Preset name from VocabularyPresets
   * @returns {Promise<number>} - Number of words added
   */
  async loadPreset(preset) {
    let words;

    switch (preset) {
      case VocabularyPresets.MEDICAL:
        words = MEDICAL_VOCABULARY;
        break;
      case VocabularyPresets.LEGAL:
        words = LEGAL_VOCABULARY;
        break;
      case VocabularyPresets.ACADEMIC:
        words = ACADEMIC_VOCABULARY;
        break;
      case VocabularyPresets.STEM:
        words = STEM_VOCABULARY;
        break;
      default:
        throw new Error(`Unknown preset: ${preset}`);
    }

    const count = await this.addWords(words, preset);

    // Add to enabled categories
    if (!this.settings.enabledCategories.includes(preset)) {
      this.settings.enabledCategories.push(preset);
      await this.saveSettings();
    }

    console.log(`[VocabularyManager] Loaded ${preset} preset: ${count} words`);
    return count;
  }

  /**
   * Unload a vocabulary preset
   * @param {string} preset
   */
  async unloadPreset(preset) {
    await this.clear(preset);

    // Remove from enabled categories
    this.settings.enabledCategories = this.settings.enabledCategories.filter(c => c !== preset);
    await this.saveSettings();

    console.log(`[VocabularyManager] Unloaded ${preset} preset`);
  }

  /**
   * Get available presets with word counts
   * @returns {Promise<Array<{name: string, count: number, enabled: boolean}>>}
   */
  async getPresets() {
    const presets = [
      VocabularyPresets.MEDICAL,
      VocabularyPresets.LEGAL,
      VocabularyPresets.ACADEMIC,
      VocabularyPresets.STEM,
    ];

    const result = [];

    for (const preset of presets) {
      const count = await this.db.vocabulary.where('category').equals(preset).count();
      result.push({
        name: preset,
        count,
        enabled: this.settings.enabledCategories.includes(preset),
        totalAvailable: this.getPresetSize(preset),
      });
    }

    return result;
  }

  /**
   * Get preset vocabulary size
   * @param {string} preset
   * @returns {number}
   */
  getPresetSize(preset) {
    switch (preset) {
      case VocabularyPresets.MEDICAL:
        return MEDICAL_VOCABULARY.length;
      case VocabularyPresets.LEGAL:
        return LEGAL_VOCABULARY.length;
      case VocabularyPresets.ACADEMIC:
        return ACADEMIC_VOCABULARY.length;
      case VocabularyPresets.STEM:
        return STEM_VOCABULARY.length;
      default:
        return 0;
    }
  }

  // ==========================================
  // Import/Export
  // ==========================================

  /**
   * Import vocabulary from text file (one word per line)
   * @param {string} content - File content
   * @param {string} category
   * @returns {Promise<{added: number, skipped: number}>}
   */
  async importFromText(content, category = VocabularyPresets.CUSTOM) {
    const lines = content.split('\n').filter(line => line.trim());

    const words = lines.map(line => {
      // Support "word|phonetic" format
      const parts = line.split('|');
      return {
        word: parts[0].trim(),
        phonetic: parts[1] ? parts[1].trim() : '',
      };
    });

    const added = await this.addWords(words, category);

    return {
      added,
      skipped: words.length - added,
    };
  }

  /**
   * Import vocabulary from JSON
   * @param {string} jsonContent
   * @returns {Promise<{added: number, skipped: number}>}
   */
  async importFromJSON(jsonContent) {
    const data = JSON.parse(jsonContent);
    const entries = Array.isArray(data) ? data : data.vocabulary || [];

    let added = 0;
    let skipped = 0;

    for (const entry of entries) {
      try {
        await this.addWord(entry.word, {
          phonetic: entry.phonetic,
          category: entry.category || VocabularyPresets.CUSTOM,
          tags: entry.tags || [],
        });
        added++;
      } catch {
        skipped++;
      }
    }

    return { added, skipped };
  }

  /**
   * Export vocabulary to text format
   * @param {string} category - Optional category filter
   * @returns {Promise<string>}
   */
  async exportToText(category = null) {
    const entries = category
      ? await this.db.vocabulary.where('category').equals(category).toArray()
      : await this.db.vocabulary.toArray();

    return entries.map(e => (e.phonetic ? `${e.word}|${e.phonetic}` : e.word)).join('\n');
  }

  /**
   * Export vocabulary to JSON format
   * @param {string} category - Optional category filter
   * @returns {Promise<string>}
   */
  async exportToJSON(category = null) {
    const entries = category
      ? await this.db.vocabulary.where('category').equals(category).toArray()
      : await this.db.vocabulary.toArray();

    return JSON.stringify(
      {
        exportDate: new Date().toISOString(),
        version: '1.0',
        vocabulary: entries.map(e => ({
          word: e.word,
          phonetic: e.phonetic,
          category: e.category,
          tags: e.tags,
        })),
      },
      null,
      2
    );
  }

  // ==========================================
  // Auto-Learning
  // ==========================================

  /**
   * Track a correction for auto-learning
   * @param {string} original - Original recognized text
   * @param {string} corrected - User's correction
   */
  trackCorrection(original, corrected) {
    if (!this.settings.autoLearnEnabled) {
      return;
    }

    // Extract words that were corrected
    const originalWords = original.toLowerCase().split(/\s+/);
    const correctedWords = corrected.toLowerCase().split(/\s+/);

    // Find new words that weren't in original
    const newWords = correctedWords.filter(w => !originalWords.includes(w) && w.length > 2);

    for (const word of newWords) {
      const count = (this.correctionTracker.get(word) || 0) + 1;
      this.correctionTracker.set(word, count);

      // Auto-add if threshold reached
      if (count >= this.settings.autoLearnThreshold) {
        this.autoLearnWord(word);
        this.correctionTracker.delete(word);
      }
    }
  }

  /**
   * Auto-learn a word from corrections
   * @param {string} word
   */
  async autoLearnWord(word) {
    try {
      await this.addWord(word, {
        category: VocabularyPresets.CUSTOM,
        autoLearned: true,
      });
      console.log(`[VocabularyManager] Auto-learned word: "${word}"`);
    } catch (error) {
      console.error('[VocabularyManager] Auto-learn failed:', error);
    }
  }

  /**
   * Get auto-learned words
   * @returns {Promise<VocabularyEntry[]>}
   */
  async getAutoLearnedWords() {
    return this.db.vocabulary.filter(entry => entry.autoLearned === true).toArray();
  }

  // ==========================================
  // Vocabulary Matching (for STT integration)
  // ==========================================

  /**
   * Get all enabled vocabulary words (for STT grammar)
   * @returns {Promise<string[]>}
   */
  async getEnabledWords() {
    // Use cache if valid
    if (this.cachedVocabulary && this.cacheExpiry && Date.now() < this.cacheExpiry) {
      return this.cachedVocabulary;
    }

    const categories = this.settings.enabledCategories;
    const entries = await this.db.vocabulary
      .filter(entry => categories.includes(entry.category))
      .toArray();

    this.cachedVocabulary = entries.map(e => e.word);
    this.cacheExpiry = Date.now() + 60000; // 1 minute cache

    return this.cachedVocabulary;
  }

  /**
   * Check if a word is in vocabulary
   * @param {string} word
   * @returns {Promise<boolean>}
   */
  async hasWord(word) {
    const words = await this.getEnabledWords();
    return words.some(w => w.toLowerCase() === word.toLowerCase());
  }

  /**
   * Get phonetic hint for a word
   * @param {string} word
   * @returns {Promise<string|null>}
   */
  async getPhoneticHint(word) {
    const entry = await this.db.vocabulary.where('word').equalsIgnoreCase(word).first();
    return entry ? entry.phonetic : null;
  }

  /**
   * Find similar words (for suggestions)
   * @param {string} word
   * @param {number} maxResults
   * @returns {Promise<VocabularyEntry[]>}
   */
  async findSimilar(word, maxResults = 5) {
    if (!word || word.length < 2) {
      return [];
    }

    const entries = await this.getEnabledWords();
    const normalizedWord = word.toLowerCase();

    // Simple similarity based on starting characters and Levenshtein-like matching
    const scored = entries
      .map(w => ({
        word: w,
        score: this.calculateSimilarity(normalizedWord, w.toLowerCase()),
      }))
      .filter(item => item.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    // Get full entries for scored words
    const result = [];
    for (const item of scored) {
      const entry = await this.db.vocabulary.where('word').equalsIgnoreCase(item.word).first();
      if (entry) {
        result.push(entry);
      }
    }

    return result;
  }

  /**
   * Calculate similarity score between two words (0-1)
   * @param {string} a
   * @param {string} b
   * @returns {number}
   */
  calculateSimilarity(a, b) {
    if (a === b) {
      return 1;
    }
    if (a.length === 0 || b.length === 0) {
      return 0;
    }

    // Check prefix match
    let prefixMatch = 0;
    const minLen = Math.min(a.length, b.length);
    for (let i = 0; i < minLen; i++) {
      if (a[i] === b[i]) {
        prefixMatch++;
      } else {
        break;
      }
    }

    // Check if b contains a
    const containsBonus = b.includes(a) ? 0.2 : 0;

    // Length penalty
    const lengthPenalty = 1 - Math.abs(a.length - b.length) / Math.max(a.length, b.length);

    return (prefixMatch / minLen) * 0.6 + containsBonus + lengthPenalty * 0.2;
  }

  /**
   * Invalidate vocabulary cache
   */
  invalidateCache() {
    this.cachedVocabulary = null;
    this.cacheExpiry = null;
  }

  // ==========================================
  // Statistics
  // ==========================================

  /**
   * Get vocabulary statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    const entries = await this.db.vocabulary.toArray();

    const stats = {
      totalWords: entries.length,
      byCategory: {},
      autoLearnedCount: 0,
      averageFrequency: 0,
    };

    let totalFrequency = 0;

    for (const entry of entries) {
      // By category
      stats.byCategory[entry.category] = (stats.byCategory[entry.category] || 0) + 1;

      // Auto-learned
      if (entry.autoLearned) {
        stats.autoLearnedCount++;
      }

      // Frequency
      totalFrequency += entry.frequency || 1;
    }

    stats.averageFrequency = entries.length > 0 ? totalFrequency / entries.length : 0;

    return stats;
  }

  /**
   * Update settings
   * @param {Object} newSettings
   */
  async updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();
    this.invalidateCache();
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    this.cachedVocabulary = null;
    this.cacheExpiry = null;
    this.correctionTracker.clear();
  }
}

export default VocabularyManager;
