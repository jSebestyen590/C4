import {
  Autocomplete,
  Button,
  Checkbox,
  Chip,
  createTheme,
  FileInput,
  MultiSelect,
  NumberInput,
  PasswordInput,
  Select,
  Textarea,
  TagsInput,
  TextInput,
} from '@mantine/core';

// Mobile first: "md" inputs/buttons are 42px tall (our minimum tap target) with a 16px font (iOS Safari zooms
// into inputs with a smaller font on focus).
export const theme = createTheme({
  primaryColor: 'indigo',
  defaultRadius: 'md',
  components: {
    Button: Button.extend({ defaultProps: { size: 'md' } }),
    TextInput: TextInput.extend({ defaultProps: { size: 'md' } }),
    PasswordInput: PasswordInput.extend({ defaultProps: { size: 'md' } }),
    Textarea: Textarea.extend({ defaultProps: { size: 'md' } }),
    FileInput: FileInput.extend({ defaultProps: { size: 'md' } }),
    // Selects are not free text: stop iOS from offering AutoFill suggestions above the keyboard.
    // No opening on (keyboard) focus: Enter then moves to the next field instead of picking the
    // highlighted option; a click or typing still opens the dropdown.
    Select: Select.extend({
      defaultProps: { size: 'md', autoComplete: 'off', inputMode: 'none', openOnFocus: false },
    }),
    Autocomplete: Autocomplete.extend({ defaultProps: { size: 'md' } }),
    NumberInput: NumberInput.extend({ defaultProps: { size: 'md' } }),
    MultiSelect: MultiSelect.extend({ defaultProps: { size: 'md', autoComplete: 'off' } }),
    TagsInput: TagsInput.extend({ defaultProps: { size: 'md' } }),
    Checkbox: Checkbox.extend({ defaultProps: { size: 'md' } }),
    Chip: Chip.extend({ defaultProps: { size: 'md' } }),
  },
});
