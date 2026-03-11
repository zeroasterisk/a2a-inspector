/**
 * A2UI Tree View Renderer for the A2A Inspector
 * 
 * Renders A2UI surfaces as collapsible tree views in the chat area.
 * Pure vanilla TS/DOM — no framework dependencies.
 */

import { A2UIComponent, A2UISurface, A2UIVersion } from './a2ui-types';
import { SurfaceManager } from './a2ui-normalizer';
import { isA2UIPart, detectVersion, getMessageType } from './a2ui-detector';

// ============================================================================
// Component Type Icons (for visual distinction)
// ============================================================================

const COMPONENT_ICONS: Record<string, string> = {
  Text: '📝',
  Image: '🖼️',
  Icon: '🔣',
  Button: '🔘',
  TextField: '✏️',
  CheckBox: '☑️',
  Slider: '🎚️',
  DateTimeInput: '📅',
  MultipleChoice: '📋',
  Row: '↔️',
  Column: '↕️',
  Card: '🃏',
  List: '📃',
  Tabs: '📑',
  Modal: '🪟',
  Divider: '➖',
  AudioPlayer: '🔊',
  Video: '🎬',
};

const VERSION_COLORS: Record<A2UIVersion, string> = {
  'v0.8': '#e67e22',
  'v0.9': '#3498db',
  'v0.10': '#9b59b6',
};

// ============================================================================
// Tree View Renderer
// ============================================================================

/**
 * Render an A2UI surface as a collapsible tree view HTML element.
 */
export function renderSurfaceTreeView(surface: A2UISurface): HTMLElement {
  const container = document.createElement('div');
  container.className = 'a2ui-surface-card';

  // Header
  const header = document.createElement('div');
  header.className = 'a2ui-surface-header';
  header.innerHTML = `
    <span class="a2ui-icon">🎨</span>
    <span class="a2ui-surface-title">A2UI Surface: <strong>${escapeHtml(surface.surfaceId)}</strong></span>
    <span class="a2ui-version-badge" style="background: ${VERSION_COLORS[surface.version]}">${surface.version}</span>
    ${surface.catalogId ? `<span class="a2ui-catalog-badge">${escapeHtml(shortCatalogId(surface.catalogId))}</span>` : ''}
    <span class="a2ui-component-count">${surface.components.length} components</span>
  `;
  container.appendChild(header);

  // Component tree
  const treeContainer = document.createElement('div');
  treeContainer.className = 'a2ui-tree';

  const rootId = surface.rootId || findRootId(surface.components);
  if (rootId) {
    const rootComponent = surface.components.find(c => c.id === rootId);
    if (rootComponent) {
      treeContainer.appendChild(renderComponentNode(rootComponent, surface.components, 0));
    }
  } else {
    // No root found — render all components flat
    for (const comp of surface.components) {
      treeContainer.appendChild(renderComponentNode(comp, surface.components, 0));
    }
  }

  container.appendChild(treeContainer);

  // Data model section (if any data)
  if (Object.keys(surface.dataModel).length > 0) {
    const dataSection = document.createElement('div');
    dataSection.className = 'a2ui-data-model';

    const dataHeader = document.createElement('div');
    dataHeader.className = 'a2ui-data-header';
    dataHeader.innerHTML = '📊 <strong>Data Model</strong>';
    dataHeader.style.cursor = 'pointer';

    const dataContent = document.createElement('pre');
    dataContent.className = 'a2ui-data-content';
    dataContent.textContent = JSON.stringify(surface.dataModel, null, 2);
    dataContent.style.display = 'none';

    dataHeader.addEventListener('click', () => {
      dataContent.style.display = dataContent.style.display === 'none' ? 'block' : 'none';
    });

    dataSection.appendChild(dataHeader);
    dataSection.appendChild(dataContent);
    container.appendChild(dataSection);
  }

  return container;
}

/**
 * Render a single component node with its children.
 */
