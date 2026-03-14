import { isA2UIPart, detectVersion, getMessageType, getSurfaceId } from './a2ui-detector';

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
  DiscordMessage: '💬',
  DiscordEmbed: '🖼️',
  DiscordButton: '🔘',
  DiscordActionRow: '↔️',
  DiscordSelectMenu: '📋',
  DiscordModal: '🪟',
  DiscordTextInput: '✏️'
};

const VERSION_COLORS: Record<string, string> = {
  'v0.8': '#e67e22',
  'v0.9': '#3498db',
  'v0.10': '#9b59b6',
};

interface RenderableComponent {
  id: string;
  type: string;
  properties: Record<string, any>;
  children?: string[];
}

export function tryRenderA2UIPart(part: any): string | null {
  if (!isA2UIPart(part)) return null;
  const data = part.data;
  const version = detectVersion(data) || 'v0.9';
  const type = getMessageType(data);
  const surfaceId = getSurfaceId(data) || 'unknown';
  
  // Render to HTML element, then extract outerHTML
  const treeView = renderRawPayloadTreeView(data, version, type, surfaceId);
  return treeView.outerHTML;
}

function renderRawPayloadTreeView(data: any, version: string, type: string, surfaceId: string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'a2ui-surface-card';

  // Extract catalogId if present
  let catalogId = '';
  if (data.createSurface?.catalogId) catalogId = data.createSurface.catalogId;
  else if (data.beginRendering?.catalogId) catalogId = data.beginRendering.catalogId;

  // Header
  const header = document.createElement('div');
  header.className = 'a2ui-surface-header';
  header.innerHTML = `
    <span class="a2ui-icon">🎨</span>
    <span class="a2ui-surface-title"><strong>${escapeHtml(type)}</strong>: ${escapeHtml(surfaceId)}</span>
    <span class="a2ui-version-badge" style="background: ${VERSION_COLORS[version] || '#333'}">${version}</span>
    ${catalogId ? `<a href="${escapeHtml(catalogId)}" target="_blank" class="a2ui-catalog-badge">📚 ${escapeHtml(shortCatalogId(catalogId))}</a>` : ''}
  `;
  container.appendChild(header);

  // Extract components to render
  let components: RenderableComponent[] = [];
  
  if (version === 'v0.9' || version === 'v0.10') {
    const rawComponents = data.updateComponents?.components || data.createSurface?.components || [];
    components = rawComponents.map((c: any) => {
      const { id, component, children, ...props } = c;
      return { id, type: component, properties: props, children };
    });
  } else if (version === 'v0.8') {
    const rawComponents = data.surfaceUpdate?.components || data.beginRendering?.components || [];
    components = rawComponents.map((c: any) => {
      const id = c.id;
      let type = 'Unknown';
      let properties: any = {};
      if (c.component && typeof c.component === 'object') {
        const keys = Object.keys(c.component);
        if (keys.length > 0) {
          type = keys[0];
          properties = c.component[type];
        }
      }
      const children = properties.children || [];
      const cleanProps = { ...properties };
      delete cleanProps.children;
      return { id, type, properties: cleanProps, children };
    });
  }

  if (components.length > 0) {
    const treeContainer = document.createElement('div');
    treeContainer.className = 'a2ui-tree';
    
    // We just render them as a flat list if no roots are explicitly designated by this payload alone,
    // or we can try to find roots (components not listed as children in THIS payload).
    const allChildIds = new Set<string>();
    components.forEach(c => {
      if (c.children) {
        c.children.forEach(childId => allChildIds.add(childId));
      }
    });
    
    const rootComponents = components.filter(c => !allChildIds.has(c.id));
    const rootsToRender = rootComponents.length > 0 ? rootComponents : components;
    
    for (const comp of rootsToRender) {
      treeContainer.appendChild(renderComponentNode(comp, components, 0, catalogId));
    }
    
    container.appendChild(treeContainer);
  } else {
      const emptyState = document.createElement('div');
      emptyState.className = 'a2ui-tree-empty';
      emptyState.textContent = 'No components in this payload';
      container.appendChild(emptyState);
  }

  // Raw payload toggle
  const dataSection = document.createElement('div');
  dataSection.className = 'a2ui-data-model';

  const dataHeader = document.createElement('div');
  dataHeader.className = 'a2ui-data-header';
  dataHeader.innerHTML = '📄 <strong>Raw Payload</strong>';
  dataHeader.style.cursor = 'pointer';

  const dataContent = document.createElement('pre');
  dataContent.className = 'a2ui-data-content';
  dataContent.textContent = JSON.stringify(data, null, 2);
  dataContent.style.display = 'none';

  dataHeader.addEventListener('click', () => {
    dataContent.style.display = dataContent.style.display === 'none' ? 'block' : 'none';
  });

  dataSection.appendChild(dataHeader);
  dataSection.appendChild(dataContent);
  container.appendChild(dataSection);

  return container;
}

