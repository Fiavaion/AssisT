/**
 * Scotoma Profile Unit Tests
 * Testing scotoma profile creation, storage, analysis, and progression tracking
 * Following TDD: Testing actual implementation
 */

import * as ScotomaProfile from '../../../src/features/stargardt/scotoma-profile.js';

describe('ScotomaProfile', () => {
  beforeEach(() => {
    // Reset chrome.storage mock before each test
    jest.clearAllMocks();

    // Setup default mock behavior
    chrome.storage.local.get.mockImplementation(() => {
      return Promise.resolve({});
    });

    chrome.storage.local.set.mockImplementation(() => {
      return Promise.resolve();
    });
  });

  // ============================================================================
  // PROFILE CREATION TESTS
  // ============================================================================

  describe('createFromSettings()', () => {
    test('should create profile with provided settings', () => {
      const settings = {
        shape: 'ellipse',
        centerX: 55,
        centerY: 45,
        radiusX: 12,
        radiusY: 10,
        eye: 'right',
        notes: 'Initial profile',
      };

      const profile = ScotomaProfile.createFromSettings(settings);

      expect(profile.id).toMatch(/^profile_\d+_\w+$/);
      expect(profile.version).toBe(1);
      expect(profile.source).toBe('manual');
      expect(profile.boundary.shape).toBe('ellipse');
      expect(profile.boundary.centerX).toBe(55);
      expect(profile.boundary.centerY).toBe(45);
      expect(profile.boundary.radiusX).toBe(12);
      expect(profile.boundary.radiusY).toBe(10);
      expect(profile.metadata.eye).toBe('right');
      expect(profile.metadata.notes).toBe('Initial profile');
      expect(profile.metadata.confidenceScore).toBeNull();
    });

    test('should use default values for missing settings', () => {
      const profile = ScotomaProfile.createFromSettings({});

      expect(profile.boundary.shape).toBe('ellipse');
      expect(profile.boundary.centerX).toBe(50);
      expect(profile.boundary.centerY).toBe(50);
      expect(profile.boundary.radiusX).toBe(10);
      expect(profile.boundary.radiusY).toBe(10);
      expect(profile.metadata.eye).toBe('both');
    });

    test('should include timestamps', () => {
      const beforeTime = new Date().toISOString();
      const profile = ScotomaProfile.createFromSettings({});
      const afterTime = new Date().toISOString();

      expect(profile.createdAt).toBeDefined();
      expect(profile.updatedAt).toBeDefined();
      expect(profile.createdAt >= beforeTime).toBe(true);
      expect(profile.updatedAt <= afterTime).toBe(true);
    });
  });

  describe('createFromCalibration()', () => {
    test('should create profile from calibration data', () => {
      const calibrationResult = {
        shape: 'ellipse',
        centerX: 48,
        centerY: 52,
        radiusX: 15,
        radiusY: 12,
        confidence: 85,
        eye: 'both',
      };

      const profile = ScotomaProfile.createFromCalibration(calibrationResult);

      expect(profile.source).toBe('calibrated');
      expect(profile.boundary.centerX).toBe(48);
      expect(profile.boundary.centerY).toBe(52);
      expect(profile.boundary.radiusX).toBe(15);
      expect(profile.boundary.radiusY).toBe(12);
      expect(profile.metadata.confidenceScore).toBe(85);
    });

    test('should default confidence to 0 if not provided', () => {
      const profile = ScotomaProfile.createFromCalibration({
        centerX: 50,
        centerY: 50,
        radiusX: 10,
        radiusY: 10,
      });

      expect(profile.metadata.confidenceScore).toBe(0);
    });
  });

  describe('createDefault()', () => {
    test('should create default profile with standard values', () => {
      const profile = ScotomaProfile.createDefault();

      expect(profile.source).toBe('manual');
      expect(profile.boundary.shape).toBe('ellipse');
      expect(profile.boundary.centerX).toBe(50);
      expect(profile.boundary.centerY).toBe(50);
      expect(profile.boundary.radiusX).toBe(8);
      expect(profile.boundary.radiusY).toBe(8);
      expect(profile.metadata.notes).toContain('Default profile');
    });
  });

  // ============================================================================
  // STORAGE OPERATION TESTS
  // ============================================================================

  describe('save()', () => {
    test('should save new profile to storage', async () => {
      chrome.storage.local.get.mockResolvedValue({
        stargardt_scotoma_profiles: [],
      });

      const profile = ScotomaProfile.createDefault();
      await ScotomaProfile.save(profile);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        stargardt_scotoma_profiles: [profile],
        stargardt_current_profile: profile.id,
      });
    });

    test('should update existing profile in storage', async () => {
      const existingProfile = ScotomaProfile.createDefault();
      chrome.storage.local.get.mockResolvedValue({
        stargardt_scotoma_profiles: [existingProfile],
      });

      existingProfile.boundary.radiusX = 15;
      await ScotomaProfile.save(existingProfile);

      const savedProfiles = chrome.storage.local.set.mock.calls[0][0].stargardt_scotoma_profiles;
      expect(savedProfiles.length).toBe(1);
      expect(savedProfiles[0].boundary.radiusX).toBe(15);
    });

    test('should update timestamp on save', async () => {
      chrome.storage.local.get.mockResolvedValue({
        stargardt_scotoma_profiles: [],
      });

      const profile = ScotomaProfile.createDefault();
      const originalUpdatedAt = profile.updatedAt;

      // Small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      await ScotomaProfile.save(profile);

      expect(profile.updatedAt).not.toBe(originalUpdatedAt);
    });
  });

  describe('loadSaved()', () => {
    test('should load current active profile', async () => {
      const profile = ScotomaProfile.createDefault();
      chrome.storage.local.get.mockResolvedValue({
        stargardt_scotoma_profiles: [profile],
        stargardt_current_profile: profile.id,
      });

      const loaded = await ScotomaProfile.loadSaved();

      expect(loaded).toEqual(profile);
    });

    test('should return null if no profiles exist', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const loaded = await ScotomaProfile.loadSaved();

      expect(loaded).toBeNull();
    });

    test('should return null if current profile ID not found', async () => {
      const profile = ScotomaProfile.createDefault();
      chrome.storage.local.get.mockResolvedValue({
        stargardt_scotoma_profiles: [profile],
        stargardt_current_profile: 'nonexistent_id',
      });

      const loaded = await ScotomaProfile.loadSaved();

      expect(loaded).toBeNull();
    });
  });

  describe('getAllProfiles()', () => {
    test('should return all saved profiles', async () => {
      const profiles = [
        ScotomaProfile.createDefault(),
        ScotomaProfile.createFromSettings({ centerX: 40 }),
      ];
      chrome.storage.local.get.mockResolvedValue({
        stargardt_scotoma_profiles: profiles,
      });

      const result = await ScotomaProfile.getAllProfiles();

      expect(result.length).toBe(2);
    });

    test('should return empty array if no profiles', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const result = await ScotomaProfile.getAllProfiles();

      expect(result).toEqual([]);
    });
  });

  describe('deleteProfile()', () => {
    test('should remove profile from storage', async () => {
      const profiles = [
        ScotomaProfile.createDefault(),
        ScotomaProfile.createFromSettings({ centerX: 40 }),
      ];
      chrome.storage.local.get.mockResolvedValue({
        stargardt_scotoma_profiles: profiles,
      });

      await ScotomaProfile.deleteProfile(profiles[0].id);

      const savedProfiles = chrome.storage.local.set.mock.calls[0][0].stargardt_scotoma_profiles;
      expect(savedProfiles.length).toBe(1);
      expect(savedProfiles[0].id).toBe(profiles[1].id);
    });
  });

  // ============================================================================
  // PROFILE ANALYSIS TESTS
  // ============================================================================

  describe('isPointInScotoma()', () => {
    test('should return true for point inside circular scotoma', () => {
      const profile = ScotomaProfile.createFromSettings({
        shape: 'circle',
        centerX: 50,
        centerY: 50,
        radiusX: 10,
        radiusY: 10,
      });

      expect(ScotomaProfile.isPointInScotoma(profile, 50, 50)).toBe(true);
      expect(ScotomaProfile.isPointInScotoma(profile, 55, 50)).toBe(true);
      expect(ScotomaProfile.isPointInScotoma(profile, 50, 55)).toBe(true);
    });

    test('should return false for point outside scotoma', () => {
      const profile = ScotomaProfile.createFromSettings({
        shape: 'circle',
        centerX: 50,
        centerY: 50,
        radiusX: 10,
        radiusY: 10,
      });

      expect(ScotomaProfile.isPointInScotoma(profile, 70, 50)).toBe(false);
      expect(ScotomaProfile.isPointInScotoma(profile, 50, 70)).toBe(false);
      expect(ScotomaProfile.isPointInScotoma(profile, 0, 0)).toBe(false);
    });

    test('should handle ellipse shape correctly', () => {
      const profile = ScotomaProfile.createFromSettings({
        shape: 'ellipse',
        centerX: 50,
        centerY: 50,
        radiusX: 20,
        radiusY: 10,
      });

      // Inside on X axis
      expect(ScotomaProfile.isPointInScotoma(profile, 65, 50)).toBe(true);
      // Outside on X axis
      expect(ScotomaProfile.isPointInScotoma(profile, 75, 50)).toBe(false);
      // Inside on Y axis
      expect(ScotomaProfile.isPointInScotoma(profile, 50, 55)).toBe(true);
      // Outside on Y axis
      expect(ScotomaProfile.isPointInScotoma(profile, 50, 65)).toBe(false);
    });

    test('should handle point on boundary as inside', () => {
      const profile = ScotomaProfile.createFromSettings({
        shape: 'circle',
        centerX: 50,
        centerY: 50,
        radiusX: 10,
        radiusY: 10,
      });

      // Point exactly on boundary
      expect(ScotomaProfile.isPointInScotoma(profile, 60, 50)).toBe(true);
    });
  });

  describe('getSafeZone()', () => {
    const profile = ScotomaProfile.createFromSettings({
      centerX: 50,
      centerY: 50,
      radiusX: 10,
      radiusY: 10,
    });

    test('should return safe zone to the right', () => {
      const zone = ScotomaProfile.getSafeZone(profile, 'right');

      expect(zone.x).toBeGreaterThan(60); // Past scotoma + margin
      expect(zone.y).toBe(0);
      expect(zone.height).toBe(100);
    });

    test('should return safe zone to the left', () => {
      const zone = ScotomaProfile.getSafeZone(profile, 'left');

      expect(zone.x).toBe(0);
      expect(zone.width).toBeLessThan(40); // Before scotoma - margin
    });

    test('should return safe zone above', () => {
      const zone = ScotomaProfile.getSafeZone(profile, 'above');

      expect(zone.y).toBe(0);
      expect(zone.height).toBeLessThan(40);
    });

    test('should return safe zone below', () => {
      const zone = ScotomaProfile.getSafeZone(profile, 'below');

      expect(zone.y).toBeGreaterThan(60);
    });

    test('should default to right if invalid preference', () => {
      const zone = ScotomaProfile.getSafeZone(profile);

      expect(zone.x).toBeGreaterThan(50);
    });
  });

  describe('calculatePRLPosition()', () => {
    test('should suggest right PRL for centered scotoma', () => {
      const profile = ScotomaProfile.createFromSettings({
        centerX: 50,
        centerY: 50,
        radiusX: 10,
        radiusY: 10,
      });

      const prl = ScotomaProfile.calculatePRLPosition(profile);

      expect(prl.direction).toBe('right');
      expect(prl.x).toBeGreaterThan(60);
    });

    test('should suggest left PRL for right-positioned scotoma', () => {
      const profile = ScotomaProfile.createFromSettings({
        centerX: 70,
        centerY: 50,
        radiusX: 10,
        radiusY: 10,
      });

      const prl = ScotomaProfile.calculatePRLPosition(profile);

      expect(prl.direction).toBe('left');
      expect(prl.x).toBeLessThan(60);
    });

    test('should suggest above PRL for low-positioned scotoma', () => {
      const profile = ScotomaProfile.createFromSettings({
        centerX: 50,
        centerY: 70,
        radiusX: 10,
        radiusY: 10,
      });

      const prl = ScotomaProfile.calculatePRLPosition(profile);

      expect(prl.direction).toBe('above');
      expect(prl.y).toBeLessThan(60);
    });

    test('should suggest below PRL for high-positioned scotoma', () => {
      const profile = ScotomaProfile.createFromSettings({
        centerX: 50,
        centerY: 30,
        radiusX: 10,
        radiusY: 10,
      });

      const prl = ScotomaProfile.calculatePRLPosition(profile);

      expect(prl.direction).toBe('below');
      expect(prl.y).toBeGreaterThan(40);
    });
  });

  // ============================================================================
  // PROGRESSION TRACKING TESTS
  // ============================================================================

  describe('compareProfiles()', () => {
    test('should detect area increase', () => {
      const oldProfile = ScotomaProfile.createFromSettings({
        radiusX: 10,
        radiusY: 10,
      });
      oldProfile.createdAt = '2024-01-01T00:00:00.000Z';

      const newProfile = ScotomaProfile.createFromSettings({
        radiusX: 15,
        radiusY: 15,
      });
      newProfile.createdAt = '2024-02-01T00:00:00.000Z';

      const comparison = ScotomaProfile.compareProfiles(oldProfile, newProfile);

      expect(comparison.increased).toBe(true);
      expect(comparison.decreased).toBe(false);
      expect(comparison.stable).toBe(false);
      expect(parseFloat(comparison.areaChangePercent)).toBeGreaterThan(0);
    });

    test('should detect area decrease', () => {
      const oldProfile = ScotomaProfile.createFromSettings({
        radiusX: 15,
        radiusY: 15,
      });
      oldProfile.createdAt = '2024-01-01T00:00:00.000Z';

      const newProfile = ScotomaProfile.createFromSettings({
        radiusX: 10,
        radiusY: 10,
      });
      newProfile.createdAt = '2024-02-01T00:00:00.000Z';

      const comparison = ScotomaProfile.compareProfiles(oldProfile, newProfile);

      expect(comparison.decreased).toBe(true);
      expect(comparison.increased).toBe(false);
    });

    test('should detect stable scotoma', () => {
      const oldProfile = ScotomaProfile.createFromSettings({
        radiusX: 10,
        radiusY: 10,
      });
      oldProfile.createdAt = '2024-01-01T00:00:00.000Z';

      const newProfile = ScotomaProfile.createFromSettings({
        radiusX: 10,
        radiusY: 10,
      });
      newProfile.createdAt = '2024-02-01T00:00:00.000Z';

      const comparison = ScotomaProfile.compareProfiles(oldProfile, newProfile);

      expect(comparison.stable).toBe(true);
      expect(comparison.increased).toBe(false);
      expect(comparison.decreased).toBe(false);
    });

    test('should detect significant position shift', () => {
      const oldProfile = ScotomaProfile.createFromSettings({
        centerX: 50,
        centerY: 50,
      });
      oldProfile.createdAt = '2024-01-01T00:00:00.000Z';

      const newProfile = ScotomaProfile.createFromSettings({
        centerX: 55,
        centerY: 55,
      });
      newProfile.createdAt = '2024-02-01T00:00:00.000Z';

      const comparison = ScotomaProfile.compareProfiles(oldProfile, newProfile);

      expect(comparison.significantShift).toBe(true);
    });

    test('should calculate days between profiles', () => {
      const oldProfile = ScotomaProfile.createFromSettings({});
      oldProfile.createdAt = '2024-01-01T00:00:00.000Z';

      const newProfile = ScotomaProfile.createFromSettings({});
      newProfile.createdAt = '2024-02-01T00:00:00.000Z';

      const comparison = ScotomaProfile.compareProfiles(oldProfile, newProfile);

      expect(comparison.daysBetween).toBe(31);
    });
  });

  describe('getProgressionHistory()', () => {
    test('should return empty array for less than 2 profiles', async () => {
      chrome.storage.local.get.mockResolvedValue({
        stargardt_scotoma_profiles: [ScotomaProfile.createDefault()],
      });

      const history = await ScotomaProfile.getProgressionHistory();

      expect(history).toEqual([]);
    });

    test('should return comparisons for multiple profiles', async () => {
      const profile1 = ScotomaProfile.createFromSettings({ radiusX: 8 });
      profile1.createdAt = '2024-01-01T00:00:00.000Z';

      const profile2 = ScotomaProfile.createFromSettings({ radiusX: 10 });
      profile2.createdAt = '2024-02-01T00:00:00.000Z';

      const profile3 = ScotomaProfile.createFromSettings({ radiusX: 12 });
      profile3.createdAt = '2024-03-01T00:00:00.000Z';

      chrome.storage.local.get.mockResolvedValue({
        stargardt_scotoma_profiles: [profile1, profile2, profile3],
      });

      const history = await ScotomaProfile.getProgressionHistory();

      expect(history.length).toBe(2);
      expect(history[0].fromDate).toBe('2024-01-01T00:00:00.000Z');
      expect(history[0].toDate).toBe('2024-02-01T00:00:00.000Z');
      expect(history[1].fromDate).toBe('2024-02-01T00:00:00.000Z');
      expect(history[1].toDate).toBe('2024-03-01T00:00:00.000Z');
    });
  });

  // ============================================================================
  // EXPORT/IMPORT TESTS
  // ============================================================================

  describe('exportProfile()', () => {
    test('should export profile as JSON string', () => {
      const profile = ScotomaProfile.createDefault();
      const exported = ScotomaProfile.exportProfile(profile);

      const parsed = JSON.parse(exported);
      expect(parsed.type).toBe('scotoma_profile');
      expect(parsed.application).toBe('AssisT Browser Extension');
      expect(parsed.profile).toEqual(profile);
    });

    test('should include export version and date', () => {
      const profile = ScotomaProfile.createDefault();
      const exported = ScotomaProfile.exportProfile(profile);

      const parsed = JSON.parse(exported);
      expect(parsed.exportVersion).toBe(1);
      expect(parsed.exportDate).toBeDefined();
    });
  });

  describe('importProfile()', () => {
    test('should import valid profile data', () => {
      const original = ScotomaProfile.createDefault();
      const exportData = {
        type: 'scotoma_profile',
        profile: original,
      };

      const imported = ScotomaProfile.importProfile(JSON.stringify(exportData));

      expect(imported).not.toBeNull();
      expect(imported.source).toBe('imported');
      expect(imported.id).not.toBe(original.id); // New ID assigned
      expect(imported.boundary).toEqual(original.boundary);
    });

    test('should reject invalid profile type', () => {
      const exportData = {
        type: 'invalid_type',
        profile: {},
      };

      const imported = ScotomaProfile.importProfile(JSON.stringify(exportData));

      expect(imported).toBeNull();
    });

    test('should handle invalid JSON gracefully', () => {
      const imported = ScotomaProfile.importProfile('not valid json');

      expect(imported).toBeNull();
    });
  });

  // ============================================================================
  // REASSESSMENT TESTS
  // ============================================================================

  describe('checkReassessmentDue()', () => {
    test('should return fullAssessmentDue after 30 days', async () => {
      const thirtyOneDaysAgo = new Date();
      thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

      chrome.storage.local.get.mockResolvedValue({
        stargardt_reassessment_state: {
          lastFullAssessment: thirtyOneDaysAgo.toISOString(),
          lastMicroCheck: new Date().toISOString(),
        },
      });

      const status = await ScotomaProfile.checkReassessmentDue();

      expect(status.fullAssessmentDue).toBe(true);
      expect(status.daysSinceFullAssessment).toBeGreaterThanOrEqual(31);
    });

    test('should return microCheckDue after 7 days', async () => {
      const eightDaysAgo = new Date();
      eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

      chrome.storage.local.get.mockResolvedValue({
        stargardt_reassessment_state: {
          lastFullAssessment: new Date().toISOString(),
          lastMicroCheck: eightDaysAgo.toISOString(),
        },
      });

      const status = await ScotomaProfile.checkReassessmentDue();

      expect(status.microCheckDue).toBe(true);
      expect(status.fullAssessmentDue).toBe(false);
    });

    test('should return no due if recent assessments', async () => {
      chrome.storage.local.get.mockResolvedValue({
        stargardt_reassessment_state: {
          lastFullAssessment: new Date().toISOString(),
          lastMicroCheck: new Date().toISOString(),
        },
      });

      const status = await ScotomaProfile.checkReassessmentDue();

      expect(status.fullAssessmentDue).toBe(false);
      expect(status.microCheckDue).toBe(false);
    });
  });

  describe('getRecommendedAction()', () => {
    test('should recommend full assessment if drift detected', async () => {
      chrome.storage.local.get.mockResolvedValue({
        stargardt_reassessment_state: {
          lastFullAssessment: new Date().toISOString(),
          lastMicroCheck: new Date().toISOString(),
          driftDetected: true,
          driftDetails: { areaChange: '15.0' },
        },
      });

      const recommendation = await ScotomaProfile.getRecommendedAction();

      expect(recommendation.action).toBe('full_assessment');
      expect(recommendation.urgency).toBe('high');
    });

    test('should recommend no action if up to date', async () => {
      chrome.storage.local.get.mockResolvedValue({
        stargardt_reassessment_state: {
          lastFullAssessment: new Date().toISOString(),
          lastMicroCheck: new Date().toISOString(),
          driftDetected: false,
        },
      });

      const recommendation = await ScotomaProfile.getRecommendedAction();

      expect(recommendation.action).toBe('none');
      expect(recommendation.urgency).toBe('none');
    });
  });

  // ============================================================================
  // VISION DIARY TESTS
  // ============================================================================

  describe('addDiaryEntry()', () => {
    test('should add new diary entry', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const entry = await ScotomaProfile.addDiaryEntry({
        qualityRating: 4,
        symptoms: ['Blurriness', 'Eye strain'],
        notes: 'Better than yesterday',
      });

      expect(entry.id).toMatch(/^diary_\d+_\w+$/);
      expect(entry.qualityRating).toBe(4);
      expect(entry.symptoms).toEqual(['Blurriness', 'Eye strain']);
      expect(entry.notes).toBe('Better than yesterday');
    });

    test('should use default values for missing fields', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const entry = await ScotomaProfile.addDiaryEntry({});

      expect(entry.qualityRating).toBe(3);
      expect(entry.symptoms).toEqual([]);
      expect(entry.notes).toBe('');
    });
  });

  describe('getDiaryStats()', () => {
    test('should calculate average quality', async () => {
      const entries = [
        { timestamp: new Date().toISOString(), qualityRating: 3, symptoms: [] },
        { timestamp: new Date().toISOString(), qualityRating: 4, symptoms: [] },
        { timestamp: new Date().toISOString(), qualityRating: 5, symptoms: [] },
      ];
      chrome.storage.local.get.mockResolvedValue({
        stargardt_vision_diary: entries,
      });

      const stats = await ScotomaProfile.getDiaryStats(30);

      expect(stats.averageQuality).toBe(4);
      expect(stats.entryCount).toBe(3);
    });

    test('should calculate symptom frequency', async () => {
      const entries = [
        { timestamp: new Date().toISOString(), qualityRating: 3, symptoms: ['Blurriness', 'Eye strain'] },
        { timestamp: new Date().toISOString(), qualityRating: 3, symptoms: ['Blurriness'] },
        { timestamp: new Date().toISOString(), qualityRating: 3, symptoms: ['Headache'] },
      ];
      chrome.storage.local.get.mockResolvedValue({
        stargardt_vision_diary: entries,
      });

      const stats = await ScotomaProfile.getDiaryStats(30);

      expect(stats.symptomFrequency['Blurriness']).toBe(2);
      expect(stats.symptomFrequency['Eye strain']).toBe(1);
      expect(stats.symptomFrequency['Headache']).toBe(1);
    });

    test('should return unknown trend with insufficient entries', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const stats = await ScotomaProfile.getDiaryStats(30);

      expect(stats.qualityTrend).toBe('unknown');
      expect(stats.averageQuality).toBeNull();
    });
  });

  // ============================================================================
  // PRIVACY & FERPA COMPLIANCE TESTS
  // ============================================================================

  describe('FERPA Compliance', () => {
    test('default profile should not contain PII', () => {
      const profile = ScotomaProfile.createDefault();
      const profileString = JSON.stringify(profile).toLowerCase();

      expect(profileString).not.toContain('"name"');
      expect(profileString).not.toContain('"email"');
      expect(profileString).not.toContain('"student"');
      expect(profileString).not.toContain('"userid"');
    });

    test('exported profile should not contain PII', () => {
      const profile = ScotomaProfile.createDefault();
      const exported = ScotomaProfile.exportProfile(profile);
      const exportedLower = exported.toLowerCase();

      expect(exportedLower).not.toContain('"name"');
      expect(exportedLower).not.toContain('"email"');
      expect(exportedLower).not.toContain('"student"');
    });

    test('vision diary should not require PII', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const entry = await ScotomaProfile.addDiaryEntry({
        qualityRating: 4,
        symptoms: ['Test symptom'],
      });

      const entryString = JSON.stringify(entry).toLowerCase();
      expect(entryString).not.toContain('"name"');
      expect(entryString).not.toContain('"email"');
    });
  });
});