function renderComponentNode(
  component: A2UIComponent,
  allComponents: A2UIComponent[],
  depth: number
): HTMLElement {
  const node = document.createElement('div');
  node.className = 'a2ui-tree-node';
  node.style.paddingLeft = `${depth * 16}px`;

  const icon = COMPONENT_ICONS[component.type] || '📦';
  const children = component.children || [];
  const hasChildren = children.length > 0;

  // Node label
  const label = document.createElement('div');
  label.className = 'a2ui-node-label';

  const expandIcon = hasChildren ? '▼ ' : '  ';
  const summary = getComponentSummary(component);

  label.innerHTML = `
    <span class="a2ui-expand-icon">${expandIcon}</span>
    <span class="a2ui-component-icon">${icon}</span>
    <span class="a2ui-component-type">${escapeHtml(component.type)}</span>
    <span class="a2ui-component-id">(${escapeHtml(component.id)})</span>
    ${summary ? `<span class="a2ui-component-summary">${escapeHtml(summary)}</span>` : ''}
  `;

  node.appendChild(label);

  // Properties (collapsed by default)
  const propsContainer = document.createElement('div');
  propsContainer.className = 'a2ui-node-props';
  propsContainer.style.display = 'none';

  const cleanProps = { ...component.properties };
  delete cleanProps.children; // Already shown as tree structure
  if (Object.keys(cleanProps).length > 0) {
    const propsPre = document.createElement('pre');
    propsPre.textContent = JSON.stringify(cleanProps, null, 2);
    propsContainer.appendChild(propsPre);
  }
  node.appendChild(propsContainer);

  // Click to expand/collapse
  label.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = propsContainer.style.display !== 'none';
    propsContainer.style.display = isExpanded ? 'none' : 'block';
  });

  // Children container
  if (hasChildren) {
    const childContainer = document.createElement('div');
    childContainer.className = 'a2ui-children';

    for (const childId of children) {
      const childComponent = allComponents.find(c => c.id === childId);
      if (childComponent) {
        childContainer.appendChild(renderComponentNode(childComponent, allComponents, depth + 1));
      } else {
        // Missing child reference
        const missing = document.createElement('div');
        missing.className = 'a2ui-tree-node a2ui-missing';
        missing.style.paddingLeft = `${(depth + 1) * 16}px`;
        missing.textContent = `⚠️ Missing component: ${childId}`;
        childContainer.appendChild(missing);
      }
    }
    node.appendChild(childContainer);
  }

  return node;
}

// ============================================================================
// Integration with Inspector's processPart()
// ============================================================================

/**
 * Process an A2A part that may contain A2UI data.
 * Returns an HTML string if A2UI detected, null otherwise.
 * 
 * Drop-in replacement for the current processPart() data handling:
 * 
 * Before:
 *   } else if (p.data) {
 *     return `<pre><code>${JSON.stringify(p.data, null, 2)}</code></pre>`;
 *   }
 * 
 * After:
 *   } else if (p.data) {
 *     const a2uiHtml = tryRenderA2UIPart(p, surfaceManager);
 *     if (a2uiHtml) return a2uiHtml;
 *     return `<pre><code>${JSON.stringify(p.data, null, 2)}</code></pre>`;
 *   }
 */
export function tryRenderA2UIPart(part: any, surfaceManager: SurfaceManager): string | null {
  if (!isA2UIPart(part)) return null;

  const data = part.data;
  const surface = surfaceManager.processMessage(data);
  if (!surface) return null;

  // Render to HTML element, then extract outerHTML
  const treeView = renderSurfaceTreeView(surface);
  return treeView.outerHTML;
}

// ============================================================================
// Helpers
// ============================================================================

function findRootId(components: A2UIComponent[]): string | null {
  // Look for component with id "root"
  const root = components.find(c => c.id === 'root');
  if (root) return 'root';

  // Look for component that isn't referenced as a child of any other
  const allChildIds = new Set<string>();
  for (const c of components) {
    for (const childId of c.children || []) {
      allChildIds.add(childId);
    }
  }
  const roots = components.filter(c => !allChildIds.has(c.id));
  return roots.length === 1 ? roots[0].id : null;
}

function getComponentSummary(component: A2UIComponent): string {
  const props = component.properties;

  switch (component.type) {
    case 'Text': {
      const text = props.text;
      if (typeof text === 'string') return `"${truncate(text, 40)}"`;
      if (text?.literalString) return `"${truncate(text.literalString, 40)}"`;
      if (text?.path) return `{${text.path}}`;
      return '';
    }
    case 'Button': {
      const label = props.label;
      if (typeof label === 'string') return `"${truncate(label, 30)}"`;
      if (label?.literalString) return `"${truncate(label.literalString, 30)}"`;
      return '';
    }
    case 'Image':
      return props.url?.literalString ? `url: "${truncate(props.url.literalString, 40)}"` : '';
    case 'TextField':
      return props.label?.literalString ? `label: "${truncate(props.label.literalString, 30)}"` : '';
    case 'CheckBox':
      return props.label?.literalString ? `"${truncate(props.label.literalString, 30)}"` : '';
    case 'Slider':
      return `[${props.minValue ?? 0}..${props.maxValue ?? 100}]`;
    default:
      return '';
  }
}

function shortCatalogId(catalogId: string): string {
  // Shorten long catalog URLs
  if (catalogId.includes('/')) {
    const parts = catalogId.split('/');
    return parts[parts.length - 1].replace('.json', '');
  }
  return catalogId;
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.substring(0, maxLen - 1) + '…' : s;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
