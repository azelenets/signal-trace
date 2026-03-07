import { memo } from 'react';
import type { SchemaPropertyDraft, SchemaValueType } from '../types';

interface SchemaGuardModalProps {
  schemaProperties: SchemaPropertyDraft[];
  onClose: () => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdateField: (id: string, field: string) => void;
  onUpdateType: (id: string, type: SchemaValueType) => void;
  onUpdateRequired: (id: string, required: boolean) => void;
}

export const SchemaGuardModal = memo(function SchemaGuardModal({
  schemaProperties,
  onClose,
  onAdd,
  onRemove,
  onUpdateField,
  onUpdateType,
  onUpdateRequired,
}: SchemaGuardModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card hud panel"
        role="dialog"
        aria-modal="true"
        aria-label="Schema Guard Builder"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Schema Guard Builder</h2>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="section-body">
          <div className="schema-builder">
            {schemaProperties.map((item) => (
              <div key={item.id} className="schema-row">
                <input
                  value={item.field}
                  onChange={(e) => onUpdateField(item.id, e.target.value)}
                  placeholder="field"
                />
                <select
                  value={item.type}
                  onChange={(e) => onUpdateType(item.id, e.target.value as SchemaValueType)}
                >
                  <option value="string">string</option>
                  <option value="number">number</option>
                  <option value="boolean">boolean</option>
                  <option value="object">object</option>
                  <option value="array">array</option>
                </select>
                <label className="schema-required">
                  <input
                    type="checkbox"
                    checked={item.required}
                    onChange={(e) => onUpdateRequired(item.id, e.target.checked)}
                  />
                  Required
                </label>
                <button onClick={() => onRemove(item.id)}>Remove</button>
              </div>
            ))}
          </div>
          <div className="row">
            <button onClick={onAdd}>Add Property</button>
          </div>
          <p className="muted">Press `Esc` or click outside to close.</p>
        </div>
      </div>
    </div>
  );
});
