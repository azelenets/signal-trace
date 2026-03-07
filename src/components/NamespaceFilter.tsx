import { memo } from 'react';

interface NamespaceFilterProps {
  allNamespaces: string[];
  activeNamespaces: Set<string>;
  onToggle: (ns: string) => void;
}

export const NamespaceFilter = memo(function NamespaceFilter({
  allNamespaces,
  activeNamespaces,
  onToggle,
}: NamespaceFilterProps) {
  return (
    <details open>
      <summary>Namespace Filter</summary>
      <div className="section-body">
        <div className="ns-list">
          {allNamespaces.length === 0 ? (
            <p className="muted">No namespaces captured yet.</p>
          ) : (
            allNamespaces.map(ns => (
              <button
                key={ns}
                className={`ns-btn${activeNamespaces.has(ns) ? ' ns-btn--active' : ''}`}
                onClick={() => onToggle(ns)}
              >
                {ns || '(root)'}
              </button>
            ))
          )}
        </div>
      </div>
    </details>
  );
});