function renderComponentNode(
  component: RenderableComponent,
  allComponents: RenderableComponent[],
  depth: number,
  catalogId: string
): HTMLElement {
  const node = document.createElement('div');
  node.className = 'a2ui-tree-node';
  node.style.marginLeft = `${depth * 16}px`;

  const isCustom = !COMPONENT_ICONS[component.type];
  const icon = COMPONENT_ICONS[component.type] || '🧩';
  const children = component.children || [];
  const hasChildren = children.length > 0;

  // Node label
  const label = document.createElement('div');
  label.className = 'a2ui-node-label';

  const expandIcon = hasChildren ? '▼ ' : '  ';
  const summary = getComponentSummary(component);
  
  const customBadge = isCustom ? `<span class="a2ui-custom-badge" title="Custom Component">✨ Custom</span>` : '';

  label.innerHTML = `
    <span class="a2ui-expand-icon">${escapeHtml(expandIcon)}</span>
    <span class="a2ui-component-icon">${icon}</span>
    <span class="a2ui-component-type">${escapeHtml(component.type)}</span>
    <span class="a2ui-component-id">(${escapeHtml(component.id)})</span>
    ${customBadge}
    ${summary ? `<span class="a2ui-component-summary">${escapeHtml(summary)}</span>` : ''}
  `;

  node.appendChild(label);

  // Properties (collapsed by default)
  const propsContainer = document.createElement('div');
  propsContainer.className = 'a2ui-node-props';
  propsContainer.style.display = 'none';

  const cleanProps = { ...component.properties };
  if (Object.keys(cleanProps).length > 0) {
    const propsPre = document.createElement('pre');
    propsPre.textContent = JSON.stringify(cleanProps, null, 2);
    propsContainer.appendChild(propsPre);
  }
  
  if (isCustom && catalogId) {
    const catalogLink = document.createElement('div');
    catalogLink.className = 'a2ui-custom-link';
    catalogLink.innerHTML = `<a href="${escapeHtml(catalogId)}" target="_blank">View Custom Catalog</a>`;
    propsContainer.appendChild(catalogLink);
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
        const renderedChild = renderComponentNode(childComponent, allComponents, 0, catalogId);
        renderedChild.style.marginLeft = '16px';
        childContainer.appendChild(renderedChild);
      } else {
        // Child not in this payload
        const placeholder = document.createElement('div');
        placeholder.className = 'a2ui-tree-node a2ui-missing';
        placeholder.style.marginLeft = '16px';
        placeholder.textContent = `↪ Child reference: ${childId}`;
        childContainer.appendChild(placeholder);
      }
    }
    node.appendChild(childContainer);
  }

  return node;
}

function getComponentSummary(component: RenderableComponent): string {
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
      if (props.text) return `"${truncate(typeof props.text === 'string' ? props.text : (props.text.literalString || ''), 30)}"`;
      if (props.label) return `"${truncate(typeof props.label === 'string' ? props.label : (props.label.literalString || ''), 30)}"`;
      if (props.title) return `"${truncate(typeof props.title === 'string' ? props.title : (props.title.literalString || ''), 30)}"`;
      return '';
  }
}

function shortCatalogId(catalogId: string): string {
  if (catalogId.includes('/')) {
    const parts = catalogId.split('/');
    return parts[parts.length - 1].replace('.json', '');
  }
  return catalogId;
}

function truncate(s: string, maxLen: number): string {
  if (!s) return '';
  return s.length > maxLen ? s.substring(0, maxLen - 1) + '…' : s;
}

function escapeHtml(s: string): string {
  if (!s) return '';
  return s
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
