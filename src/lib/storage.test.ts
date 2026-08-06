import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveScrollPosition, loadScrollPositions } from './storage';


describe('storage.ts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('saveScrollPosition', () => {
    it('should save a valid scroll ratio', () => {
      saveScrollPosition('script1', 0.5);
      const positions = loadScrollPositions();
      expect(positions['script1']).toBe(0.5);
    });

    it('should delete the entry when ratio is 0', () => {
      // First save it
      saveScrollPosition('script1', 0.5);
      expect(loadScrollPositions()['script1']).toBe(0.5);

      // Now save with 0 to delete it
      saveScrollPosition('script1', 0);
      expect(loadScrollPositions()['script1']).toBeUndefined();
    });

    it('should delete the entry when ratio is negative', () => {
      // First save it
      saveScrollPosition('script1', 0.5);
      expect(loadScrollPositions()['script1']).toBe(0.5);

      // Now save with negative to delete it
      saveScrollPosition('script1', -0.1);
      expect(loadScrollPositions()['script1']).toBeUndefined();
    });

    it('should clamp ratio to max of 1', () => {
      saveScrollPosition('script1', 1.5);
      expect(loadScrollPositions()['script1']).toBe(1);
    });

    it('should silently handle localStorage errors', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage full');
      });
      expect(() => saveScrollPosition('script1', 0.5)).not.toThrow();
      setItemSpy.mockRestore();
    });
  });
});
