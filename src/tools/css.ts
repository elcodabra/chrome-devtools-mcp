/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool, type MatchedStyles} from './ToolDefinition.js';

const INHERITED_PROPERTIES = new Set([
  'azimuth',
  'border-collapse',
  'border-spacing',
  'caption-side',
  'color',
  'cursor',
  'direction',
  'empty-cells',
  'font',
  'font-family',
  'font-feature-settings',
  'font-kerning',
  'font-language-override',
  'font-optical-sizing',
  'font-palette',
  'font-size',
  'font-size-adjust',
  'font-stretch',
  'font-style',
  'font-synthesis',
  'font-variant',
  'font-variant-alternates',
  'font-variant-caps',
  'font-variant-east-asian',
  'font-variant-ligatures',
  'font-variant-numeric',
  'font-variant-position',
  'font-variation-settings',
  'font-weight',
  'hanging-punctuation',
  'hyphenate-character',
  'hyphens',
  'image-rendering',
  'letter-spacing',
  'line-break',
  'line-height',
  'list-style',
  'list-style-image',
  'list-style-position',
  'list-style-type',
  'orphans',
  'quotes',
  'ruby-align',
  'ruby-position',
  'tab-size',
  'text-align',
  'text-align-last',
  'text-combine-upright',
  'text-decoration-skip-ink',
  'text-emphasis',
  'text-emphasis-color',
  'text-emphasis-position',
  'text-emphasis-style',
  'text-indent',
  'text-justify',
  'text-orientation',
  'text-rendering',
  'text-shadow',
  'text-transform',
  'text-underline-offset',
  'text-underline-position',
  'visibility',
  'white-space',
  'white-space-collapse',
  'widows',
  'word-break',
  'word-spacing',
  'word-wrap',
  'writing-mode',
]);

function isInheritedProperty(propertyName: string): boolean {
  const lower = propertyName.toLowerCase();
  return lower.startsWith('--') || INHERITED_PROPERTIES.has(lower);
}

