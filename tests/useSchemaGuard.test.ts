import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { useSchemaGuard } from '../src/hooks/useSchemaGuard';

describe('useSchemaGuard', () => {
  afterEach(cleanup);

  it('starts with no schema properties', () => {
    const { result } = renderHook(() => useSchemaGuard());
    expect(result.current.schemaProperties).toHaveLength(0);
  });

  it('modal is closed by default', () => {
    const { result } = renderHook(() => useSchemaGuard());
    expect(result.current.schemaModalOpen).toBe(false);
  });

  it('parsedSchema is null when no properties are defined', () => {
    const { result } = renderHook(() => useSchemaGuard());
    expect(result.current.parsedSchema.schema).toBeNull();
  });

  it('parsedSchema computes required fields and properties after adding rows', () => {
    const { result } = renderHook(() => useSchemaGuard());
    act(() => { result.current.addSchemaProperty(); });
    const id = result.current.schemaProperties[0].id;
    act(() => {
      result.current.updateSchemaPropertyField(id, 'requestId');
      result.current.updateSchemaPropertyRequired(id, true);
    });
    const { schema } = result.current.parsedSchema;
    expect(schema).not.toBeNull();
    expect(schema!.required).toContain('requestId');
    expect(schema!.properties?.requestId).toBe('string');
  });

  it('addSchemaProperty appends a new blank row', () => {
    const { result } = renderHook(() => useSchemaGuard());
    const initialCount = result.current.schemaProperties.length;
    act(() => { result.current.addSchemaProperty(); });
    expect(result.current.schemaProperties).toHaveLength(initialCount + 1);
    const last = result.current.schemaProperties.at(-1)!;
    expect(last.field).toBe('');
    expect(last.type).toBe('string');
    expect(last.required).toBe(false);
  });

  it('removeSchemaProperty removes the correct row', () => {
    const { result } = renderHook(() => useSchemaGuard());
    act(() => { result.current.addSchemaProperty(); });
    const targetId = result.current.schemaProperties[0].id;
    act(() => { result.current.removeSchemaProperty(targetId); });
    expect(result.current.schemaProperties).toHaveLength(0);
    expect(result.current.schemaProperties.find(p => p.id === targetId)).toBeUndefined();
  });

  it('updateSchemaPropertyField updates the field name', () => {
    const { result } = renderHook(() => useSchemaGuard());
    act(() => { result.current.addSchemaProperty(); });
    const { id } = result.current.schemaProperties[0];
    act(() => { result.current.updateSchemaPropertyField(id, 'newField'); });
    expect(result.current.schemaProperties[0].field).toBe('newField');
  });

  it('updateSchemaPropertyType updates the type', () => {
    const { result } = renderHook(() => useSchemaGuard());
    act(() => { result.current.addSchemaProperty(); });
    const { id } = result.current.schemaProperties[0];
    act(() => { result.current.updateSchemaPropertyType(id, 'number'); });
    expect(result.current.schemaProperties[0].type).toBe('number');
  });

  it('updateSchemaPropertyRequired toggles required flag', () => {
    const { result } = renderHook(() => useSchemaGuard());
    act(() => { result.current.addSchemaProperty(); });
    const { id } = result.current.schemaProperties[0];
    act(() => { result.current.updateSchemaPropertyRequired(id, true); });
    expect(result.current.schemaProperties[0].required).toBe(true);
  });

  it('setSchemaModalOpen opens and closes modal', () => {
    const { result } = renderHook(() => useSchemaGuard());
    act(() => { result.current.setSchemaModalOpen(true); });
    expect(result.current.schemaModalOpen).toBe(true);
    act(() => { result.current.setSchemaModalOpen(false); });
    expect(result.current.schemaModalOpen).toBe(false);
  });

  it('Escape key closes the modal when open', () => {
    const { result } = renderHook(() => useSchemaGuard());
    act(() => { result.current.setSchemaModalOpen(true); });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.schemaModalOpen).toBe(false);
  });

  it('Escape key has no effect when modal is closed', () => {
    const { result } = renderHook(() => useSchemaGuard());
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.schemaModalOpen).toBe(false);
  });

  it('added properties appear in parsedSchema', () => {
    const { result } = renderHook(() => useSchemaGuard());
    act(() => { result.current.addSchemaProperty(); });
    const newId = result.current.schemaProperties.at(-1)!.id;
    act(() => {
      result.current.updateSchemaPropertyField(newId, 'deviceId');
      result.current.updateSchemaPropertyType(newId, 'string');
      result.current.updateSchemaPropertyRequired(newId, true);
    });
    const { schema } = result.current.parsedSchema;
    expect(schema!.properties?.deviceId).toBe('string');
    expect(schema!.required).toContain('deviceId');
  });
});
