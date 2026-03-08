import { describe, it, expect } from 'vitest';
import {
  generateVisualName,
  generateJumpLabel,
  type VisualSystemConfig,
  type VisualNameComponents,
  type RouteConfig,
} from './index.js';

describe('generateVisualName', () => {
  describe('Prequel pattern (ACT_SCENE_SLUG_COUNTER)', () => {
    const prequelConfig: VisualSystemConfig = {
      pattern: 'ACT_SCENE_SLUG_COUNTER',
      actPrefixes: {
        I: 'ai',
        II: 'aii',
        III: 'aiii',
      },
      scenePadding: 2,
      counterPadding: 2,
      jumpPrefixShared: '',
    };

    it('generates name with act prefix', () => {
      const components: VisualNameComponents = {
        act: 'I',
        sceneNumber: 1,
        counter: 1,
        slug: 'cafe',
      };
      const result = generateVisualName(prequelConfig, components);
      expect(result).toBe('ai_01_01_cafe');
    });

    it('generates name for Act II', () => {
      const components: VisualNameComponents = {
        act: 'II',
        sceneNumber: 5,
        counter: 2,
        slug: 'bedroom',
      };
      const result = generateVisualName(prequelConfig, components);
      expect(result).toBe('aii_05_02_bedroom');
    });

    it('handles single digit padding', () => {
      const config = { ...prequelConfig, scenePadding: 1, counterPadding: 1 };
      const components: VisualNameComponents = {
        act: 'I',
        sceneNumber: 1,
        counter: 1,
        slug: 'cafe',
      };
      const result = generateVisualName(config, components);
      expect(result).toBe('ai_1_1_cafe');
    });

    it('handles missing act prefix gracefully', () => {
      const components: VisualNameComponents = {
        act: 'IV', // Not in config
        sceneNumber: 1,
        counter: 1,
        slug: 'cafe',
      };
      const result = generateVisualName(prequelConfig, components);
      expect(result).toBe('01_01_cafe');
    });
  });

  describe('Sequel pattern (CHAPTER_SCENE_SLUG_COUNTER)', () => {
    const sequelConfig: VisualSystemConfig = {
      pattern: 'CHAPTER_SCENE_SLUG_COUNTER',
      chapterPrefix: 'ch',
      scenePadding: 2,
      counterPadding: 2,
      jumpPrefixShared: '',
    };

    it('generates name with chapter prefix', () => {
      const components: VisualNameComponents = {
        chapter: 1,
        sceneNumber: 1,
        counter: 1,
        slug: 'cafe',
      };
      const result = generateVisualName(sequelConfig, components);
      expect(result).toBe('ch1_01_01_cafe');
    });

    it('generates name for later chapter', () => {
      const components: VisualNameComponents = {
        chapter: 5,
        sceneNumber: 10,
        counter: 3,
        slug: 'garden',
      };
      const result = generateVisualName(sequelConfig, components);
      expect(result).toBe('ch5_10_03_garden');
    });
  });
});

describe('generateJumpLabel', () => {
  // Mock route configurations
  const lucasRoute: RouteConfig = {
    id: '1',
    projectId: 'proj-1',
    routeKey: 'lucas',
    routeName: "Lucas's Route",
    jumpPrefix: 'lucas_',
    sortOrder: 1,
    isShared: false,
  };

  const eileenRoute: RouteConfig = {
    id: '2',
    projectId: 'proj-1',
    routeKey: 'eileen',
    routeName: "Eileen's Route",
    jumpPrefix: 'eileen_',
    sortOrder: 2,
    isShared: false,
  };

  const sharedRoute: RouteConfig = {
    id: '3',
    projectId: 'proj-1',
    routeKey: 'shared',
    routeName: 'Shared Route',
    jumpPrefix: '',
    sortOrder: 0,
    isShared: true,
  };

  it('generates shared route jump label', () => {
    const result = generateJumpLabel(sharedRoute, 5, 2);
    expect(result).toBe('05');
  });

  it('generates Lucas route jump label', () => {
    const result = generateJumpLabel(lucasRoute, 3, 2);
    expect(result).toBe('lucas_03');
  });

  it('generates Eileen route jump label', () => {
    const result = generateJumpLabel(eileenRoute, 7, 2);
    expect(result).toBe('eileen_07');
  });

  it('generates label for null route (shared/common)', () => {
    const result = generateJumpLabel(null, 1, 2);
    expect(result).toBe('01');
  });

  it('pads scene number correctly', () => {
    const result = generateJumpLabel(sharedRoute, 1, 2);
    expect(result).toBe('01');
  });

  it('uses scenePadding of 1', () => {
    const result = generateJumpLabel(lucasRoute, 5, 1);
    expect(result).toBe('lucas_5');
  });
});
