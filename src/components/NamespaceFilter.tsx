import { memo } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  FilterButton,
  VStack,
} from '@azelenets/aegis-design-system';

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
    <Card variant="default">
      <CardHeader title="Namespace Filter" eyebrow="Routing" />
      <CardBody>
        <VStack className="ns-list">
          {allNamespaces.length === 0 ? (
            <p className="muted">No namespaces captured yet.</p>
          ) : (
            allNamespaces.map(ns => (
              <FilterButton
                key={ns}
                active={activeNamespaces.has(ns)}
                label={ns || '(root)'}
                className={activeNamespaces.has(ns) ? 'ns-btn ns-btn--active' : 'ns-btn'}
                onClick={() => onToggle(ns)}
              />
            ))
          )}
        </VStack>
      </CardBody>
    </Card>
  );
});
