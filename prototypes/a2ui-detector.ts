/**
 * A2UI Detection Logic for the A2A Inspector
 * 
 * Detects A2UI content in A2A message parts and identifies the version.
 * Works with v0.8, v0.9, and v0.10.
 */

import { A2UIVersion, A2UI_MIME_TYPE, A2UIMessage, A2UIDataPart } from './a2ui-types';

// v0.9/v0.10 message keys
const V09_KEYS = ['createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface'];
// v0.10-only keys
const V010_KEYS = ['callFunction'];
// v0.8 message keys
const V08_KEYS = ['beginRendering', 'surfaceUpdate', 'dataModelUpdate'];
// Shared between v0.8 and v0.9+
const SHARED_KEYS = ['deleteSurface'];

/**
 * Check if an A2A part contains A2UI data.
 */
export function isA2UIPart(part: any): part is A2UIDataPart {
  if (!part) return false;

  // Primary: check mimeType metadata
  if (part?.metadata?.mimeType === A2UI_MIME_TYPE) return true;

  // Fallback: structural detection on `data` field
  const data = part?.data;
  if (!data || typeof data !== 'object') return false;

  const keys = Object.keys(data);
  const allA2UIKeys = [...V09_KEYS, ...V010_KEYS, ...V08_KEYS, ...SHARED_KEYS];
  return keys.some(k => allA2UIKeys.includes(k));
}

/**
 * Detect the A2UI version from a message payload.
 */
export function detectVersion(data: any): A2UIVersion | null {
  if (!data || typeof data !== 'object') return null;

  // Explicit version field (v0.9+)
  if (data.version === 'v0.10') return 'v0.10';
  if (data.version === 'v0.9') return 'v0.9';

  // v0.8 structural detection (no version field)
  if (data.beginRendering || data.surfaceUpdate || data.dataModelUpdate) {
    return 'v0.8';
  }

  // v0.9+ keys without explicit version — default to v0.9
  if (data.createSurface || data.updateComponents || data.updateDataModel) {
    return 'v0.9';
  }

  return null;
}

/**
 * Get the A2UI message type name for display.
 */
export function getMessageType(data: any): string {
  if (data.createSurface) return 'createSurface';
  if (data.updateComponents) return 'updateComponents';
  if (data.updateDataModel) return 'updateDataModel';
  if (data.deleteSurface) return 'deleteSurface';
  if (data.callFunction) return 'callFunction';
  if (data.beginRendering) return 'beginRendering';
  if (data.surfaceUpdate) return 'surfaceUpdate';
  if (data.dataModelUpdate) return 'dataModelUpdate';
  return 'unknown';
}

/**
 * Extract the surfaceId from any A2UI message.
 */
export function getSurfaceId(data: any): string | null {
  const payloads = [
    data.createSurface, data.updateComponents, data.updateDataModel,
    data.deleteSurface, data.beginRendering, data.surfaceUpdate,
    data.dataModelUpdate,
  ];
  for (const p of payloads) {
    if (p?.surfaceId) return p.surfaceId;
  }
  return null;
}

/**
 * Scan all parts in an A2A message/event and extract A2UI parts.
 * Works with the inspector's AgentResponseEvent shape.
 */
export function extractA2UIParts(event: any): Array<{ data: any; version: A2UIVersion; type: string; surfaceId: string | null }> {
  const results: Array<{ data: any; version: A2UIVersion; type: string; surfaceId: string | null }> = [];

  // Collect all part arrays
  const partArrays: any[][] = [];

  // Direct message parts
  if (event.parts) partArrays.push(event.parts);

  // Status message parts
  if (event.status?.message?.parts) partArrays.push(event.status.message.parts);

  // Artifact parts
  if (event.artifact?.parts) partArrays.push(event.artifact.parts);
  if (event.artifacts) {
    for (const a of event.artifacts) {
      if (a.parts) partArrays.push(a.parts);
    }
  }

  for (const parts of partArrays) {
    for (const part of parts) {
      if (isA2UIPart(part)) {
        const data = part.data;
        const version = detectVersion(data);
        if (version) {
          results.push({
            data,
            version,
            type: getMessageType(data),
            surfaceId: getSurfaceId(data),
          });
        }
      }
    }
  }

  return results;
}
