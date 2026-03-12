import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SchemaGuardModal } from './SchemaGuardModal';
import type { SchemaPropertyDraft } from '../types';

const SCHEMA: SchemaPropertyDraft[] = [
  { id: 's-0', field: 'requestId', type: 'string', required: true },
  { id: 's-1', field: 'value', type: 'number', required: false },
];

const defaultProps = {
  schemaProperties: SCHEMA,
  onClose: vi.fn(),
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  onUpdateField: vi.fn(),
  onUpdateType: vi.fn(),
  onUpdateRequired: vi.fn(),
};

describe('SchemaGuardModal', () => {
  afterEach(cleanup);

  it('renders dialog with correct aria label', () => {
    render(<SchemaGuardModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Schema Guard Builder')).toBeInTheDocument();
    expect(screen.getByText('Compose a frame and emit it through the current connection.')).toBeInTheDocument();
    expect(screen.getByText('Leave both required fields and properties empty to disable validation.')).toBeInTheDocument();
  });

  it('renders one row per schema property', () => {
    render(<SchemaGuardModal {...defaultProps} />);
    expect(screen.getByDisplayValue('requestId')).toBeInTheDocument();
    expect(screen.getByDisplayValue('value')).toBeInTheDocument();
  });

  it('Close button calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SchemaGuardModal {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('backdrop click calls onClose', () => {
    const onClose = vi.fn();
    render(<SchemaGuardModal {...defaultProps} onClose={onClose} />);
    const backdrop = document.body.querySelector('button[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('clicking inside the modal card does not call onClose', () => {
    const onClose = vi.fn();
    render(<SchemaGuardModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Add Property button calls onAdd', async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<SchemaGuardModal {...defaultProps} onAdd={onAdd} />);
    await user.click(screen.getByRole('button', { name: 'Add Property' }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('Remove button calls onRemove with correct id', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<SchemaGuardModal {...defaultProps} onRemove={onRemove} />);
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    await user.click(removeButtons[0]);
    expect(onRemove).toHaveBeenCalledWith('s-0');
  });

  it('field input change calls onUpdateField', () => {
    const onUpdateField = vi.fn();
    render(<SchemaGuardModal {...defaultProps} onUpdateField={onUpdateField} />);
    fireEvent.change(screen.getByDisplayValue('requestId'), { target: { value: 'newField' } });
    expect(onUpdateField).toHaveBeenCalledWith('s-0', 'newField');
  });

  it('type select change calls onUpdateType', () => {
    const user = userEvent.setup();
    const onUpdateType = vi.fn();
    render(<SchemaGuardModal {...defaultProps} onUpdateType={onUpdateType} />);
    return user.click(screen.getAllByRole('combobox', { name: 'Type' })[0])
      .then(() => user.click(screen.getByRole('option', { name: 'number' })))
      .then(() => {
        expect(onUpdateType).toHaveBeenCalledWith('s-0', 'number');
      });
  });

  it('required checkbox change calls onUpdateRequired', () => {
    const onUpdateRequired = vi.fn();
    render(<SchemaGuardModal {...defaultProps} onUpdateRequired={onUpdateRequired} />);
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(onUpdateRequired).toHaveBeenCalledWith('s-0', false);
  });

  it('shows esc hint text', () => {
    render(<SchemaGuardModal {...defaultProps} />);
    expect(screen.getByText(/Esc/)).toBeInTheDocument();
  });
});
