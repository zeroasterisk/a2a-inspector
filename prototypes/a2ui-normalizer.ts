/**
 * A2UI Normalizer — converts v0.8 messages to v0.9 internal format.
 * 
 * This allows the tree view renderer to work with a single format internally.
 */

import { A2UIComponent, A2UISurface } from './a2ui-types';
import { detectVersion, getMessageType, getSurfaceId } from './a2ui-detector';

/**
 * Surface state manager. Accumulates A2UI messages into surface state.
 */
export class SurfaceManager {
  private surfaces = new Map<string, A2UISurface>();

  /**
   * Process a single A2UI message and update internal state.
   * Returns the affected surface or null.
   */
  processMessage(data: any): A2UISurface | null {
    const version = detectVersion(data);
    if (!version) return null;

    const msgType = getMessageType(data);

    switch (msgType) {
      case 'createSurface':
        return this.handleCreateSurface(data, version as 'v0.9' | 'v0.10');
      case 'beginRendering':
        return this.handleBeginRendering(data);
      case 'updateComponents':
        return this.handleUpdateComponents(data);
      case 'surfaceUpdate':
        return this.handleSurfaceUpdate(data);
      case 'updateDataModel':
        return this.handleUpdateDataModel(data);
      case 'dataModelUpdate':
        return this.handleDataModelUpdateV08(data);
      case 'deleteSurface':
        return this.handleDeleteSurface(data);
      default:
        return null;
    }
  }

  getSurface(id: string): A2UISurface | undefined {
    return this.surfaces.get(id);
  }

  getAllSurfaces(): A2UISurface[] {
    return Array.from(this.surfaces.values());
  }

  // --- v0.9/v0.10 handlers ---

  private handleCreateSurface(data: any, version: 'v0.9' | 'v0.10'): A2UISurface {
    const payload = data.createSurface;
    const surface: A2UISurface = {
      surfaceId: payload.surfaceId,
      catalogId: payload.catalogId,
      version,
      components: [],
      dataModel: {},
      theme: payload.theme,
    };
    this.surfaces.set(surface.surfaceId, surface);
    return surface;
  }

  private handleUpdateComponents(data: any): A2UISurface | null {
    const payload = data.updateComponents;
    const surface = this.surfaces.get(payload.surfaceId);
    if (!surface) return null;

    // v0.9 components have flat structure: { id, component: "Text", text: {...}, ... }
    for (const raw of payload.components) {
      const { id, component, ...properties } = raw;
      const existing = surface.components.findIndex(c => c.id === id);
      const normalized: A2UIComponent = {
        id,
        type: component,
        properties,
        children: properties.children,
      };
      if (existing >= 0) {
        surface.components[existing] = normalized;
      } else {
        surface.components.push(normalized);
      }
    }
    return surface;
  }

  private handleUpdateDataModel(data: any): A2UISurface | null {
    const payload = data.updateDataModel;
    const surface = this.surfaces.get(payload.surfaceId);
    if (!surface) return null;

    const path = payload.path || '/';
    if (path === '/') {
      surface.dataModel = payload.value ?? {};
    } else {
      // Simple path-based set
      const keys = path.split('/').filter(Boolean);
      let target: any = surface.dataModel;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in target)) target[keys[i]] = {};
        target = target[keys[i]];
      }
      if (payload.value !== undefined) {
        target[keys[keys.length - 1]] = payload.value;
      } else {
        delete target[keys[keys.length - 1]];
      }
    }
    return surface;
  }

  // --- v0.8 handlers (normalize to v0.9 format) ---

  private handleBeginRendering(data: any): A2UISurface {
    const payload = data.beginRendering;
    const surface: A2UISurface = {
      surfaceId: payload.surfaceId,
      catalogId: payload.catalogId,
      version: 'v0.8',
      components: [],
      dataModel: {},
      theme: payload.styles,
      rootId: payload.root,
    };
    this.surfaces.set(surface.surfaceId, surface);
    return surface;
  }

  private handleSurfaceUpdate(data: any): A2UISurface | null {
    const payload = data.surfaceUpdate;
    const surface = this.surfaces.get(payload.surfaceId);
    if (!surface) return null;

    // v0.8 components: { id, component: { "Text": { text: {...} } } }
    for (const raw of payload.components) {
      const { id, weight, component: componentWrapper } = raw;

      // Extract the component type and properties from the wrapper
      const componentType = Object.keys(componentWrapper)[0]; // e.g. "Text"
      const componentProps = componentWrapper[componentType] || {};

      const normalized: A2UIComponent = {
        id,
        type: componentType,
        properties: { ...componentProps, ...(weight !== undefined ? { weight } : {}) },
      };

      // Extract children from various property names
      if (componentProps.children) {
        normalized.children = componentProps.children;
      }

      const existing = surface.components.findIndex(c => c.id === id);
      if (existing >= 0) {
        surface.components[existing] = normalized;
      } else {
        surface.components.push(normalized);
      }
    }
    return surface;
  }

  private handleDataModelUpdateV08(data: any): A2UISurface | null {
    const payload = data.dataModelUpdate;
    const surface = this.surfaces.get(payload.surfaceId);
    if (!surface) return null;

    // v0.8 data model uses `contents` array with typed values
    const path = payload.path || '/';
    const normalizedValue: Record<string, any> = {};

    for (const entry of payload.contents || []) {
      if (entry.valueString !== undefined) normalizedValue[entry.key] = entry.valueString;
      else if (entry.valueNumber !== undefined) normalizedValue[entry.key] = entry.valueNumber;
      else if (entry.valueBoolean !== undefined) normalizedValue[entry.key] = entry.valueBoolean;
      else if (entry.valueMap !== undefined) {
        const map: Record<string, any> = {};
        for (const item of entry.valueMap) {
          if (item.valueString !== undefined) map[item.key] = item.valueString;
          else if (item.valueNumber !== undefined) map[item.key] = item.valueNumber;
          else if (item.valueBoolean !== undefined) map[item.key] = item.valueBoolean;
        }
        normalizedValue[entry.key] = map;
      }
    }

    if (path === '/') {
      Object.assign(surface.dataModel, normalizedValue);
    } else {
      const keys = path.split('/').filter(Boolean);
      let target: any = surface.dataModel;
      for (const k of keys.slice(0, -1)) {
        if (!(k in target)) target[k] = {};
        target = target[k];
      }
      target[keys[keys.length - 1]] = normalizedValue;
    }

    return surface;
  }

  private handleDeleteSurface(data: any): A2UISurface | null {
    const payload = data.deleteSurface;
    const surface = this.surfaces.get(payload.surfaceId);
    if (surface) {
      this.surfaces.delete(payload.surfaceId);
    }
    return surface ?? null;
  }
}
