/**
 * Payslip Designer — core types.
 * Pure data types; no React imports. Used by the store, canvas, sidebar
 * panels and the export pipeline so the whole designer shares one schema.
 */

export type DesignerElementType =
  | 'text'
  | 'image'
  | 'table'
  | 'shape'
  | 'line'
  | 'divider'
  | 'icon'
  | 'qr'
  | 'signature';

/** How a variable is bound to an element. */
export type VariableBinding =
  | { kind: 'plain' } // static content
  | { kind: 'variable'; key: string } // replaced with a variable value
  | { kind: 'mixed'; tokens: { text: string; variable?: string }[] }; // inline {{var}} tokens

export interface CellDef {
  id: string;
  /** Static text, or a plain {{Variable}} token — resolved at render/export. */
  content: string;
  isTotal?: boolean;
  isHeader?: boolean;
}

/** Designer table element data (columns/rows metadata + cell grid). */
export interface DesignerTable {
  columns: number;
  rows: number;
  headerRow: boolean;
  totalRow: boolean;
  totalColumn: number; // index of column that sums up
  cells: CellDef[][];
  cellPadding: number;
  borders: boolean;
  currency: boolean;
}

export interface DesignerElement {
  id: string;
  type: DesignerElementType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  groupId?: string;
  // Content (per-type)
  text?: string;
  binding?: VariableBinding;
  imageSrc?: string;
  iconName?: string;
  qrValue?: string;
  shape?: 'rect' | 'circle';
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  // Table
  table?: DesignerTable;
  // Typography
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  textAlign?: 'left' | 'center' | 'right';
  color?: string;
  lineHeight?: number;
  letterSpacing?: number;
  // Background / border / shadow
  backgroundColor?: string;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  shadow?: 'none' | 'sm' | 'md' | 'lg';
  align?: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
}

export interface PageSettings {
  width: number; // px @96dpi (794 = A4 portrait)
  height: number; // px @96dpi (1123 = A4 portrait)
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  backgroundColor: string;
  headerElements: DesignerElement[];
  footerElements: DesignerElement[];
}

export interface DesignerPage {
  id: string;
  name: string;
  settings: PageSettings;
  elements: DesignerElement[];
}

export interface DesignerDocument {
  version: 1;
  name: string;
  pages: DesignerPage[];
}

// ─── Group ───
export interface DesignerGroup {
  id: string;
  name: string;
  elementIds: string[];
}

// ─── History ───
export type DesignerSnapshot = {
  document: DesignerDocument;
  groups: DesignerGroup[];
  selection: string[];
  activePageId: string;
};

// ─── Palette component ───
export interface PaletteComponent {
  id: string;
  label: string;
  type: DesignerElementType;
  /** Placeholder-variable bound by default, when applicable. */
  variable?: string;
  defaultText?: string;
  icon?: string;
  iconName?: string;
  color?: string;
  qrValue?: string;
  imageSrc?: string;
  shape?: 'rect' | 'circle';
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  backgroundColor?: string;
  borderWidth?: number;
  borderColor?: string;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  width: number;
  height: number;
}

export interface PaletteCategory {
  id: string;
  label: string;
  components: PaletteComponent[];
}

// ─── Variable groups (mirror of the left panel spec) ───
export interface DesignerVariable {
  key: string;
  label: string;
  group: 'Company' | 'Employee' | 'Attendance' | 'Salary' | 'Payment' | 'Other';
}

// ─── Actions (dispatched to the store) ───
export type DesignerAction =
  | { type: 'LOAD'; snapshot: DesignerSnapshot }
  | { type: 'NEW'; name: string }
  | { type: 'SET_NAME'; name: string }
  | { type: 'ADD_ELEMENT'; element: DesignerElement; pageId?: string }
  | { type: 'UPDATE_ELEMENT'; id: string; patch: Partial<DesignerElement>; pageId?: string }
  /** Bulk updates used during drags — applied WITHOUT pushing history.
   *  Call COMMIT_HISTORY once at gesture end to record a single undo step. */
  | { type: 'UPDATE_ELEMENTS'; patches: { id: string; patch: Partial<DesignerElement> }[]; pageId?: string }
  | { type: 'COMMIT_HISTORY' }
  | { type: 'DELETE_ELEMENTS'; ids: string[]; pageId?: string }
  | { type: 'DUPLICATE_ELEMENTS'; ids: string[]; pageId?: string }
  | { type: 'SELECT'; ids: string[]; additive?: boolean }
  | { type: 'SELECT_ALL'; pageId?: string }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'BRING_FORWARD'; ids: string[]; pageId?: string }
  | { type: 'SEND_BACKWARD'; ids: string[]; pageId?: string }
  | { type: 'GROUP'; ids: string[] }
  | { type: 'UNGROUP'; groupId: string }
  | { type: 'ADD_PAGE'; settings?: Partial<PageSettings> }
  | { type: 'DELETE_PAGE'; pageId: string }
  | { type: 'DUPLICATE_PAGE'; pageId: string }
  | { type: 'SET_ACTIVE_PAGE'; pageId: string }
  | { type: 'UPDATE_PAGE_SETTINGS'; pageId: string; patch: Partial<PageSettings> }
  | { type: 'UPDATE_PAGE_SETTINGS_LIVE'; pageId: string; patch: Partial<PageSettings> }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESET_HISTORY' };

export interface DesignerStore {
  document: DesignerDocument;
  groups: DesignerGroup[];
  selection: string[];
  activePageId: string;
  past: DesignerSnapshot[];
  future: DesignerSnapshot[];
}
