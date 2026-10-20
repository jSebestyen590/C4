import { Select, type ComboboxItem, type ComboboxItemGroup, type SelectProps } from '@mantine/core';

type Option = ComboboxItem | ComboboxItemGroup<ComboboxItem>;

const labelVon = (data: readonly Option[], value: string | null): string | undefined => {
  for (const o of data) {
    if ('group' in o) {
      const treffer = o.items.find((i) => i.value === value);
      if (treffer) return treffer.label;
    } else if (o.value === value) return o.label;
  }
  return undefined;
};

/**
 * Select for long path labels ("Lager › Regal › Brett 1"): on phones the input cuts the label off
 * at the start of the path, so the chosen label is repeated in full, wrapped, below the field.
 */
export function PfadSelect(props: SelectProps & { data: Option[] }) {
  const label = labelVon(props.data, props.value ?? null);
  return (
    <Select
      {...props}
      description={label}
      inputWrapperOrder={['label', 'input', 'description', 'error']}
    />
  );
}
