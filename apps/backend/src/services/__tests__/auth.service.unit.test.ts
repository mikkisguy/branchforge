import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { hashPassword, validatePassword, register, validateCredentials } from '../auth.service.js';
import * as dbModule from '../../db/index.js';

// Mock the database
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockDb = {
  select: mockSelect,
  insert: mockInsert,
};

vi.mock('../../db/index.js', () => ({
  getDb: vi.fn(() => mockDb),
}));

describe('AuthService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(20);
    });

    it('should generate different hashes for the same password', async () => {
      const password = 'testPassword123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should hash an empty string', async () => {
      const hash = await hashPassword('');
      expect(hash).toBeDefined();
    });
  });

  describe('validatePassword', () => {
    it('should return true for correct password', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);

      const isValid = await validatePassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);

      const isValid = await validatePassword('wrongPassword', hash);
      expect(isValid).toBe(false);
    });

    it('should return false for empty password', async () => {
      const hash = await hashPassword('testPassword123');
      const isValid = await validatePassword('', hash);
      expect(isValid).toBe(false);
    });
  });

  describe('register', () => {
    const mockFrom = vi.fn();
    const mockValues = vi.fn();
    const mockReturning = vi.fn();

    // Create a chained mock that handles both with and without where
    const createFromMock = (existingUsers: any[] = []) => {
      const fromResult = {
        where: vi.fn(() => fromResult),
      };
      // Make the from return itself directly when no where is called
      const proxy = new Proxy(fromResult, {
        get(target, prop) {
          if (prop === 'where') {
            return vi.fn(() => proxy);
          }
          // For non-where calls like in Promise.resolve, return the mock data
          return (target as any)[prop];
        },
      });
      // Make it a thenable for await
      (proxy as any).then = (...args: any[]) => Promise.resolve(existingUsers).then(...args);
      return proxy;
    };

    beforeEach(() => {
      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue(createFromMock([]));
      mockInsert.mockReturnValue({ values: mockValues });
      mockValues.mockReturnValue({ returning: mockReturning });
      mockReturning.mockResolvedValue([{ id: '123', email: 'test@example.com', role: 'OWNER' }]);
    });

    it('should register first user successfully', async () => {
      const result = await register('test@example.com', 'password123');
      expect(result).toEqual({
        id: '123',
        email: 'test@example.com',
        role: 'OWNER',
      });
    });

    it('should fail if email is already taken', async () => {
      mockFrom.mockReturnValue(Promise.resolve([{ email: 'test@example.com' }]));

      await expect(register('test@example.com', 'password123')).rejects.toThrow('Email already registered');
    });

    it('should fail if users already exist (single user restriction)', async () => {
      mockFrom.mockReturnValue(Promise.resolve([{ id: 'existing-id', email: 'other@example.com' }]));

      await expect(register('new@example.com', 'password123')).rejects.toThrow('Registration is limited to a single user');
    });

    it('should fail with invalid email format', async () => {
      await expect(register('invalid-email', 'password123')).rejects.toThrow('Invalid email format');
    });

    it('should fail with weak password', async () => {
      await expect(register('test@example.com', '123')).rejects.toThrow('Password must be at least 8 characters');
    });
  });

  describe('validateCredentials', () => {
    const mockFrom = vi.fn();
    const mockWhere = vi.fn();

    beforeEach(() => {
      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
    });

    it('should return user for valid credentials', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);

      mockWhere.mockResolvedValueOnce([{
        id: '123',
        email: 'test@example.com',
        passwordHash: hash,
        role: 'OWNER',
      }]);

      const result = await validateCredentials('test@example.com', password);
      expect(result).toEqual({
        id: '123',
        email: 'test@example.com',
        role: 'OWNER',
      });
    });

    it('should return null for invalid email', async () => {
      mockWhere.mockResolvedValueOnce([]);

      const result = await validateCredentials('nonexistent@example.com', 'password');
      expect(result).toBeNull();
    });

    it('should return null for invalid password', async () => {
      const correctPassword = 'correctPassword';
      const hash = await hashPassword(correctPassword);

      mockWhere.mockResolvedValueOnce([{
        id: '123',
        email: 'test@example.com',
        passwordHash: hash,
        role: 'OWNER',
      }]);

      const result = await validateCredentials('test@example.com', 'wrongPassword');
      expect(result).toBeNull();
    });
  });
});
