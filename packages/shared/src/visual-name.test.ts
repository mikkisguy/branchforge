import { describe, it, expect } from 'vitest';
import {
  generateVisualName,
  generateJumpLabel,
  type VisualSystemConfig,
  type VisualNameComponents,
  RouteType,
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
      jumpPrefixRouteA: 'lucas_',
      jumpPrefixRouteB: 'eileen_',
      routeAName: 'Lucas',
      routeBName: 'Eileen',
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
      jumpPrefixRouteA: 'lucas_',
      jumpPrefixRouteB: 'eileen_',
      routeAName: 'Lucas',
      routeBName: 'Eileen',
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
  const config: VisualSystemConfig = {
    pattern: 'ACT_SCENE_SLUG_COUNTER',
    scenePadding: 2,
    counterPadding: 2,
    jumpPrefixShared: '',
    jumpPrefixRouteA: 'lucas_',
    jumpPrefixRouteB: 'eileen_',
    routeAName: 'Lucas',
    routeBName: 'Eileen',
  };

  it('generates shared route jump label', () => {
    const result = generateJumpLabel(config, RouteType.SHARED, 5);
    expect(result).toBe('05');
  });

  it('generates Lucas route jump label', () => {
    const result = generateJumpLabel(config, RouteType.LUCAS, 3);
    expect(result).toBe('lucas_03');
  });

  it('generates Eileen route jump label', () => {
    const result = generateJumpLabel(config, RouteType.EILEEN, 7);
    expect(result).toBe('eileen_07');
  });

  it('generates label for null route (shared/common)', () => {
    const result = generateJumpLabel(config, null, 1);
    expect(result).toBe('01');
  });

  it('pads scene number correctly', () => {
    const result = generateJumpLabel(config, RouteType.SHARED, 1);
    expect(result).toBe('01');
  });
});