interface StyleRuleLike {
  origin: string;
  sourceURL?: string;
  isUserAgent(): boolean;
  selectorText(): string;
  lineNumberInSource(selectorIndex: number): number;
  columnNumberInSource(selectorIndex: number): number | undefined;
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function isStyleRule(rule: unknown): rule is StyleRuleLike {
  if (!isRecord(rule)) {
    return false;
  }
  return (
    typeof rule['selectorText'] === 'function' &&
    typeof rule['isUserAgent'] === 'function' &&
    typeof rule['lineNumberInSource'] === 'function'
  );
}

function formatCssStyles(matchedStyles: MatchedStyles, uid: string): string {
  const targetNode = matchedStyles.node();
  const lines: string[] = [];

  const idAttr = targetNode.getAttribute('id');
  const classAttr = targetNode.getAttribute('class');
  const tag = targetNode.nodeNameInCorrectCase();
  let elementLabel = `<${tag}`;
  if (idAttr) {
    elementLabel += ` id="${idAttr}"`;
  }
  if (classAttr) {
    elementLabel += ` class="${classAttr}"`;
  }
  elementLabel += `> (uid: "${uid}")`;

  lines.push(`Styles for ${elementLabel}:`);

  // 1. Inline Styles
  let hasInline = false;
  for (const style of matchedStyles.nodeStyles()) {
    if (matchedStyles.isInherited(style)) {
      continue;
    }
    if (style.type === 'Inline' || !style.parentRule) {
      const properties = style.leadingProperties();
      if (properties.length > 0) {
        if (!hasInline) {
          lines.push('\nInline Styles:');
          hasInline = true;
        }
        for (const prop of properties) {
          if (prop.disabled || !prop.parsedOk) {
            continue;
          }
          const state = matchedStyles.propertyState(prop);
          const stateStr = state ? `[${state.toLowerCase()}] ` : '';
          const hasImpInVal = prop.value.toLowerCase().includes('!important');
          const imp = prop.important && !hasImpInVal ? ' !important' : '';
          lines.push(`  ${stateStr}${prop.name}: ${prop.value}${imp};`);
        }
      }
    }
  }

  // 2. Matched Rules
  const matchedRuleLines: string[] = [];
  for (const style of matchedStyles.nodeStyles()) {
    if (matchedStyles.isInherited(style)) {
      continue;
    }
    const parentRule = isStyleRule(style.parentRule) ? style.parentRule : null;
    if (!parentRule) {
      continue;
    }
    if (parentRule.isUserAgent() || parentRule.origin === 'user-agent') {
      continue;
    }
    const properties = style.leadingProperties();
    if (properties.length === 0) {
      continue;
    }

    const selector = parentRule.selectorText();
    let sourceLoc = '';
    const srcUrl = parentRule.sourceURL;
    const lineNum = parentRule.lineNumberInSource(0);
    const colNum = parentRule.columnNumberInSource(0);
    if (srcUrl) {
      const shortUrl = srcUrl.split('/').pop() ?? srcUrl;
      const colStr = colNum !== undefined ? `:${colNum + 1}` : '';
      sourceLoc = ` (from ${shortUrl}:${lineNum + 1}${colStr})`;
    } else if (style.styleSheetId) {
      sourceLoc = ` (from <style>:${lineNum + 1})`;
    }

    matchedRuleLines.push(`* ${selector}${sourceLoc}`);
    for (const prop of properties) {
      if (prop.disabled || !prop.parsedOk) {
        continue;
      }
      const state = matchedStyles.propertyState(prop);
      const stateStr = state ? `[${state.toLowerCase()}] ` : '';
      const hasImpInVal = prop.value.toLowerCase().includes('!important');
      const imp = prop.important && !hasImpInVal ? ' !important' : '';
      matchedRuleLines.push(
        `    ${stateStr}${prop.name}: ${prop.value}${imp};`,
      );
    }
  }

  if (matchedRuleLines.length > 0) {
    lines.push('\nMatched Rules:');
    for (const ruleLine of matchedRuleLines) {
      lines.push(`  ${ruleLine}`);
    }
  }

  // 3. Inherited Styles
  const inheritedRuleLines: string[] = [];
  for (const style of matchedStyles.inheritedStyles()) {
    const parentRule = isStyleRule(style.parentRule) ? style.parentRule : null;
    if (
      parentRule &&
      (parentRule.isUserAgent() || parentRule.origin === 'user-agent')
    ) {
      continue;
    }
    const properties = style.leadingProperties().filter(prop => {
      if (prop.disabled || !prop.parsedOk) {
        return false;
      }
      return isInheritedProperty(prop.name);
    });
    if (properties.length === 0) {
      continue;
    }

    const ancestorNode = matchedStyles.nodeForStyle(style);
    let ancestorLabel = 'ancestor';
    if (ancestorNode) {
      const ancTag = ancestorNode.nodeNameInCorrectCase();
      const ancId = ancestorNode.getAttribute('id');
      const ancClass = ancestorNode.getAttribute('class');
      ancestorLabel = `<${ancTag}${ancId ? ` id="${ancId}"` : ''}${ancClass ? ` class="${ancClass}"` : ''}>`;
    }

    const selector = parentRule ? parentRule.selectorText() : '<inline style>';
    let sourceLoc = '';
    if (parentRule) {
      const srcUrl = parentRule.sourceURL;
      const lineNum = parentRule.lineNumberInSource(0);
      if (srcUrl) {
        const shortUrl = srcUrl.split('/').pop() ?? srcUrl;
        sourceLoc = ` (from ${shortUrl}:${lineNum + 1})`;
      } else if (style.styleSheetId) {
        sourceLoc = ` (from <style>:${lineNum + 1})`;
      }
    }

    inheritedRuleLines.push(`Inherited from ${ancestorLabel}:`);
    inheritedRuleLines.push(`  * ${selector}${sourceLoc}`);
    for (const prop of properties) {
      const state = matchedStyles.propertyState(prop);
      const stateStr = state ? `[${state.toLowerCase()}] ` : '';
      const hasImpInVal = prop.value.toLowerCase().includes('!important');
      const imp = prop.important && !hasImpInVal ? ' !important' : '';
      inheritedRuleLines.push(
        `      ${stateStr}${prop.name}: ${prop.value}${imp};`,
      );
    }
  }

  if (inheritedRuleLines.length > 0) {
    lines.push('\nInherited Styles:');
    for (const line of inheritedRuleLines) {
      lines.push(`  ${line}`);
    }
  }

  // 4. Pseudo-elements
  const pseudoTypes = matchedStyles.pseudoTypes();
  if (pseudoTypes.size > 0) {
    for (const pseudoType of pseudoTypes) {
      const pseudoStyles = matchedStyles.pseudoStyles(pseudoType);
      const pseudoRuleLines: string[] = [];
      for (const style of pseudoStyles) {
        const parentRule = isStyleRule(style.parentRule)
          ? style.parentRule
          : null;
        if (
          parentRule &&
          (parentRule.isUserAgent() || parentRule.origin === 'user-agent')
        ) {
          continue;
        }
        const properties = style.leadingProperties();
        if (properties.length === 0) {
          continue;
        }
        const selector = parentRule
          ? parentRule.selectorText()
          : `::${pseudoType}`;
        let sourceLoc = '';
        if (parentRule) {
          const srcUrl = parentRule.sourceURL;
          const lineNum = parentRule.lineNumberInSource(0);
          const colNum = parentRule.columnNumberInSource(0);
          if (srcUrl) {
            const shortUrl = srcUrl.split('/').pop() ?? srcUrl;
            const colStr = colNum !== undefined ? `:${colNum + 1}` : '';
            sourceLoc = ` (from ${shortUrl}:${lineNum + 1}${colStr})`;
          } else if (style.styleSheetId) {
            sourceLoc = ` (from <style>:${lineNum + 1})`;
          }
        }
        pseudoRuleLines.push(`* ${selector}${sourceLoc}`);
        for (const prop of properties) {
          if (prop.disabled || !prop.parsedOk) {
            continue;
          }
          const state = matchedStyles.propertyState(prop);
          const stateStr = state ? `[${state.toLowerCase()}] ` : '';
          const hasImpInVal = prop.value.toLowerCase().includes('!important');
          const imp = prop.important && !hasImpInVal ? ' !important' : '';
          pseudoRuleLines.push(
            `    ${stateStr}${prop.name}: ${prop.value}${imp};`,
          );
        }
      }
      if (pseudoRuleLines.length > 0) {
        lines.push(`\nPseudo-element ::${pseudoType}:`);
        for (const line of pseudoRuleLines) {
          lines.push(`  ${line}`);
        }
      }
    }
  }

  return lines.join('\n');
}

export const getCssStyles = definePageTool({
  name: 'get_css_styles',
  description: `Retrieve matched CSS rules, inline styles, inherited styles, and cascade information for an element identified by its UID.
Use this tool to debug why specific CSS properties are applied, overridden, or conflicting. Requires a UID from take_snapshot.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    uid: zod
      .string()
      .describe(
        'The uid of the element on the page from the page content snapshot to inspect CSS styles for',
      ),
  },
  blockedByDialog: true,
  verifyFilesSchema: {},
  handler: async (request, response) => {
    const matchedStyles = await request.page.getMatchedStylesForUid(
      request.params.uid,
    );
    const output = formatCssStyles(matchedStyles, request.params.uid);
    response.appendResponseLine(output);
  },
});
