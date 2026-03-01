import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getAdminSetting, setAdminSetting, isSignUpsEnabled } from '../admin-settings.service.js';

// Mock the database
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockValues = vi.fn();
const mockOnConflictDoUpdate = vi.fn();

const mockDb = {
  select: mockSelect,
  insert: mockInsert,
};

vi.mock('../../db/index.js', () => ({
  getDb: vi.fn(() => mockDb),
}));

describe('AdminSettingsService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getAdminSetting', () => {
    beforeEach(() => {
      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
    });

    it('should return the setting value when it exists', async () => {
      const mockSetting = { key: 'test_key', value: 'test_value' };
      mockWhere.mockResolvedValueOnce([mockSetting]);

      const result = await getAdminSetting('test_key');

      expect(result).toBe('test_value');
      expect(mockWhere).toHaveBeenCalled();
    });

    it('should return null when setting does not exist', async () => {
      mockWhere.mockResolvedValueOnce([]);

      const result = await getAdminSetting('nonexistent_key');

      expect(result).toBeNull();
    });

    it('should return the value even if it is false', async () => {
      const mockSetting = { key: 'sign_ups_enabled', value: false };
      mockWhere.mockResolvedValueOnce([mockSetting]);

      const result = await getAdminSetting('sign_ups_enabled');

      expect(result).toBe(false);
    });

    it('should return the value even if it is null', async () => {
      const mockSetting = { key: 'some_key', value: null };
      mockWhere.mockResolvedValueOnce([mockSetting]);

      const result = await getAdminSetting('some_key');

      expect(result).toBe(null);
    });

    it('should return complex JSON values', async () => {
      const mockValue = { foo: 'bar', nested: { count: 42 } };
      const mockSetting = { key: 'complex_key', value: mockValue };
      mockWhere.mockResolvedValueOnce([mockSetting]);

      const result = await getAdminSetting('complex_key');

      expect(result).toEqual(mockValue);
    });
  });

  describe('setAdminSetting', () => {
    beforeEach(() => {
      mockInsert.mockReturnValue({ values: mockValues });
      mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
      mockOnConflictDoUpdate.mockResolvedValue(undefined);
    });

    it('should insert a new setting', async () => {
      await setAdminSetting('new_key', 'new_value', 'user-123');

      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalledWith({
        key: 'new_key',
        value: 'new_value',
        updatedBy: 'user-123',
      });
    });

    it('should update an existing setting', async () => {
      await setAdminSetting('existing_key', 'updated_value', 'user-456');

      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalledWith({
        key: 'existing_key',
        value: 'updated_value',
        updatedBy: 'user-456',
      });
      expect(mockOnConflictDoUpdate).toHaveBeenCalledWith({
        target: expect.anything(),
        set: {
          value: 'updated_value',
          updatedAt: expect.any(Date),
          updatedBy: 'user-456',
        },
      });
    });

    it('should handle boolean values', async () => {
      await setAdminSetting('sign_ups_enabled', false, 'user-789');

      expect(mockValues).toHaveBeenCalledWith({
        key: 'sign_ups_enabled',
        value: false,
        updatedBy: 'user-789',
      });
    });

    it('should handle complex JSON values', async () => {
      const complexValue = { featureFlags: { alpha: true, beta: false } };
      await setAdminSetting('config', complexValue, 'user-101');

      expect(mockValues).toHaveBeenCalledWith({
        key: 'config',
        value: complexValue,
        updatedBy: 'user-101',
      });
    });
  });

  describe('isSignUpsEnabled', () => {
    beforeEach(() => {
      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
    });

    it('should return true when setting is true', async () => {
      const mockSetting = { key: 'sign_ups_enabled', value: true };
      mockWhere.mockResolvedValueOnce([mockSetting]);

      const result = await isSignUpsEnabled();

      expect(result).toBe(true);
    });

    it('should return false when setting is false', async () => {
      const mockSetting = { key: 'sign_ups_enabled', value: false };
      mockWhere.mockResolvedValueOnce([mockSetting]);

      const result = await isSignUpsEnabled();

      expect(result).toBe(false);
    });

    it('should return true (default) when setting does not exist', async () => {
      mockWhere.mockResolvedValueOnce([]);

      const result = await isSignUpsEnabled();

      expect(result).toBe(true);
    });

    it('should return true (default) when setting is null', async () => {
      const mockSetting = { key: 'sign_ups_enabled', value: null };
      mockWhere.mockResolvedValueOnce([mockSetting]);

      const result = await isSignUpsEnabled();

      expect(result).toBe(true);
    });

    it('should return true for any truthy value', async () => {
      const mockSetting = { key: 'sign_ups_enabled', value: 'yes' };
      mockWhere.mockResolvedValueOnce([mockSetting]);

      const result = await isSignUpsEnabled();

      expect(result).toBe(true);
    });

    it('should return true for 0 (number)', async () => {
      const mockSetting = { key: 'sign_ups_enabled', value: 0 };
      mockWhere.mockResolvedValueOnce([mockSetting]);

      const result = await isSignUpsEnabled();

      expect(result).toBe(true);
    });

    it('should return true for empty string', async () => {
      const mockSetting = { key: 'sign_ups_enabled', value: '' };
      mockWhere.mockResolvedValueOnce([mockSetting]);

      const result = await isSignUpsEnabled();

      expect(result).toBe(true);
    });
  });
});
