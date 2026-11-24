/** Typed access to shared/content-schema.json (the list of editable texts). */
import rawSchema from '../../shared/content-schema.json';

export interface SchemaField {
  key: string;
  label: string;
  help?: string;
  multiline?: boolean;
  maxLength?: number;
  /** 'copy' = automatic translation copies the English as-is (addresses, example names). */
  translate?: 'copy';
}

export interface SchemaSection {
  id: string;
  label: string;
  description?: string;
  fields: SchemaField[];
}

export interface SchemaPage {
  id: string;
  label: string;
  path: string;
  description: string;
  sections: SchemaSection[];
}

export interface ContentSchema {
  languages: { code: string; name: string }[];
  pages: SchemaPage[];
}

export const contentSchema = rawSchema as ContentSchema;

/** Same limits as server/content.cjs. */
export function maxLengthFor(field: SchemaField) {
  return field.maxLength ?? (field.multiline ? 5000 : 300);
}

export function getPage(id: string | undefined) {
  return contentSchema.pages.find((p) => p.id === id);
}
