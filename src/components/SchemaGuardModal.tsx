import { memo } from 'react';
import {
  Button,
  FormRow,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  Toggle,
} from '@azelenets/aegis-design-system';
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
    <Modal
      open
      onClose={onClose}
      size="xl"
      variant="primary"
      aria-label="Schema Guard Builder"
    >
      <ModalHeader title="Schema Guard Builder" eyebrow="Validation" onClose={onClose} />
      <ModalBody>
        <div className="section-body">
          <p className="muted">Compose a frame and emit it through the current connection.</p>
          <p className="muted">
            Leave both required fields and properties empty to disable validation.
          </p>
          <div className="schema-builder">
            {schemaProperties.map((item) => (
              <div key={item.id} className="schema-row">
                <Input
                  label="Field"
                  value={item.field}
                  onChange={(e) => onUpdateField(item.id, e.target.value)}
                  placeholder="field"
                />
                <Select
                  label="Type"
                  value={item.type}
                  onChange={(value) => onUpdateType(item.id, value as SchemaValueType)}
                  options={[
                    { value: 'string', label: 'string' },
                    { value: 'number', label: 'number' },
                    { value: 'boolean', label: 'boolean' },
                    { value: 'object', label: 'object' },
                    { value: 'array', label: 'array' },
                  ]}
                />
                <Toggle
                  label="Required"
                  checked={item.required}
                  size="lg"
                  className="pb-2"
                  onChange={(e) => onUpdateRequired(item.id, e.target.checked)}
                />
                <Button type="button" variant="danger" size="lg" onClick={() => onRemove(item.id)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <FormRow cols={1}>
            <Button type="button" variant="primary" onClick={onAdd}>Add Property</Button>
          </FormRow>
          <p className="muted">Press `Esc` or click outside to close.</p>
        </div>
      </ModalBody>
      <ModalFooter align="right">
        <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
      </ModalFooter>
    </Modal>
  );
});
