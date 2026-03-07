import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { SchemaPropertyDraft, SchemaValueType } from '../types';
import type { SimpleSchema } from '../lib/trace-utils';

export interface SchemaState {
  schema: SimpleSchema | null;
  parseError: string;
}

export interface UseSchemaGuardReturn {
  schemaProperties: SchemaPropertyDraft[];
  schemaModalOpen: boolean;
  setSchemaModalOpen: Dispatch<SetStateAction<boolean>>;
  parsedSchema: SchemaState;
  addSchemaProperty: () => void;
  removeSchemaProperty: (id: string) => void;
  updateSchemaPropertyField: (id: string, field: string) => void;
  updateSchemaPropertyType: (id: string, type: SchemaValueType) => void;
  updateSchemaPropertyRequired: (id: string, required: boolean) => void;
}

const INITIAL_SCHEMA: SchemaPropertyDraft[] = [];

export function useSchemaGuard(): UseSchemaGuardReturn {
  const rowSeqRef = useRef(0);
  const [schemaProperties, setSchemaProperties] = useState<SchemaPropertyDraft[]>(INITIAL_SCHEMA);
  const [schemaModalOpen, setSchemaModalOpen] = useState(false);

  // Close on Escape when modal is open
  useEffect(() => {
    if (!schemaModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSchemaModalOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [schemaModalOpen]);

  const parsedSchema = useMemo((): SchemaState => {
    const required: string[] = [];
    const properties: Record<string, SchemaValueType> = {};

    for (const draft of schemaProperties) {
      const field = draft.field.trim();
      if (!field) continue;
      properties[field] = draft.type;
      if (draft.required) required.push(field);
    }

    if (required.length === 0 && Object.keys(properties).length === 0) {
      return { schema: null, parseError: '' };
    }

    return {
      schema: {
        required: required.length > 0 ? required : undefined,
        properties: Object.keys(properties).length > 0 ? properties : undefined,
      } as SimpleSchema,
      parseError: '',
    };
  }, [schemaProperties]);

  const addSchemaProperty = useCallback(() => {
    const id = `schema-${rowSeqRef.current++}`;
    setSchemaProperties(prev => [...prev, { id, field: '', type: 'string', required: false }]);
  }, []);

  const removeSchemaProperty = useCallback((id: string) => {
    setSchemaProperties(prev => prev.filter(item => item.id !== id));
  }, []);

  const updateSchemaPropertyField = useCallback((id: string, field: string) => {
    setSchemaProperties(prev => prev.map(item => item.id === id ? { ...item, field } : item));
  }, []);

  const updateSchemaPropertyType = useCallback((id: string, type: SchemaValueType) => {
    setSchemaProperties(prev => prev.map(item => item.id === id ? { ...item, type } : item));
  }, []);

  const updateSchemaPropertyRequired = useCallback((id: string, required: boolean) => {
    setSchemaProperties(prev => prev.map(item => item.id === id ? { ...item, required } : item));
  }, []);

  return {
    schemaProperties,
    schemaModalOpen,
    setSchemaModalOpen,
    parsedSchema,
    addSchemaProperty,
    removeSchemaProperty,
    updateSchemaPropertyField,
    updateSchemaPropertyType,
    updateSchemaPropertyRequired,
  };
}
