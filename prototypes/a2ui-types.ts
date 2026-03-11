/**
 * A2UI Types for the A2A Inspector
 * Covers v0.8, v0.9, and v0.10 message formats.
 */

// ============================================================================
// Version Detection
// ============================================================================

export type A2UIVersion = 'v0.8' | 'v0.9' | 'v0.10';

// ============================================================================
// Normalized Internal Model (v0.9-based)
// ============================================================================

export interface A2UISurface {
  surfaceId: string;
  catalogId?: string;
  version: A2UIVersion;
  components: A2UIComponent[];
  dataModel: Record<string, any>;
  theme?: Record<string, any>;
  rootId?: string; // v0.8 sets this explicitly
}

export interface A2UIComponent {
  id: string;
  type: string; // e.g. "Text", "Button", "Column"
  properties: Record<string, any>;
  children?: string[]; // child component IDs
}

// ============================================================================
// Raw Message Types (as they appear on the wire)
// ============================================================================

// v0.9/v0.10 messages
export interface V09CreateSurface {
  version: 'v0.9' | 'v0.10';
  createSurface: {
    surfaceId: string;
    catalogId: string;
    theme?: Record<string, any>;
    sendDataModel?: boolean;
  };
}

export interface V09UpdateComponents {
  version: 'v0.9' | 'v0.10';
  updateComponents: {
    surfaceId: string;
    components: Array<{
      id: string;
      component: string;
      [key: string]: any;
    }>;
  };
}

export interface V09UpdateDataModel {
  version: 'v0.9' | 'v0.10';
  updateDataModel: {
    surfaceId: string;
    path?: string;
    value?: any;
  };
}

export interface V09DeleteSurface {
  version: 'v0.9' | 'v0.10';
  deleteSurface: {
    surfaceId: string;
  };
}

export interface V010CallFunction {
  version: 'v0.10';
  functionCallId: string;
  wantResponse?: boolean;
  callFunction: {
    call: string;
    returnType: any;
    callableFrom: 'remoteOnly' | 'clientOrRemote';
  };
}

// v0.8 messages
export interface V08BeginRendering {
  beginRendering: {
    surfaceId: string;
    root: string;
    catalogId?: string;
    styles?: Record<string, any>;
  };
}

export interface V08SurfaceUpdate {
  surfaceUpdate: {
    surfaceId: string;
    components: Array<{
      id: string;
      weight?: number;
      component: Record<string, any>; // { "Text": { ... } }
    }>;
  };
}

export interface V08DataModelUpdate {
  dataModelUpdate: {
    surfaceId: string;
    path?: string;
    contents: Array<{
      key: string;
      valueString?: string;
      valueNumber?: number;
      valueBoolean?: boolean;
      valueMap?: Array<{
        key: string;
        valueString?: string;
        valueNumber?: number;
        valueBoolean?: boolean;
      }>;
    }>;
  };
}

export type A2UIMessage =
  | V09CreateSurface
  | V09UpdateComponents
  | V09UpdateDataModel
  | V09DeleteSurface
  | V010CallFunction
  | V08BeginRendering
  | V08SurfaceUpdate
  | V08DataModelUpdate;

// ============================================================================
// A2A DataPart containing A2UI
// ============================================================================

export interface A2UIDataPart {
  kind?: 'data';
  data: A2UIMessage;
  metadata?: {
    mimeType?: string;
    [key: string]: any;
  };
}

export const A2UI_MIME_TYPE = 'application/json+a2ui';
